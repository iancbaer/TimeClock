import { SignJWT, jwtVerify } from "jose";
import { compare } from "bcryptjs";
import { clockCodeLookup } from "./clock-code";
import { prisma } from "./db";
import { HttpError } from "./http";
import { failedAuthenticationGuard, resetAuthenticationRateLimitsForTests } from "./rate-limit";

const SESSION_ISSUER = "nanshe";
const SESSION_AUDIENCE = "nanshe-kiosk";
const DUMMY_HASH = "$2b$12$1qmj8y1xzSrZKJpjeSaAluuPrKSGIxQCqChM6QF4Y.cwcV9P.KK8e";

function sessionSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function authenticateClockCode(request: Request, code: string) {
  const guard = failedAuthenticationGuard(request, {
    namespace: "worker-clock-code",
    failureLimit: 8,
    windowMs: 5 * 60 * 1000,
    blockMs: 60 * 1000,
    message: (seconds) => `Too many unsuccessful attempts. Wait ${seconds} seconds, then try again.`,
    code: "CLOCK_CODE_RATE_LIMITED",
  });
  guard.enforce();
  const lookup = clockCodeLookup(code);
  const employee = await prisma.employee.findUnique({ where: { clockCodeLookup: lookup } });
  const valid = employee?.clockCodeHash
    ? await compare(code, employee.clockCodeHash)
    : await compare(code, DUMMY_HASH).then(() => false);
  if (!employee || !employee.active || !valid) {
    guard.fail();
    throw new HttpError(401, "That clock code was not recognized.", "INVALID_CLOCK_CODE");
  }
  guard.succeed();
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
  resetAuthenticationRateLimitsForTests();
}
