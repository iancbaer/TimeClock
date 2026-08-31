import { createHash, createHmac, randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { prisma } from "./db";

const PIN_PATTERN = /^\d{4}$/;
const PIN_HASH_ROUNDS = 12;

function pinSecret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return value;
}

export function pinLookup(pin: string): string {
  if (!PIN_PATTERN.test(pin)) throw new Error("Employee PIN must contain exactly four digits.");
  return createHmac("sha256", pinSecret()).update(`timeclock-employee-pin:${pin}`).digest("hex");
}

export function offlinePinDigest(pin: string): string {
  if (!PIN_PATTERN.test(pin)) throw new Error("Employee PIN must contain exactly four digits.");
  return createHash("sha256").update(`timeclock-local-pin:${pin}`).digest("hex");
}

export async function pinCredential(pin: string) {
  return {
    clockCodeLookup: pinLookup(pin),
    clockCodeHash: await hash(pin, PIN_HASH_ROUNDS),
    offlinePinDigest: offlinePinDigest(pin),
  };
}

export async function pinMatches(pin: string, pinHash: string): Promise<boolean> {
  return compare(pin, pinHash);
}

export async function generateAvailablePin(): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (pin === "9999") continue;
    const existing = await prisma.employee.findUnique({ where: { clockCodeLookup: pinLookup(pin) }, select: { id: true } });
    if (!existing) return pin;
  }
  throw new Error("Could not allocate an available employee PIN.");
}
