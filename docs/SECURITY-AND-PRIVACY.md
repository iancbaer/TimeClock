# Security and privacy model

## Privacy posture

Nanshe is a shared worker kiosk, not an employee-surveillance product. It captures the minimum data needed for accurate time records and corrections: employee identity, server-timed in/out events, bounded device label, and worker explanations. It does not capture GPS, photos, biometrics, continuous activity, or keystrokes.

The worker screen hides Steward, reveals a worker’s name and limited recent record only after ID entry, and returns to the ID screen after an action or one minute of inactivity.

## Employee ID access tradeoff

- The official `1xxx` employee number is both the displayed record identifier and the value accepted at the supervised kiosk.
- IDs are unique and intentionally easy to enter. They are not passwords and should not be described as strong authentication.
- The entered ID is cleared after the session response and is not written to device storage or audit metadata. It necessarily appears on the worker’s own reports and manager records.
- Successful identification returns a signed 10-minute bearer token kept only in application memory. Ordinary punch/correction calls use that token.
- Twenty unknown IDs from one derived network source within one minute trigger a one-minute block. Six failed Steward attempts trigger a five-minute block. The application does not log submitted ID or password bodies.

Tradeoff: anyone who knows or guesses an employee ID can open that employee’s brief kiosk view and attempt the currently valid action. This design is appropriate only because the intended installation is a controlled, camera-observed workplace kiosk and the employer explicitly prioritized simplicity over private worker credentials. If the deployment becomes unsupervised, remote, larger, or more privacy-sensitive, add a private PIN, badge, or equivalent second factor. The current in-memory limiter resets on process restart and is not shared between replicas.

## Other implemented controls

- bcrypt-protected Steward passwords and signed HTTP-only, SameSite-strict admin cookies;
- server-side timestamps and valid-state enforcement;
- serializable per-employee transactions and idempotency keys;
- immutable original punches, append-only revisions, and audit events;
- strict Capacitor CORS allowlist and HTTPS-only remote service configuration;
- generic unknown-ID messages and no password fields in API responses;
- no public self-registration and no payroll banking or government-identification data.

## Current implementation versus recommended production controls

| Area | Implemented now | Recommended production control not bundled |
| --- | --- | --- |
| Transport | Remote kiosk URLs must use HTTPS. | Managed TLS termination, HSTS, certificate monitoring. |
| ID throttling | Single-process source-based limiter for unknown IDs. | Shared durable limiter/WAF rules and alerts for multi-instance or public exposure. |
| Secrets | Environment variables for session signing, database, and Steward credentials. | Secret manager, rotation procedure, audited access. |
| Database | PostgreSQL constraints, transactions, immutable model. | Private network, encrypted storage, least-privilege database roles, database monitoring. |
| Backups | Restore-compatible PostgreSQL model; documented commands. | Scheduled encrypted off-host backups and recurring restore exercises. |
| Android | Bundled kiosk UI; no ID persistence; debug CI artifact. | Organization signing key, MDM/kiosk mode, OS patch policy, restricted USB/debugging. |
| Steward | Separate route/app and authenticated session. | Network restriction, MFA/SSO, centralized audit review, short admin idle timeout. |
| Record approval | Draft evidence packet and blank attestations. | Explicit period approval/freeze/reopen workflow if operationally required. |

## Logging and incident handling

Do not add request-body logging to kiosk routes. Application errors expose generic responses; unexpected server errors may be logged, but code paths must never include authorization tokens, password bodies, or database credential values. If an employee ID is misused, preserve the audit record, correct the time through the correction workflow, and assign a new unique ID if operationally appropriate. Rotate `AUTH_SECRET` under a planned outage if it may be compromised.
