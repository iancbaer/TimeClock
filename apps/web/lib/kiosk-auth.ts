import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { HttpError } from "./http";
import { failedAuthenticationGuard, resetAuthenticationRateLimitsForTests } from "./rate-limit";
import { pinLookup, pinMatches } from "./employee-pin";

const SESSION_ISSUER = "timeclock";
const SESSION_AUDIENCE = "timeclock-kiosk";
const OFFLINE_AUDIENCE = "timeclock-offline-punch";

function sessionSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function authenticateEmployeePin(request: Request, pin: string) {
  const guard = failedAuthenticationGuard(request, {
    namespace: "worker-pin",
    failureLimit: 20,
    windowMs: 60 * 1000,
    blockMs: 60 * 1000,
    message: (seconds) => `Too many unsuccessful PIN attempts. Wait ${seconds} seconds, then try again.`,
    code: "EMPLOYEE_PIN_RATE_LIMITED",
  });
  guard.enforce();
  const lookup = pinLookup(pin);
  let employee = await prisma.employee.findUnique({ where: { clockCodeLookup: lookup } });
  let valid = Boolean(employee?.clockCodeHash && await pinMatches(pin, employee.clockCodeHash));

  // Transitional compatibility for existing installations whose 1xxx IDs have not yet been rotated.
  if (!employee) {
    const legacy = await prisma.employee.findUnique({ where: { employeeNumber: pin } });
    if (legacy && !legacy.clockCodeHash) {
      employee = legacy;
      valid = true;
    }
  }
  if (!employee?.active || !valid) {
    guard.fail();
    throw new HttpError(401, "That PIN was not recognized.", "INVALID_EMPLOYEE_PIN");
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

export async function createOfflinePunchSession(employeeId: string): Promise<string> {
  return new SignJWT({ scope: "offline-punch" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(OFFLINE_AUDIENCE)
    .setSubject(employeeId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret());
}

export async function requireOfflinePunchSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Reconnect and enter your PIN before syncing saved punches.", "OFFLINE_SESSION_REQUIRED");
  try {
    const verified = await jwtVerify(authorization.slice(7), sessionSecret(), { issuer: SESSION_ISSUER, audience: OFFLINE_AUDIENCE });
    if (!verified.payload.sub || verified.payload.scope !== "offline-punch") throw new Error("Invalid offline token");
    const employee = await prisma.employee.findUnique({ where: { id: verified.payload.sub } });
    if (!employee?.active) throw new Error("Inactive employee");
    return employee;
  } catch {
    throw new HttpError(401, "Reconnect and enter your PIN before syncing saved punches.", "OFFLINE_SESSION_REQUIRED");
  }
}

export async function requireKioskSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Enter your PIN again.", "KIOSK_SESSION_REQUIRED");
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
    throw new HttpError(401, "Your session ended. Enter your PIN again.", "KIOSK_SESSION_REQUIRED");
  }
}

export function resetEmployeeIdRateLimitForTests(): void {
  resetAuthenticationRateLimitsForTests();
}
