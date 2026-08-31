import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { nextEmployeeNumber } from "@timeclock/core";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeCreateSchema } from "@/lib/schemas";
import { generateAvailablePin, pinCredential } from "@/lib/employee-pin";

export async function GET() {
  try {
    await requireAdmin();
    const employees = await prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { employeeNumber: "asc" }],
      select: { id: true, employeeNumber: true, firstName: true, lastName: true, active: true, manager: true, clockCodeHash: true, createdAt: true },
    });
    return NextResponse.json({
      employees: employees.map(({ clockCodeHash, ...employee }) => ({ ...employee, hasPin: Boolean(clockCodeHash) })),
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
    const existingNumbers = await prisma.employee.findMany({ select: { employeeNumber: true } });
    const employeeNumber = nextEmployeeNumber(existingNumbers.map((employee) => employee.employeeNumber));
    if (!employeeNumber) throw new HttpError(409, "No employee numbers remain available.");
    const pin = input.pin ?? await generateAvailablePin();
    const credential = await pinCredential(pin);
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: { employeeNumber, firstName: input.firstName, lastName: input.lastName, manager: input.manager, ...credential },
        select: { id: true, employeeNumber: true, firstName: true, lastName: true, active: true, manager: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "EMPLOYEE_CREATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "Employee",
          entityId: created.id,
          metadata: { changedFields: ["employeeNumber", "firstName", "lastName", "manager", "clockCodeHash"] },
        },
      });
      return created;
    });
    return NextResponse.json({ employee, pin }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "That employee PIN is already assigned."));
    }
    return errorResponse(error);
  }
}
