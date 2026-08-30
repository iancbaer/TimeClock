import { allowedPunchTypes } from "@nanshe/core";
import { NextResponse } from "next/server";
import { authenticateEmployee } from "@/lib/employees";
import { errorResponse } from "@/lib/http";
import { effectiveRecentPunches } from "@/lib/punches";
import { credentialsSchema } from "@/lib/schemas";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await request.json());
    const [employee, settings] = await Promise.all([
      authenticateEmployee(input.employeeCode, input.pin),
      getSettings(),
    ]);
    const punches = await effectiveRecentPunches(employee.id, settings.timeZone);
    return NextResponse.json({
      employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName },
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
