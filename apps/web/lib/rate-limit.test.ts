import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "./http";
import { clientSource, failedAuthenticationGuard, resetAuthenticationRateLimitsForTests } from "./rate-limit";

const policy = {
  namespace: "test",
  failureLimit: 3,
  windowMs: 60_000,
  blockMs: 60_000,
  message: (seconds: number) => `Wait ${seconds} seconds.`,
  code: "TEST_RATE_LIMITED",
};

function requestFrom(forwardedFor?: string): Request {
  return new Request("http://localhost/api/kiosk/session", {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
}

describe("authentication throttling source", () => {
  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    resetAuthenticationRateLimitsForTests();
  });
  afterEach(() => { delete process.env.TRUSTED_PROXY_HOPS; });

  it("ignores forwarded headers when no proxy is trusted", () => {
    expect(clientSource(requestFrom("203.0.113.9"))).toBe("direct");
    expect(clientSource(requestFrom())).toBe("direct");
  });

  it("cannot be bypassed by rotating X-Forwarded-For without a trusted proxy", () => {
    for (let attempt = 0; attempt < policy.failureLimit; attempt += 1) {
      failedAuthenticationGuard(requestFrom(`198.51.100.${attempt}`), policy).fail();
    }
    const blocked = () => failedAuthenticationGuard(requestFrom("198.51.100.250"), policy).enforce();
    expect(blocked).toThrow(HttpError);
  });

  it("uses the address written by the nearest trusted proxy", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(clientSource(requestFrom("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientSource(requestFrom("10.0.0.1, 203.0.113.9"))).toBe("203.0.113.9");
  });

  it("skips client-supplied entries to the left of the trusted proxies", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientSource(requestFrom("spoofed, 203.0.113.9, 10.0.0.2"))).toBe("203.0.113.9");
  });

  it("falls back to the shared bucket when the chain is shorter than the trusted hops", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientSource(requestFrom("203.0.113.9"))).toBe("direct");
    expect(clientSource(requestFrom())).toBe("direct");
  });

  it("throttles separate trusted sources independently", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    for (let attempt = 0; attempt < policy.failureLimit; attempt += 1) {
      failedAuthenticationGuard(requestFrom("203.0.113.9"), policy).fail();
    }
    expect(() => failedAuthenticationGuard(requestFrom("203.0.113.9"), policy).enforce()).toThrow(HttpError);
    expect(() => failedAuthenticationGuard(requestFrom("203.0.113.10"), policy).enforce()).not.toThrow();
  });
});
