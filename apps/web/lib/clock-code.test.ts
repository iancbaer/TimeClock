import { describe, expect, it } from "vitest";
import { clockCodeLookup, createClockCodeCredentials, verifyClockCode } from "./clock-code";

process.env.CLOCK_CODE_PEPPER = "unit-test-clock-code-pepper-with-at-least-32-characters";

describe("private clock-code storage", () => {
  it("creates a deterministic lookup that does not contain the plaintext code", () => {
    const first = clockCodeLookup("731905");
    const second = clockCodeLookup("731905");
    expect(first).toBe(second);
    expect(first).not.toContain("731905");
    expect(first).toHaveLength(64);
  });

  it("uses a slow verifier in addition to the unique lookup", async () => {
    const credentials = await createClockCodeCredentials("731905");
    expect(credentials.clockCodeHash).not.toContain("731905");
    await expect(verifyClockCode("731905", credentials.clockCodeHash)).resolves.toBe(true);
    await expect(verifyClockCode("731906", credentials.clockCodeHash)).resolves.toBe(false);
  });
});
