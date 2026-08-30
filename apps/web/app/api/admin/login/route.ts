import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin, createAdminSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const schema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const admin = await authenticateAdmin(request, input.email, input.password);
    await createAdminSession(admin);
    return NextResponse.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
  } catch (error) {
    return errorResponse(error);
  }
}
