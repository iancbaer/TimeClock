import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "PENDING";
    const corrections = await prisma.correctionRequest.findMany({
      where: status === "ALL" ? {} : { status: status as "PENDING" | "APPROVED" | "REJECTED" },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        targetPunch: { select: { id: true, type: true, occurredAt: true } },
        resolvedBy: { select: { name: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ corrections });
  } catch (error) {
    return errorResponse(error);
  }
}
