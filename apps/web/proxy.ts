import { NextRequest, NextResponse } from "next/server";

function allowedOrigins(): Set<string> {
  return new Set([
    "https://localhost",
    "capacitor://localhost",
    ...(process.env.KIOSK_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  ]);
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = origin ? allowedOrigins().has(origin) : false;
  const response = request.method === "OPTIONS" ? new NextResponse(null, { status: allowed ? 204 : 403 }) : NextResponse.next();
  if (allowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-TimeClock-Device-Key");
    response.headers.set("Access-Control-Max-Age", "86400");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export const config = {
  matcher: ["/api/kiosk/:path*", "/api/health"],
};
