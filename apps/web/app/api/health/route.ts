import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "nanshe", version: "1.0.0", database: "ready" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "nanshe", version: "1.0.0", database: "unavailable" }, { status: 503 });
  }
}
