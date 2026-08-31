# Architecture audit

Audit date: 2026-08-30. Scope: current repository architecture, data model, API boundaries, security controls, calculation/reporting structure, container lifecycle, and a ten-worker single-employer hosting target.

## Outcome

The structure is coherent for a controlled pilot and small-employer production after the production gates below are completed. It is not yet a complete payroll control environment: managed hosting, real identity setup, backups, monitoring, access ownership, and an operational reconciliation process remain deployment responsibilities.

The strongest architectural property is that capture evidence and calculation views are separate: original punches remain intact while corrections, credits, flags, and reports are derived explicitly. The most consequential defects found in this pass—report-boundary selection and credential mutation on startup—were corrected.

## Code structure

```text
packages/core        deterministic state, pay-period, daily, and overtime rules
apps/web/lib         service-domain workflows, authentication, persistence, reports
apps/web/app/api     HTTP adapters; validation and authorization boundaries
apps/web/components  TimeClock worker and manager presentation
apps/kiosk           bundled TimeClock interface used by Capacitor
apps/android         Android packaging and native policy
apps/timeclock-desktop  TimeClock desktop shell
apps/web/prisma      authoritative schema and forward-only migrations
scripts              verification, backup/restore, and synthetic provisioning tools
docs                 design, calculation, security, evidence, and operations contracts
```

## Findings

| Priority | Finding | Disposition in this pass |
| --- | --- | --- |
| High | The worker flow was more complex than the supervised ten-worker setting required. | Consolidated entry to the official `1001`–`1999` employee ID and documented that it is convenient identification, not strong authentication. |
| High | Multiple visible punch choices could let workers request contradictory state. | Reduced the current kiosk state machine to strict alternating `WORK_IN`/`WORK_OUT`; the server rechecks and rejects in/in or out/out even if a client is stale. |
| High | An approved revision moved across a report query boundary could be omitted. | Query now considers original and revised effective time, filters by final effective time, then sorts the effective result. |
| High | Container startup ran migrations and seed logic every time; seed rotated admin/worker credentials. | Runtime startup is read-only with respect to schema/seed. Compose and Render perform one-shot predeploy migration/initialization; seed no longer rotates existing credentials. |
| High | Administrator sign-in had no application throttle. | Added source-derived failed-attempt throttling, dummy-hash timing behavior, generic responses, and smoke coverage. |
| Medium | Infrastructure was described but not reproducible for a public managed host. | Added a Render Blueprint with one web instance, private managed PostgreSQL, generated secrets, health routing, and predeploy migration. |
| Medium | Container ran as root. | Runtime now uses an unprivileged `timeclock` user and handles `SIGTERM`. |
| Medium | Identity was absent from report exports and manager lists. | Official number now appears after worker authentication, in TimeClock manager views, time sheets, corrections, and CSV; internal IDs remain evidence-only. |
| Medium | Health reported only a generic status. | Readiness now distinguishes service version and database readiness without disclosing credentials or topology. |
| Medium | The live clock could render a different second on the server and browser, causing a hydration error. | Initial render now uses a stable placeholder and starts the client clock after hydration; tablet browser verification is console-clean. |
| Medium | Design intent was scattered across feature documentation. | Added a semantic design definition, glossary, boundaries, failure behavior, decision reasons, and operating scorecard. |

## Remaining risks

| Risk | Why it matters | Production treatment |
| --- | --- | --- |
| Process-local throttling | Restart resets counters; multiple replicas do not share them. | Keep one instance for the ten-worker deployment, add platform/WAF controls, and move to a shared limiter before scaling. |
| Application-enforced immutability | A privileged database operator can still alter rows. | Restrict database roles, monitor privileged access, preserve backups, and consider database-level append-only controls or external audit anchoring. |
| Current-setting historical recalculation | An old period recalculates under today’s settings. | Reconcile and retain generated packets now; add explicit approved-period setting snapshots before using the app as the sole final payroll archive. |
| No administrator MFA or role separation | One compromised manager account can resolve corrections and change employee identities. | Restrict manager access and add MFA/SSO and role-based authorization. |
| Predictable worker IDs | A person who knows another ID can open that worker’s limited kiosk session and attempt the valid action. | Accept only for the supervised kiosk described by the employer; use private PINs or badges if the context changes. |
| No bundled monitoring/restore automation | A backup claim is unproven until a restore works. | Enable platform alerts and paid database recovery, schedule logical exports, and record isolated restore exercises. |
| Public network exposure | A kiosk API and `/admin` route share the TimeClock service. | Use TLS, device restrictions, a strong administrator password, optional access gateway for `/admin`, and security review. |

## Hosting recommendation

Use the repository’s Render Blueprint for the smallest coherent managed deployment: one paid Docker web service in Oregon and one paid private PostgreSQL instance. One instance intentionally matches the current limiter and ten-worker scale. Run CI before automatic deployment, migrations in the predeploy phase, and application health checks before traffic changes.

Do not use Render’s free database for production time records. Production acceptance requires continuous database recovery capability, an additional logical backup, and a tested restore outside the production database.

## Production acceptance gates

1. Replace all synthetic names, company labels, and TimeClock administrator credentials through an approved private channel; assign IDs `1001` onward.
2. Confirm pay-period anchor, workweek boundary, time zone, and payroll treatment with the responsible payroll/legal reviewers.
3. Protect `/admin`, assign access owners, and document employee ID assignment and misuse response.
4. Deploy one instance with private PostgreSQL, TLS, generated secrets, and passing health checks.
5. Execute and record an isolated backup restore.
6. Run the automated test/build/smoke suite against the candidate deployment.
7. Complete one parallel pay-period reconciliation against the existing payroll method before relying on TimeClock as the primary record.
8. Establish monitoring, incident ownership, retention, and a controlled procedure for corrections after payroll.
