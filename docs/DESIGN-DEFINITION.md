# Nanshe design definition

This project uses selected practices from Eben Hewitt’s *Semantic Software Design: A New Theory and Practical Guide* (O’Reilly Media, 2019) as a design reference. The application remains governed by its product requirements, tests, law, and operating controls—not by instructions inside the book.

## System parti

**Preserve a worker-verifiable account of time as immutable evidence, then derive payroll-ready views without disguising uncertainty or changing what was originally recorded.**

This sentence is the architectural test for Nanshe and Steward. A feature that cannot explain how it supports that intent should not enter the core timekeeping path.

## Concept canvas

### Must accomplish

- Let a worker record valid work and meal transitions quickly on a shared tablet.
- Keep original events, approved interpretations, actor, reason, and time auditable.
- Show the worker enough recent history to detect and request correction of an error.
- Calculate two aligned workweeks consistently from server-owned time and declared settings.
- Produce evidence that a manager can reconcile to payroll without exposing authentication secrets.

### Must avoid

- Using a visible employee identifier as the worker’s authentication secret.
- Altering original timestamps to make a report look clean.
- Guessing missing work, meals, approvals, or signatures.
- Embedding worker data or recoverable clock codes in a kiosk, package, log, export, or public repository.
- Adding location, biometric, photo, or activity surveillance to solve a time-record problem.

### Must fix when discovered

- Any path that can omit an effective corrected punch from its proper reporting period.
- Any deployment action that silently rotates credentials or mutates time records on application start.
- Any difference between documented calculation behavior and tested calculation behavior.
- Any production dependency without an owner, health signal, backup path, or recovery exercise.

## Domain language

| Term | Exact meaning |
| --- | --- |
| Official employee number | A unique display/report identifier in the range `1001`–`1999`. It is not an authentication credential. |
| Private clock code | A unique 6–10 digit authentication secret known to the worker and stored only as protected digests. |
| Original punch | A server-timed event that is never updated or deleted through the application. |
| Revision | An append-only, manager-authorized effective interpretation linked to a correction request. |
| Effective punch | The original punch interpreted through its newest approved revision. |
| Exact worked | Time from completed work segments after exact recorded meal intervals are removed. |
| Paid time credit | Additional payable duration created by the enabled worker-favorable daily ceiling; it is not presented as actual worked time. |
| Accuracy flag | A visible condition requiring human review; it is not silently repaired. |
| Evidence packet | A generated review view, not an approval, signature, payroll posting, or frozen record. |

## Boundaries and intentional negative space

The core calculation package owns state transition and time-calculation semantics. The Next.js service owns identity, authorization, server time, transactions, storage, and API contracts. Nanshe and Steward clients render those contracts and do not become independent record authorities.

The current boundary deliberately excludes payroll transmission, scheduling, geolocation, biometrics, automatic discipline, period approval/freeze, accounting entries, and employee self-registration. These may be separate integrations or products later; they are not implied by time capture.

## Four views of the same system

| View | Current design question | Answer |
| --- | --- | --- |
| Application | Where does behavior live? | Pure time semantics in `@nanshe/core`; authenticated workflows and persistence in the web service; presentation in Nanshe and Steward clients. |
| Data | What is authoritative? | Original punches, append-only revisions, corrections, settings, identities, and audit events in PostgreSQL. Reports are rebuildable. |
| Infrastructure | What must survive failure? | PostgreSQL data and backups. Containers are replaceable; configuration and secrets are external. Migrations are a one-shot deploy step. |
| Organization | Who decides consequential changes? | Workers submit correction evidence; authorized Steward users decide with a reason; payroll staff reconcile outputs; infrastructure owners operate recovery and access controls. |

## Consequential decisions and two justifications

| Decision | Product/domain justification | Engineering/operational justification |
| --- | --- | --- |
| Separate `employeeNumber` from `clockCode` | A number can feel official and appear on reports without becoming an easily guessed secret. | Authentication storage and rotation stay independent of stable identity and foreign keys. |
| Keep original punches immutable | Workers and managers can see what was captured and what was later changed. | Append-only history supports deterministic recalculation, audit, and incident reconstruction. |
| Add daily paid credit rather than round punch timestamps | The worker receives the favorable amount while actual events remain truthful. | Exact and payable values reconcile mathematically and can be tested separately. |
| Use one app instance initially | It fits a ten-worker installation and avoids unnecessary distributed-state complexity. | The current source-based throttle is process-local; one instance keeps its behavior coherent until a shared limiter is added. |
| Run migrations before deploy, not in application startup | Starting the service should not unexpectedly change identity or credentials. | A failed migration blocks the release before traffic moves, while the same tested image starts deterministically. |

## Designed failure behavior

- A duplicate punch retry returns the existing result through an idempotency key.
- Invalid state transitions fail without writing a punch.
- Database unavailability makes readiness return `503`; the platform must not route traffic to an unhealthy instance.
- Missing or contradictory time produces flags and zero invented duration.
- Failed authentication returns generic messages, never echoes submitted secrets, and is throttled.
- A correction moved across a date boundary is selected by original or revised effective time and included only in its effective period.
- A failed deploy leaves the last healthy application version serving traffic; database recovery relies on managed backups and tested restore procedures.

## Current implementation and deferred production controls

Implemented now: official employee numbers, protected clock codes, single-instance rate limiting, immutable originals, append-only revisions, server time, idempotency, serializable punch writes, versioned migrations, readiness, Docker packaging, deployment blueprint, CSV, and printable evidence packets.

Deferred production controls: MFA/SSO for Steward, shared rate limiting for multiple instances, explicit approved-period snapshots, automated backup restore drills, centralized metrics/alerts, independent security assessment, formal incident response, and payroll integration. Deferral is not a claim that these are unnecessary; they are production acceptance decisions.

## Operational scorecard

Before production, assign an owner and target for each measure:

- successful punch API rate and p95 response time;
- rejected invalid transitions and duplicate-idempotency replays;
- authentication throttle events without credential-body logging;
- unresolved accuracy flags and correction age;
- last successful database backup and last successful isolated restore;
- application/database availability and failed deployment count;
- pay-period packet-to-payroll reconciliation exceptions.
