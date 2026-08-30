import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createClockCodeCredentials } from "../lib/clock-code";

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
      data: { name: process.env.ADMIN_NAME ?? "Steward Owner" },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        name: process.env.ADMIN_NAME ?? "Steward Owner",
        passwordHash: await hash(adminPassword, 12),
      },
    });
  }

  if (process.env.SEED_CLOCK_CODE) {
    const existing = await prisma.employee.findUnique({ where: { employeeNumber: "1001" } })
      ?? await prisma.employee.findFirst({
        where: { firstName: "Sample", lastName: "Employee" },
        orderBy: { createdAt: "asc" },
      });
    if (existing) {
      if (!existing.clockCodeHash) {
        const credentials = await createClockCodeCredentials(process.env.SEED_CLOCK_CODE);
        await prisma.employee.update({
          where: { id: existing.id },
          data: {
            employeeNumber: "1001",
            ...credentials,
            legacyEmployeeCode: null,
            legacyPinHash: null,
          },
        });
      }
    } else {
      const credentials = await createClockCodeCredentials(process.env.SEED_CLOCK_CODE);
      await prisma.employee.create({
        data: { employeeNumber: "1001", firstName: "Sample", lastName: "Employee", ...credentials },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
