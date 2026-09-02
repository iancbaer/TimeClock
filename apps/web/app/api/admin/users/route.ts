import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

export async function GET() {
  try {
    const current = await requireAdmin();
    const users = await prisma.adminUser.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, active: true, mustChangePassword: true, createdAt: true },
    });
    return NextResponse.json({ users, currentAdminId: current.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = createSchema.parse(await request.json());
    const temporaryPassword = randomBytes(15).toString("base64url");
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hash(temporaryPassword, 12),
          mustChangePassword: true,
        },
        select: { id: true, name: true, email: true, active: true, mustChangePassword: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "ADMIN_USER_CREATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "AdminUser",
          entityId: created.id,
          metadata: { email: created.email, requiresPasswordChange: true },
        },
      });
      return created;
    });
    return NextResponse.json({ user, temporaryPassword }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "A manager account already uses that email address."));
    }
    return errorResponse(error);
  }
}
