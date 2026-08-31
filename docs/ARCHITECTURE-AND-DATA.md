# Architecture and data reference

This document describes behavior implemented in the current repository. Recommendations that are not built into the application are labeled explicitly.

## System architecture

```text
TimeClock web kiosk ───────────────────────┐
TimeClock Android kiosk + offline queue ───┼── HTTPS/Tailnet ── Next.js API on TRESA ── PostgreSQL on TRESA
TimeClock manager mode ────────────────────┘                              │
                                                               derived reports
```

TimeClock has worker and manager modes. Authenticated administration lives at `/admin`; both modes use one central API and PostgreSQL database on TRESA. Android bundles the TimeClock interface and keeps only the data needed for offline sign-in plus a durable queue of unsent punches.

TRESA owns the authoritative database, authentication decisions, valid punch state, corrections, calculations, and audit events. Connected punches use TRESA time. Offline punches preserve the tablet's occurrence time and a separate later database receipt time.

## Important data flows

### Worker identification and session

1. TimeClock sends one four-digit employee PIN to `POST /api/kiosk/session` over HTTPS.
2. TRESA verifies the keyed lookup and bcrypt verifier for the active employee, then returns a signed 10-minute worker session, a restricted 30-day offline-punch token, and exactly one allowed next action.
3. The tablet clears the entered PIN and caches a local verifier/profile so that previously synchronized employees can sign in during an outage.
4. Connected punch and correction APIs accept the short-lived worker token. The offline token is accepted only by the offline-punch synchronization route.
5. The visible worker session closes after an action, one minute of inactivity, or manual completion.

### Punch capture

1. The authenticated worker chooses one action allowed by the current state.
2. The API locks that employee inside a serializable transaction.
3. The API re-derives valid state from authoritative punches and rejects invalid transitions. It assigns TRESA time for connected punches or validates and preserves the tablet time for a queued offline punch.
4. A UUID idempotency key prevents a retried request from duplicating a punch.

### Correction and reporting

Workers submit correction requests; they never overwrite punches. An authorized TimeClock administrator approves or rejects each request with a reason. Approval appends a `PunchRevision` or creates a specifically sourced missing punch. Reports combine immutable capture, approved revisions, calculation settings, flags, and correction history.

## Table and field dictionary

### `CompanySettings`

| Field | Meaning |
| --- | --- |
| `id` | Singleton settings identity. |
| `companyName` | Organization label shown in TimeClock and reports. |
| `timeZone` | IANA zone used for display, day boundaries, and pay periods. |
| `payPeriodAnchor` | Known first date of an aligned 14-day period. |
| `workweekStartsOn` | Seven-day workweek start, 1–7. |
| `roundingMode` | Exact pay or worker-favorable daily ceiling credit. |
| `roundingIntervalMinutes` | Currently 15. |
| `createdAt`, `updatedAt` | Settings lifecycle timestamps. |

### `Employee`

| Field | Meaning |
| --- | --- |
| `id` | Stable internal employee identity; never reused. |
| `employeeNumber` | Unique internal record number from `1001` through `1999`; assigned automatically and not used as the kiosk credential. |
| `firstName`, `lastName` | Display/report identity. |
| `clockCodeLookup`, `clockCodeHash` | Keyed PIN lookup plus bcrypt PIN verifier. Neither value reveals or returns the plaintext PIN. |
| `employeeCode`, `pinHash` | Deprecated nullable compatibility columns from earlier prototypes. |
| `manager` | Allows that employee to open read-only biweekly hours after ordinary employee sign-in. |
| `active` | Whether the employee may authenticate. Historical records remain. |
| `createdAt`, `updatedAt` | Employee lifecycle timestamps. |

### `Punch`

| Field | Meaning |
| --- | --- |
| `id` | Immutable punch identity. |
| `employeeId` | Worker who owns the punch. |
| `type` | `WORK_IN` or `WORK_OUT` for current kiosk punches. Historical `MEAL_START` and `MEAL_END` values remain readable. |
| `occurredAt` | Original TRESA timestamp, validated tablet timestamp for a queued offline punch, or manager-approved missing-punch time. Never overwritten. |
| `recordedAt` | Database capture time. |
| `source` | `KIOSK` or `ADMIN_CORRECTION`. |
| `deviceLabel` | Bounded diagnostic client label; not precise tracking. |
| `idempotencyKey` | Unique retry protection for kiosk capture. |
| `correctionRequestId` | Links a manager-created missing punch to its approved request. |

### `PunchRevision`

| Field | Meaning |
| --- | --- |
| `punchId` | Original punch being interpreted. |
| `effectiveOccurredAt`, `effectiveType`, `voided` | Approved effective values; the original remains unchanged. |
| `reason`, `adminId`, `correctionRequestId`, `createdAt` | Who authorized the revision, why, from which request, and when. |

### `CorrectionRequest`

| Field | Meaning |
| --- | --- |
| `employeeId`, `targetPunchId` | Worker and optional original punch. |
| `kind` | Missed punch, wrong time, or other. |
| `requestedType`, `requestedOccurredAt`, `note` | Worker-requested outcome and explanation. |
| `status` | Pending, approved, or rejected. |
| `submittedAt`, `resolvedAt`, `resolvedById`, `resolutionNote` | Complete review history. |

### `AdminUser`

TimeClock administrator identity, normalized unique email, bcrypt password verifier, and lifecycle timestamps. Admin sessions are signed HTTP-only cookies.

### `AuditEvent`

Append-only actor/action/entity/time metadata for consequential changes. Metadata intentionally excludes password values, submitted IDs, and failed credentials.

## Authority and derived state

- Authoritative: original `Punch`, `PunchRevision`, `CorrectionRequest`, settings, official and internal employee identity, and audit events.
- Derived and rebuildable: daily/week/pay-period totals, flags, effective punch views, CSV, and printed/PDF packets.
- Never inferred silently: missing punch time, meal time, contradictory transitions, or signatures.
