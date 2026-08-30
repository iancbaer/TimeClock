import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { nextEmployeeNumber } from "@timeclock/core";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeCreateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    await requireAdmin();
    const employees = await prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { employeeNumber: "asc" }],
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, active: true, createdAt: true },
    });
    return NextResponse.json({
      employees,
      suggestedEmployeeNumber: nextEmployeeNumber(employees.map((employee) => employee.employeeNumber)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = employeeCreateSchema.parse(await request.json());
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: input,
        select: { id: true, employeeNumber: true, firstName: true, lastName: true, active: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "EMPLOYEE_CREATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "Employee",
          entityId: created.id,
          metadata: { changedFields: ["employeeNumber", "firstName", "lastName"] },
        },
      });
      return created;
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "That employee number is already assigned."));
    }
    return errorResponse(error);
  }
}
