import { compare } from "bcryptjs";
import { prisma } from "./db";
import { HttpError } from "./http";

export async function authenticateEmployee(employeeCode: string, pin: string) {
  const employee = await prisma.employee.findUnique({ where: { employeeCode: employeeCode.trim() } });
  if (!employee || !employee.active || !(await compare(pin, employee.pinHash))) {
    throw new HttpError(401, "Employee code or PIN is incorrect.", "INVALID_CREDENTIALS");
  }
  return employee;
}
