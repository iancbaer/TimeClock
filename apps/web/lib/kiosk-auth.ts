import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { clockCodeLookup } from "./clock-code";
import { prisma } from "./db";
import { HttpError } from "./http";

const SESSION_ISSUER = "nanshe";
const SESSION_AUDIENCE = "nanshe-kiosk";
const WINDOW_MS = 5 * 60 * 1000;
const FAILURE_LIMIT = 8;
const BLOCK_MS = 60 * 1000;
const DUMMY_HASH = "$2b$12$1qmj8y1xzSrZKJpjeSaAluuPrKSGIxQCqChM6QF4Y.cwcV9P.KK8e";

interface FailureBucket {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
}

const globalRateState = globalThis as unknown as { nansheCodeFailures?: Map<string, FailureBucket> };
const failures = globalRateState.nansheCodeFailures ?? new Map<string, FailureBucket>();
if (process.env.NODE_ENV !== "production") globalRateState.nansheCodeFailures = failures;

function sessionSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "local-kiosk";
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function activeBucket(key: string, now = Date.now()): FailureBucket {
  const bucket = failures.get(key);
  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS) {
    const fresh = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return bucket;
}

function enforceRateLimit(request: Request): void {
  const now = Date.now();
  const bucket = activeBucket(clientKey(request), now);
  if (bucket.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
    throw new HttpError(
      429,
      `Too many unsuccessful attempts. Wait ${retryAfter} seconds, then try again.`,
      "CLOCK_CODE_RATE_LIMITED",
      { "Retry-After": String(retryAfter) },
    );
  }
}

function recordFailure(request: Request): void {
  const bucket = activeBucket(clientKey(request));
  bucket.failures += 1;
  if (bucket.failures >= FAILURE_LIMIT) bucket.blockedUntil = Date.now() + BLOCK_MS;
}

function clearFailures(request: Request): void {
  failures.delete(clientKey(request));
}

export async function authenticateClockCode(request: Request, code: string) {
  enforceRateLimit(request);
  const lookup = clockCodeLookup(code);
  const employee = await prisma.employee.findUnique({ where: { clockCodeLookup: lookup } });
  const valid = employee?.clockCodeHash
    ? await compare(code, employee.clockCodeHash)
    : await compare(code, DUMMY_HASH).then(() => false);
  if (!employee || !employee.active || !valid) {
    recordFailure(request);
    throw new HttpError(401, "That clock code was not recognized.", "INVALID_CLOCK_CODE");
  }
  clearFailures(request);
  return employee;
}

export async function createKioskSession(employeeId: string): Promise<string> {
  return new SignJWT({ scope: "worker-kiosk" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(employeeId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(sessionSecret());
}

export async function requireKioskSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Enter your clock code again.", "KIOSK_SESSION_REQUIRED");
  }
  try {
    const verified = await jwtVerify(authorization.slice(7), sessionSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (!verified.payload.sub || verified.payload.scope !== "worker-kiosk") throw new Error("Invalid kiosk token");
    const employee = await prisma.employee.findUnique({ where: { id: verified.payload.sub } });
    if (!employee?.active) throw new Error("Inactive employee");
    return employee;
  } catch {
    throw new HttpError(401, "Your private session ended. Enter your clock code again.", "KIOSK_SESSION_REQUIRED");
  }
}

export function resetClockCodeRateLimitForTests(): void {
  failures.clear();
}
