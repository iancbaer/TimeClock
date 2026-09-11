import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, createAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin({ allowPasswordChangeRequired: true });
    const input = schema.parse(await request.json());
    if (!await compare(input.currentPassword, admin.passwordHash)) {
      throw new HttpError(401, "The current password is incorrect.", "INVALID_CREDENTIALS");
    }
    if (input.currentPassword === input.newPassword) {
      throw new HttpError(400, "Choose a new password that is different from the temporary password.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      // Compare again under the same lock used by link redemption.
      const locked = await tx.$queryRaw<{passwordHash:string}[]>`SELECT "passwordHash" FROM "AdminUser" WHERE "id"=${admin.id} FOR UPDATE`;
      if (!await compare(input.currentPassword, locked[0].passwordHash)) throw new HttpError(401,"The current password is incorrect.","INVALID_CREDENTIALS");
      const user = await tx.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: await hash(input.newPassword, 12), mustChangePassword: false, sessionVersion:{increment:1} },
      });
      await tx.$executeRaw`UPDATE "AccountLink" SET "usedAt"=NOW() WHERE "adminId"=${admin.id} AND "usedAt" IS NULL`;
      await tx.auditEvent.create({
        data: {
          action: "ADMIN_PASSWORD_CHANGED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "AdminUser",
          entityId: admin.id,
          metadata: {},
        },
      });
      return user;
    });
    await createAdminSession(updated);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
