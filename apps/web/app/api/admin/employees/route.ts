import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeCreateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    await requireAdmin();
    const employees = await prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, employeeCode: true, firstName: true, lastName: true, active: true, createdAt: true },
    });
    return NextResponse.json({ employees });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = employeeCreateSchema.parse(await request.json());
    const { pin, ...employeeFields } = input;
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: { ...employeeFields, pinHash: await hash(pin, 12) },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, active: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "EMPLOYEE_CREATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "Employee",
          entityId: created.id,
          metadata: { employeeCode: created.employeeCode },
        },
      });
      return created;
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "That employee code is already in use."));
    }
    return errorResponse(error);
  }
}
