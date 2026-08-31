import { allowedPunchTypes } from "@timeclock/core";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { createOfflinePunchSession } from "@/lib/kiosk-auth";
import { effectiveRecentPunches } from "@/lib/punches";
import { getSettings } from "@/lib/settings";

export async function GET() {
  try {
    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({
        where: { active: true, offlinePinDigest: { not: null } },
        orderBy: { employeeNumber: "asc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          manager: true,
          offlinePinDigest: true,
        },
      }),
      getSettings(),
    ]);
    const generatedAt = new Date().toISOString();
    const profiles = await Promise.all(employees.map(async (employee) => {
      const punches = await effectiveRecentPunches(employee.id, settings.timeZone);
      return {
        profileKey: employee.offlinePinDigest!,
        session: {
          employee: {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            manager: employee.manager,
          },
          sessionToken: "",
          offlineToken: await createOfflinePunchSession(employee.id),
          offline: true,
          companyName: settings.companyName,
          timeZone: settings.timeZone,
          serverNow: generatedAt,
          allowedPunchTypes: allowedPunchTypes(punches),
          recentPunches: punches.slice(-12).reverse(),
        },
      };
    }));
    return NextResponse.json(
      { generatedAt, profiles },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
