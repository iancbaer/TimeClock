import { DateTime } from "luxon";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

type SettingsDatabase = Prisma.TransactionClient | PrismaClient;

export async function getSettings(db: SettingsDatabase = prisma) {
  const existing = await db.companySettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const monday = DateTime.now().setZone("America/Los_Angeles").startOf("week").toISODate()!;
  return db.companySettings.create({
    data: {
      id: "default",
      companyName: "My Company",
      timeZone: "America/Los_Angeles",
      payPeriodAnchor: new Date(`${monday}T00:00:00.000Z`),
      workweekStartsOn: 1,
      roundingMode: "EMPLOYEE_FAVOR_DAILY_CEILING",
      roundingIntervalMinutes: 15,
    },
  });
}
