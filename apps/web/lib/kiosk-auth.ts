import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { HttpError } from "./http";
import { failedAuthenticationGuard, resetAuthenticationRateLimitsForTests } from "./rate-limit";

const SESSION_ISSUER = "timeclock";
const SESSION_AUDIENCE = "timeclock-kiosk";

function sessionSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function authenticateEmployeeNumber(request: Request, employeeNumber: string) {
  const guard = failedAuthenticationGuard(request, {
    namespace: "worker-employee-id",
    failureLimit: 20,
    windowMs: 60 * 1000,
    blockMs: 60 * 1000,
    message: (seconds) => `Too many unsuccessful ID attempts. Wait ${seconds} seconds, then try again.`,
    code: "EMPLOYEE_ID_RATE_LIMITED",
  });
  guard.enforce();
  const employee = await prisma.employee.findUnique({ where: { employeeNumber } });
  if (!employee?.active) {
    guard.fail();
    throw new HttpError(401, "That employee ID was not recognized.", "INVALID_EMPLOYEE_ID");
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
    throw new HttpError(401, "Enter your employee ID again.", "KIOSK_SESSION_REQUIRED");
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
    throw new HttpError(401, "Your session ended. Enter your employee ID again.", "KIOSK_SESSION_REQUIRED");
  }
}

export function resetEmployeeIdRateLimitForTests(): void {
  resetAuthenticationRateLimitsForTests();
}
