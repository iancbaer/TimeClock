import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createShift, readSchedule } from "@/lib/scheduling";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return NextResponse.json(await readSchedule(request), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({ shift: await createShift(admin.id, await request.json()) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
