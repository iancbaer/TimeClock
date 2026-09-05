import { NextResponse } from "next/server";
import { requireKioskSession } from "@/lib/kiosk-auth";
import { errorResponse } from "@/lib/http";
import { requestTimeOff } from "@/lib/scheduling";

export async function POST(request: Request) {
  try {
    const employee = await requireKioskSession(request);
    return NextResponse.json({ request: await requestTimeOff(employee.id, await request.json()) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
