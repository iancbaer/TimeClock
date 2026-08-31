import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { pinCredential } from "../lib/employee-pin";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to seed the database.`);
  return value;
}

async function main() {
  const adminEmail = required("ADMIN_EMAIL").trim().toLowerCase();
  const adminPassword = required("ADMIN_PASSWORD");
  if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

  await prisma.companySettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: process.env.COMPANY_NAME ?? "My Company",
      timeZone: "America/Los_Angeles",
      payPeriodAnchor: new Date("2026-08-24T00:00:00.000Z"),
      workweekStartsOn: 1,
      roundingMode: "EMPLOYEE_FAVOR_DAILY_CEILING",
      roundingIntervalMinutes: 15,
    },
  });

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    await prisma.adminUser.update({
      where: { id: existingAdmin.id },
      data: { name: process.env.ADMIN_NAME ?? "TimeClock Manager" },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: process.env.ADMIN_NAME ?? "TimeClock Manager",
        passwordHash: await hash(adminPassword, 12),
      },
    });
  }

  if (process.env.SEED_SYNTHETIC_EMPLOYEE === "true") {
    const existing = await prisma.employee.findUnique({ where: { employeeNumber: "1001" } })
      ?? await prisma.employee.findFirst({
        where: { firstName: "Sample", lastName: "Employee" },
        orderBy: { createdAt: "asc" },
      });
    if (existing) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: { employeeNumber: "1001", legacyEmployeeCode: null, legacyPinHash: null },
      });
    } else {
      await prisma.employee.create({
        data: { employeeNumber: "1001", firstName: "Sample", lastName: "Employee" },
      });
    }
  }

  const realRoster = [
    { employeeNumber: "1001", firstName: "Erwin", lastName: "Altman", pin: "7380", manager: false },
    { employeeNumber: "1002", firstName: "Araceli", lastName: "Cedeno-Cortez", pin: "2063", manager: false },
    { employeeNumber: "1003", firstName: "Taimane", lastName: "Fanene", pin: "0505", manager: false },
    { employeeNumber: "1004", firstName: "Tua", lastName: "Fanene", pin: "3396", manager: false },
    { employeeNumber: "1005", firstName: "David", lastName: "Feeder", pin: "6766", manager: false },
    { employeeNumber: "1006", firstName: "Carl", lastName: "Foreman", pin: "6084", manager: false },
    { employeeNumber: "1007", firstName: "Jason", lastName: "Howard", pin: "7730", manager: false },
    { employeeNumber: "1008", firstName: "Steven", lastName: "Schiller", pin: "1778", manager: false },
    { employeeNumber: "1009", firstName: "Autry", lastName: "Stills", pin: "5728", manager: false },
    { employeeNumber: "1010", firstName: "Willow", lastName: "Goldsmith", pin: "0382", manager: true },
    { employeeNumber: "1011", firstName: "Ian", lastName: "Baer", pin: "9999", manager: true },
  ] as const;

  for (const employee of realRoster) {
    const { pin, ...record } = employee;
    const credential = await pinCredential(pin);
    await prisma.employee.upsert({
      where: { employeeNumber: record.employeeNumber },
      update: { ...record, active: true, ...credential },
      create: { ...record, active: true, ...credential },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
