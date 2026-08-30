import { createHash } from "node:crypto";
import { HttpError } from "./http";

interface FailureBucket {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
}

interface FailurePolicy {
  namespace: string;
  failureLimit: number;
  windowMs: number;
  blockMs: number;
  message: (retryAfterSeconds: number) => string;
  code: string;
}

const globalRateState = globalThis as unknown as { timeclockAuthenticationFailures?: Map<string, FailureBucket> };
const failures = globalRateState.timeclockAuthenticationFailures ?? new Map<string, FailureBucket>();
globalRateState.timeclockAuthenticationFailures = failures;

function clientSource(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local-client";
}

function keyFor(request: Request, namespace: string): string {
  return createHash("sha256").update(`${namespace}\0${clientSource(request)}`).digest("hex");
}

function activeBucket(key: string, windowMs: number, now = Date.now()): FailureBucket {
  const bucket = failures.get(key);
  if (!bucket || now - bucket.windowStartedAt >= windowMs) {
    const fresh = { failures: 0, windowStartedAt: now, blockedUntil: 0 };
    failures.set(key, fresh);
    return fresh;
  }
  return bucket;
}

export function failedAuthenticationGuard(request: Request, policy: FailurePolicy) {
  const key = keyFor(request, policy.namespace);

  return {
    enforce(): void {
      const now = Date.now();
      const bucket = activeBucket(key, policy.windowMs, now);
      if (bucket.blockedUntil > now) {
        const retryAfter = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
        throw new HttpError(429, policy.message(retryAfter), policy.code, { "Retry-After": String(retryAfter) });
      }
    },
    fail(): void {
      const bucket = activeBucket(key, policy.windowMs);
      bucket.failures += 1;
      if (bucket.failures >= policy.failureLimit) bucket.blockedUntil = Date.now() + policy.blockMs;
    },
    succeed(): void {
      failures.delete(key);
    },
  };
}

export function resetAuthenticationRateLimitsForTests(): void {
  failures.clear();
}
