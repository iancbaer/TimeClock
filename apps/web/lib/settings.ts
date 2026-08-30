import { DateTime } from "luxon";
import { prisma } from "./db";

export async function getSettings() {
  const existing = await prisma.companySettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const monday = DateTime.now().setZone("America/Los_Angeles").startOf("week").toISODate()!;
  return prisma.companySettings.create({
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
