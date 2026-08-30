import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/http";
import { employeeUpdateSchema } from "@/lib/schemas";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [admin, { id }] = await Promise.all([requireAdmin(), context.params]);
    const input = employeeUpdateSchema.parse(await request.json());
    const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new HttpError(404, "Employee not found.");
    const { pin, ...data } = input;
    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: { ...data, ...(pin ? { pinHash: await hash(pin, 12) } : {}) },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, active: true },
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
    return errorResponse(error);
  }
}
