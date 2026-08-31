import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeUpdateSchema } from "@/lib/schemas";
import { pinCredential } from "@/lib/employee-pin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }] = await Promise.all([requireAdmin(), context.params]);
    const input = employeeUpdateSchema.parse(await request.json());
    const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Employee not found.");
    const { pin, ...changes } = input;
    const credential = pin ? await pinCredential(pin) : {};
    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { ...changes, ...credential },
        select: { id: true, employeeNumber: true, firstName: true, lastName: true, active: true, manager: true },
      });
      await tx.auditEvent.create({
        data: {
          action: "EMPLOYEE_UPDATED",
          actorType: "ADMIN",
          actorId: admin.id,
          entityType: "Employee",
          entityId: id,
          metadata: { changedFields: [...Object.keys(changes), ...(pin ? ["clockCodeHash"] : [])] },
        },
      });
      return updated;
    });
    return NextResponse.json({ employee });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(new HttpError(409, "That employee number or PIN is already assigned."));
    }
    return errorResponse(error);
  }
}
