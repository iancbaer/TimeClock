import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { decideTimeOff } from "@/lib/scheduling";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    return NextResponse.json({ request: await decideTimeOff(admin.id, id, await request.json()) });
  } catch (error) { return errorResponse(error); }
}
