import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    await requireAdmin();
    const [devices, releases] = await Promise.all([
      prisma.kioskDevice.findMany({
        orderBy: [{ active: "desc" }, { label: "asc" }],
        include: { targetRelease: true },
      }),
      prisma.kioskRelease.findMany({ orderBy: { versionCode: "desc" } }),
    ]);
    return NextResponse.json({ devices, releases });
  } catch (error) {
    return errorResponse(error);
  }
}
