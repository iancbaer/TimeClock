import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { HttpError } from "./http";

const COOKIE_NAME = "steward-admin";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function authenticateAdmin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!admin || !(await compare(password, admin.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  return admin;
}

export async function createAdminSession(admin: { id: string; email: string; name: string }): Promise<void> {
  const token = await new SignJWT({ email: admin.email, name: admin.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
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

export async function requireAdmin() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) throw new HttpError(401, "Steward sign-in is required.", "AUTH_REQUIRED");
  try {
    const verified = await jwtVerify(token, secret());
    if (!verified.payload.sub) throw new Error("Missing subject");
    const admin = await prisma.adminUser.findUnique({ where: { id: verified.payload.sub } });
    if (!admin) throw new Error("Unknown Steward user");
    return admin;
  } catch {
    throw new HttpError(401, "Your Steward session has expired.", "AUTH_REQUIRED");
  }
}
