# Calculation contract

This document defines what the Nanshe calculation engine promises. It is deliberately narrower than a general payroll engine.

## Authoritative and derived records

- `Punch.occurredAt` and `Punch.type` are the original employee record and are never overwritten.
- `PunchRevision` is append-only. The newest approved revision supplies the effective time/type while preserving the original.
- A missing approved punch is inserted with source `ADMIN_CORRECTION` and linked to its correction request.
- Time sheets, daily totals, paid time credit, and overtime are derived and rebuildable.
- `AuditEvent` records the actor, action, entity, time, and relevant non-secret metadata.

## Pairing and accuracy

Valid state transitions are:

```text
OFF ── work in ──> WORKING ── meal start ──> MEAL
 ^                    │                         │
 └──── work out ──────┘<────── meal end ───────┘
```

The engine counts only closed work segments. It flags, without guessing:

- an unexpected action for the current state;
- work without a closing clock-out;
- a meal without a meal-end;
- a meal shorter than 30 minutes;
- a meal begun after five elapsed shift hours; and
- a shift longer than five hours without a recorded meal.

Work segments crossing midnight are divided across local calendar days. Stored timestamps are UTC; grouping and display use the configured IANA time zone.

## Worker-favorable paid time credit

With `EMPLOYEE_FAVOR_DAILY_CEILING`:

```text
payable(day) = ceil(exact_work(day) / 15 minutes) × 15 minutes
credit(day)  = payable(day) - exact_work(day)
```

No credit is created for a day with zero exact work. The meal interval is measured exactly and is never rounded. The setting can be changed to `EXACT`, which makes payable time equal exact time and credit zero.

This is characterized in the interface as paid time credit, not an alteration of actual hours worked.

## Weekly overtime

Each 14-day period contains two independent seven-day workweeks. By default the pay-period anchor and workweek start must be the same weekday.

```text
overtime(week) = max(0, payable(week) - 40 hours)
regular(week)  = payable(week) - overtime(week)
```

Using payable time for this threshold favors the employee. An employer needing a different treatment must obtain payroll/legal guidance and change the calculation contract with versioned tests and migration notes.

## Invariants

1. `payable >= exact` in employee-favorable mode.
2. `payable = exact` in exact mode.
3. `credit = payable - exact` and cannot be negative.
4. `regular + overtime = payable` in each workweek and pay period.
5. The two workweeks are not averaged.
6. A correction cannot erase the original punch.
7. Repeating a successful punch request with the same idempotency key cannot create a second punch.
8. Ambiguous or incomplete records produce a visible review flag instead of an invented duration.
