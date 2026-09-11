import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { requestTimeOff } from "@/lib/scheduling";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { employeeId } = z.object({ employeeId: z.string().min(1) }).parse(body);
    return NextResponse.json({ request: await requestTimeOff(employeeId, body, admin.id) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
