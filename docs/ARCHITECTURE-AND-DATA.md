# Architecture and data reference

This document describes behavior implemented in the current repository. Recommendations that are not built into the application are labeled explicitly.

## System architecture

```text
Nanshe web kiosk ───────────────┐
Nanshe Android/Capacitor kiosk ─┼── HTTPS ── Next.js API ── PostgreSQL
Nanshe Ubuntu worker app ───────┤                │
Steward web/desktop portal ─────┘          derived reports
```

Nanshe is worker-facing. Steward is owner/manager-facing and lives at `/admin`. Both use one central API and PostgreSQL database. Android bundles the Nanshe interface but never embeds company or worker data. Desktop packages are web-service clients, not independent databases.

The server owns time, authentication decisions, valid punch state, original punches, corrections, calculations, and audit events. Clients are untrusted presentation layers.

## Important data flows

### Worker identification and session

1. Nanshe sends one four-digit employee ID to `POST /api/kiosk/session` over HTTPS.
2. The server finds that unique active employee and returns a signed, 10-minute worker-session token plus exactly one allowed next action.
3. The client clears the entered ID and keeps only the token in volatile memory.
4. Punch and correction APIs accept the short-lived bearer token.
5. Nanshe discards the token after a successful action, successful correction request, one minute of inactivity, manual completion, refresh, or app closure.

### Punch capture

1. The authenticated worker chooses one action allowed by the current state.
2. The API locks that employee inside a serializable transaction.
3. The API re-derives valid state from authoritative punches, rejects invalid transitions, assigns server time, and records the punch plus an audit event.
4. A UUID idempotency key prevents a retried request from duplicating a punch.

### Correction and reporting

Workers submit correction requests; they never overwrite punches. A Steward user approves or rejects each request with a reason. Approval appends a `PunchRevision` or creates a specifically sourced missing punch. Reports combine immutable capture, approved revisions, calculation settings, flags, and correction history.

## Table and field dictionary

### `CompanySettings`

| Field | Meaning |
| --- | --- |
| `id` | Singleton settings identity. |
| `companyName` | Organization label shown in Nanshe and reports. |
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
| `employeeNumber` | Unique four-digit employee ID from `1001` through `1999`; accepted by the supervised kiosk as low-friction identification. |
| `firstName`, `lastName` | Display/report identity. |
| `clockCodeLookup`, `clockCodeHash`, `employeeCode`, `pinHash` | Deprecated nullable compatibility columns from earlier prototypes. Current worker APIs and Steward do not use or return them. Remove them only through a reviewed forward migration. |
| `active` | Whether the employee may authenticate. Historical records remain. |
| `createdAt`, `updatedAt` | Employee lifecycle timestamps. |

### `Punch`

| Field | Meaning |
| --- | --- |
| `id` | Immutable punch identity. |
| `employeeId` | Worker who owns the punch. |
| `type` | `WORK_IN` or `WORK_OUT` for current kiosk punches. Historical `MEAL_START` and `MEAL_END` values remain readable. |
| `occurredAt` | Original server timestamp or manager-approved missing-punch time. Never overwritten. |
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

Steward identity, normalized unique email, bcrypt password verifier, and lifecycle timestamps. Admin sessions are signed HTTP-only cookies.

### `AuditEvent`

Append-only actor/action/entity/time metadata for consequential changes. Metadata intentionally excludes password values, submitted IDs, and failed credentials.

## Authority and derived state

- Authoritative: original `Punch`, `PunchRevision`, `CorrectionRequest`, settings, official and internal employee identity, and audit events.
- Derived and rebuildable: daily/week/pay-period totals, flags, effective punch views, CSV, and printed/PDF packets.
- Never inferred silently: missing punch time, meal time, contradictory transitions, or signatures.
