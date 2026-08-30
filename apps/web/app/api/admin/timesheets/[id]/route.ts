import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { buildEmployeeTimesheet } from "@/lib/timesheets";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const periodStart = new URL(request.url).searchParams.get("periodStart") ?? undefined;
    return NextResponse.json(await buildEmployeeTimesheet(id, periodStart));
  } catch (error) {
    return errorResponse(error);
  }
}
