# Security and privacy model

## Privacy posture

Nanshe is a shared worker kiosk, not an employee-surveillance product. It captures the minimum data needed for accurate time records and corrections: employee identity, server-timed work/meal events, bounded device label, and worker explanations. It does not capture GPS, photos, biometrics, continuous activity, keystrokes, or entered failed clock codes.

The worker screen hides Steward, reveals a worker’s name/recent record only after authentication, and returns to the masked code screen after an action or one minute of inactivity.

## Private clock codes

- The official `1xxx` employee number is a visible record identifier, never a sign-in value. Sequential numbers do not reduce authentication strength because they are not accepted by the authentication API.
- Codes are 6–10 numeric digits and must be unique.
- Plaintext exists only transiently in the active keypad state and HTTPS request body. It is cleared immediately after the authentication response and never written to local storage, cookies, logs, audit metadata, CSV, or reports.
- PostgreSQL stores a unique HMAC-SHA-256 lookup derived with `CLOCK_CODE_PEPPER` and a separate bcrypt cost-12 verifier.
- The HMAC enables one-record lookup and database uniqueness without a plaintext public employee number. Bcrypt adds a slow verification step. A stolen database alone is harder to enumerate without the separately stored pepper.
- Successful authentication returns a signed 10-minute bearer token kept only in application memory. Ordinary punch/correction calls never resend the code.
- Eight failed worker attempts from one derived network source within five minutes trigger a one-minute block. Six failed Steward attempts trigger a five-minute block. The application stores only a transient hash of the source, not failed codes, emails, or passwords.

Tradeoff: numeric codes are easier on a shared tablet but weaker than long passwords. The current in-memory limiter is appropriate only for a small, single-instance deployment. It resets on process restart, trusts proxy IP headers as configured by the deployment, and is not shared between replicas. Production internet exposure should add reverse-proxy or shared-store throttling, monitoring, and alerting without logging submitted secrets.

## Other implemented controls

- bcrypt-protected Steward passwords and signed HTTP-only, SameSite-strict admin cookies;
- server-side timestamps and valid-state enforcement;
- serializable per-employee transactions and idempotency keys;
- immutable original punches, append-only revisions, and audit events;
- strict Capacitor CORS allowlist and HTTPS-only remote service configuration;
- generic failed-authentication messages and no secret fields in API responses;
- no public self-registration and no payroll banking or government-identification data.

## Current implementation versus recommended production controls

| Area | Implemented now | Recommended production control not bundled |
| --- | --- | --- |
| Transport | Remote kiosk URLs must use HTTPS. | Managed TLS termination, HSTS, certificate monitoring. |
| Code throttling | Single-process source-based limiter. | Shared durable limiter/WAF rules and alerts for multi-instance or public exposure. |
| Secrets | Environment variables; separate authentication secret and code pepper. | Secret manager, rotation procedure, audited access. Changing the pepper requires clock-code rotation. |
| Database | PostgreSQL constraints, transactions, immutable model. | Private network, encrypted storage, least-privilege database roles, database monitoring. |
| Backups | Restore-compatible PostgreSQL model; documented commands. | Scheduled encrypted off-host backups and recurring restore exercises. |
| Android | Bundled kiosk UI; no code storage; debug CI artifact. | Organization signing key, MDM/kiosk mode, OS patch policy, restricted USB/debugging. |
| Steward | Separate route/app and authenticated session. | Network restriction, MFA/SSO, centralized audit review, short admin idle timeout. |
| Record approval | Draft evidence packet and blank attestations. | Explicit period approval/freeze/reopen workflow if operationally required. |

## Logging and incident handling

Do not add request-body logging to kiosk routes. Application errors expose generic responses; unexpected server errors may be logged, but code paths must never include submitted clock codes, authorization tokens, password bodies, or database credential values. If a code may be compromised, rotate it in Steward. If `CLOCK_CODE_PEPPER` or `AUTH_SECRET` may be compromised, rotate the secret under a planned outage; rotating the pepper invalidates clock-code lookups and requires new worker codes.
