# Security and privacy model

## Privacy posture

TimeClock is a shared worker kiosk, not an employee-surveillance product. It captures the minimum data needed for accurate time records and corrections: employee identity, server-timed in/out events, bounded device label, and worker explanations. It does not capture GPS, photos, biometrics, continuous activity, or keystrokes.

The worker screen hides administrative controls, reveals a worker’s name and limited recent record only after PIN entry, and returns to the PIN screen after an action or one minute of inactivity.

## Employee PIN and offline access tradeoff

- Each employee receives a unique random four-digit PIN. TRESA stores a keyed lookup and bcrypt verifier, not the plaintext PIN.
- The entered PIN is cleared after sign-in and is never included in audit metadata or API responses.
- Successful online identification returns a 10-minute worker token and a separate 30-day token that can only upload queued punches.
- To meet the offline requirement, the tablet stores a local PIN verifier/profile and unsent punches. Physical access to the managed tablet therefore remains security-sensitive.
- Twenty unknown PINs from one derived network source within one minute trigger a one-minute block. Six failed administrator attempts trigger a five-minute block. The application does not log submitted PIN or password bodies.

Tradeoff: four digits provide limited entropy, and offline verification prevents TRESA's rate limiter from protecting an unavailable tablet. Use managed kiosk mode, restrict physical settings/USB access, rotate exposed PINs, and never treat this as remote self-service authentication.

## Manager review permission

- Ian Baer's normal employee PIN is `9999`, and his employee record has `manager=true`.
- Ian can punch like any other employee. The same short-lived worker session can open read-only manager review only after the server checks the manager flag.
- The tablet closes manager review after two minutes without activity.
- The review reads current central-database records and exposes all active employees' biweekly punches and totals. It does not modify records, approve corrections, export data, or change settings.

Tradeoff: Ian's known four-digit PIN is not strong authentication. Use this mode only on the supervised, tailnet-restricted kiosk. Full administrative work remains behind TimeClock's password-protected manager session.

## Other implemented controls

- bcrypt-protected TimeClock administrator passwords and signed HTTP-only, SameSite-strict admin cookies;
- TRESA timestamps for connected punches, preserved tablet timestamps for offline punches, and valid-state enforcement;
- serializable per-employee transactions and idempotency keys;
- immutable original punches, append-only revisions, and audit events;
- strict Capacitor CORS allowlist and HTTPS-only remote service configuration;
- generic unknown-ID messages and no password fields in API responses;
- a server-checked manager employee permission for read-only tablet review;
- no public self-registration and no payroll banking or government-identification data.

## Current implementation versus recommended production controls

| Area | Implemented now | Recommended production control not bundled |
| --- | --- | --- |
| Transport | Remote kiosk URLs must use HTTPS. | Managed TLS termination, HSTS, certificate monitoring. |
| ID throttling | Single-process source-based limiter for unknown IDs. | Shared durable limiter/WAF rules and alerts for multi-instance or public exposure. |
| Secrets | Environment variables for session signing, database, and TimeClock administrator credentials. | Secret manager, rotation procedure, audited access. |
| Database | PostgreSQL constraints, transactions, immutable model. | Private network, encrypted storage, least-privilege database roles, database monitoring. |
| Backups | Restore-compatible PostgreSQL model; documented commands. | Scheduled encrypted off-host backups and recurring restore exercises. |
| Android | Bundled kiosk UI; no ID persistence; debug CI artifact. | Organization signing key, MDM/kiosk mode, OS patch policy, restricted USB/debugging. |
| Administration | Authenticated mode within TimeClock. | Network restriction, MFA/SSO, centralized audit review, short admin idle timeout. |
| Record approval | Draft evidence packet and blank attestations. | Explicit period approval/freeze/reopen workflow if operationally required. |

## Logging and incident handling

Do not add request-body logging to kiosk routes. Application errors expose generic responses; unexpected server errors may be logged, but code paths must never include authorization tokens, password bodies, or database credential values. If an employee ID is misused, preserve the audit record, correct the time through the correction workflow, and assign a new unique ID if operationally appropriate. Rotate `AUTH_SECRET` under a planned outage if it may be compromised.
