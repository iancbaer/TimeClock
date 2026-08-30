import { createHmac } from "node:crypto";
import { compare, hash } from "bcryptjs";

export const CLOCK_CODE_PATTERN = /^\d{6,10}$/;

function pepper(): string {
  const value = process.env.CLOCK_CODE_PEPPER;
  if (!value || value.length < 32) {
    throw new Error("CLOCK_CODE_PEPPER must contain at least 32 characters.");
  }
  return value;
}

export function validateClockCode(value: string): string {
  const code = value.trim();
  if (!CLOCK_CODE_PATTERN.test(code)) {
    throw new Error("Clock code must contain 6 to 10 digits.");
  }
  return code;
}

export function clockCodeLookup(value: string): string {
  return createHmac("sha256", pepper()).update(validateClockCode(value), "utf8").digest("hex");
}

export async function createClockCodeCredentials(value: string): Promise<{ clockCodeLookup: string; clockCodeHash: string }> {
  const code = validateClockCode(value);
  return {
    clockCodeLookup: clockCodeLookup(code),
    clockCodeHash: await hash(code, 12),
  };
}

export async function verifyClockCode(value: string, digest: string): Promise<boolean> {
  return compare(validateClockCode(value), digest);
}
