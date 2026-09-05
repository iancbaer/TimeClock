import { NextResponse } from "next/server";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { errorResponse } from "@/lib/http";
import { readSchedule } from "@/lib/scheduling";

export async function GET(request: Request) {
  try {
    const employee = await requireKioskSession(request);
    return NextResponse.json(await readSchedule(request, employee.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
