import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

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

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      name: process.env.ADMIN_NAME ?? "Steward Owner",
      passwordHash: await hash(adminPassword, 12),
    },
    create: {
      email: adminEmail,
      name: process.env.ADMIN_NAME ?? "Steward Owner",
      passwordHash: await hash(adminPassword, 12),
    },
  });

  if (process.env.SEED_EMPLOYEE_CODE && process.env.SEED_EMPLOYEE_PIN) {
    await prisma.employee.upsert({
      where: { employeeCode: process.env.SEED_EMPLOYEE_CODE },
      update: {},
      create: {
        employeeCode: process.env.SEED_EMPLOYEE_CODE,
        firstName: "Sample",
        lastName: "Employee",
        pinHash: await hash(process.env.SEED_EMPLOYEE_PIN, 12),
      },
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
