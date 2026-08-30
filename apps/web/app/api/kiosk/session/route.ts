import { allowedPunchTypes } from "@nanshe/core";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { authenticateEmployeeNumber, createKioskSession } from "@/lib/kiosk-auth";
import { effectiveRecentPunches } from "@/lib/punches";
import { employeeIdSessionSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const input = employeeIdSessionSchema.parse(await request.json());
    const [employee, settings] = await Promise.all([
      authenticateEmployeeNumber(request, input.employeeNumber),
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
