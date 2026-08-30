import { allowedPunchTypes } from "@nanshe/core";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { authenticateClockCode, createKioskSession } from "@/lib/kiosk-auth";
import { effectiveRecentPunches } from "@/lib/punches";
import { clockCodeSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const input = clockCodeSchema.parse(await request.json());
    const [employee, settings] = await Promise.all([
      authenticateClockCode(request, input.clockCode),
      getSettings(),
    ]);
    const punches = await effectiveRecentPunches(employee.id, settings.timeZone);
    return NextResponse.json({
      employee: { id: employee.id, employeeNumber: employee.employeeNumber, firstName: employee.firstName, lastName: employee.lastName },
      sessionToken: await createKioskSession(employee.id),
      companyName: settings.companyName,
      timeZone: settings.timeZone,
      serverNow: new Date().toISOString(),
      allowedPunchTypes: allowedPunchTypes(punches),
      recentPunches: punches.slice(-12).reverse(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
