import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { createClockCodeCredentials } from "@/lib/clock-code";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeUpdateSchema } from "@/lib/schemas";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }] = await Promise.all([requireAdmin(), context.params]);
    const input = employeeUpdateSchema.parse(await request.json());
    const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Employee not found.");
    const { clockCode, ...data } = input;
    const credentials = clockCode ? await createClockCodeCredentials(clockCode) : {};
    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { ...data, ...credentials },
        select: { id: true, firstName: true, lastName: true, active: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "EMPLOYEE_UPDATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "Employee",
          entityId: id,
          metadata: { changedFields: Object.keys(input) },
        },
      });
      return updated;
    });
    return NextResponse.json({ employee });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "That private clock code is already assigned to another employee."));
    }
    return errorResponse(error);
  }
}
