import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { buildManagerReview } from "@/lib/timesheets";

export async function GET(request: Request) {
  try {
    const employee = await requireKioskSession(request);
    if (!employee.manager) throw new HttpError(403, "An Admin Account is required to see employee hours.", "ADMIN_ACCOUNT_REQUIRED");
    const periodStart = new URL(request.url).searchParams.get("periodStart") ?? undefined;
    return NextResponse.json(
      { review: await buildManagerReview(periodStart) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
