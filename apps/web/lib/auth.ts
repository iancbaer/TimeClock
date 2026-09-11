import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { HttpError } from "./http";
import { failedAuthenticationGuard } from "./rate-limit";

const COOKIE_NAME = "timeclock-admin";
const SESSION_ISSUER = "timeclock";
const SESSION_AUDIENCE = "timeclock-admin";
const DUMMY_HASH = "$2b$12$1qmj8y1xzSrZKJpjeSaAluuPrKSGIxQCqChM6QF4Y.cwcV9P.KK8e";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function authenticateAdmin(request: Request, email: string, password: string) {
  const guard = failedAuthenticationGuard(request, {
    namespace: "timeclock-admin-login",
    failureLimit: 6,
    windowMs: 5 * 60 * 1000,
    blockMs: 5 * 60 * 1000,
    message: (seconds) => `Too many unsuccessful sign-in attempts. Wait ${seconds} seconds, then try again.`,
    code: "ADMIN_LOGIN_RATE_LIMITED",
  });
  guard.enforce();
  const admin = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  const valid = admin?.active ? await compare(password, admin.passwordHash) : await compare(password, DUMMY_HASH).then(() => false);
  if (!admin?.active || !valid) {
    guard.fail();
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  guard.succeed();
  return admin;
}

export async function createAdminSession(admin: { id: string; email: string; name: string; mustChangePassword: boolean; sessionVersion: number }): Promise<void> {
  const token = await new SignJWT({ email: admin.email, name: admin.name, mustChangePassword: admin.mustChangePassword, sessionVersion: admin.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

// All restricted areas must use this guard. Database roles, never JWT roles, authorize access.
export async function requireAdmin(options: { allowPasswordChangeRequired?: boolean; allowedRoles?: readonly ("ADMIN" | "GLOBAL_ADMIN")[] } = {}) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) throw new HttpError(401, "TimeClock manager sign-in is required.", "AUTH_REQUIRED");
  try {
    const verified = await jwtVerify(token, secret(), { issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE });
    if (!verified.payload.sub) throw new Error("Missing subject");
    const admin = await prisma.adminUser.findUnique({ where: { id: verified.payload.sub } });
    if (!admin?.active) throw new Error("Unknown or inactive TimeClock administrator");
    if ((verified.payload.sessionVersion ?? 0) !== admin.sessionVersion) throw new Error("Session revoked");
    if (admin.mustChangePassword && !options.allowPasswordChangeRequired) {
      throw new HttpError(403, "Change your temporary password before continuing.", "PASSWORD_CHANGE_REQUIRED");
    }
    if (admin.role !== "GLOBAL_ADMIN" && !(options.allowedRoles ?? ["ADMIN"]).includes(admin.role)) {
      throw new HttpError(403, "This area requires additional administrator access.", "FORBIDDEN");
    }
    return admin;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Your TimeClock manager session has expired.", "AUTH_REQUIRED");
  }
}
