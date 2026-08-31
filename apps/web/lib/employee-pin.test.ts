import { beforeEach, describe, expect, it } from "vitest";
import { offlinePinDigest, pinCredential, pinLookup, pinMatches } from "./employee-pin";

describe("employee PIN protection", () => {
  beforeEach(() => { process.env.AUTH_SECRET = "test-secret-that-is-longer-than-thirty-two-characters"; });

  it("creates a deterministic private lookup without storing the PIN", () => {
    expect(pinLookup("9999")).toBe(pinLookup("9999"));
    expect(pinLookup("9999")).not.toContain("9999");
  });

  it("hashes and verifies a four-digit PIN", async () => {
    const credential = await pinCredential("4827");
    expect(await pinMatches("4827", credential.clockCodeHash)).toBe(true);
    expect(await pinMatches("4828", credential.clockCodeHash)).toBe(false);
    expect(credential.offlinePinDigest).toBe(offlinePinDigest("4827"));
    expect(credential.offlinePinDigest).not.toContain("4827");
  });
});
