# Nanshe

Nanshe is worker-protective timekeeping for a shared Android tablet, Ubuntu desktop, or browser. Its job is simple: preserve an accurate, auditable record so frontline employees can be paid for every hour worked.

Steward is the separate owner portal included in this repository. It reviews corrections, employee records, two-week sheets, settings, exports, and audit events from the same self-hosted service. Steward desktop installers are available for Windows and Ubuntu; they never change the worker-facing Nanshe identity.

The default pay policy is intentionally worker-favorable. Exact work stays intact, and each local day receives enough paid time credit to reach the next 15-minute increment. The credit is on by default and can be disabled in Steward.

## Included

- Nanshe shared-kiosk flow for work in/out and meal start/end
- A correction request on Nanshe’s front page
- Immutable original punches and append-only approved revisions
- Individual 14-day sheets, split into two independent seven-day workweeks
- Exact work, paid time credit, payable regular time, and payable overtime shown separately
- Flags for open shifts, unexpected punches, missing/short/late meals, and conflicting data
- Steward review, employee management, settings, CSV export, printing, and audit events
- PostgreSQL, versioned migrations, server-side timestamps, idempotency, and per-worker locking
- Android APK, Nanshe Ubuntu AppImage/DEB, Steward Windows/Ubuntu packages, browser clients, and Docker deployment

## Calculation contract

Nanshe never changes an original punch. With `EMPLOYEE_FAVOR_DAILY_CEILING`:

1. Exact work comes only from completed work segments.
2. Recorded meal duration is excluded exactly; meal and rest periods are never rounded.
3. Each local day’s exact worked total is rounded up to the next 15-minute increment.
4. The difference is labeled `Paid time credit`, never represented as actual work.
5. Overtime is calculated in each seven-day workweek using the worker-favorable payable total; the two weeks are never averaged.
6. Incomplete or contradictory records are flagged, not guessed.

Example: `7:37 exact` receives `0:08 paid time credit` and becomes `7:45 payable`.

See [the calculation contract](docs/CALCULATION-CONTRACT.md) for invariants and edge cases.

## Washington rounding note

Washington L&I’s current policy permits nearest-quarter-hour rounding under the seven-minute rule only when it works both directions and does not underpay workers over time. It requires original time records to be retained for at least three years and says meal and rest periods may not be rounded. See L&I’s [Recordkeeping and Access to Payroll Records policy](https://www.lni.wa.gov/workers-rights/_docs/ESD1.pdf), especially sections 10, 11.2, and 11.3.

Nanshe’s default does something different and more favorable: it retains actual punches, pays all calculated actual work, and adds a separately visible daily credit. Paying more than the statutory minimum is generally not the wage-hour problem; failing to record or pay actual work is. The employer should still confirm the credit’s payroll, overtime, benefit-plan, collective-bargaining, and tax treatment with Washington employment counsel and a payroll professional before production use. This repository is software, not legal advice.

Paid rest breaks stay on the clock. Record an unpaid meal only when the worker is fully relieved of duties. See Washington L&I’s [meal and rest break guidance](https://www.lni.wa.gov/workers-rights/workplace-policies/rest-breaks-meal-periods-and-schedules).

## Architecture

```text
Nanshe Android ─┐
Nanshe Ubuntu ──┼── HTTPS ── API ── PostgreSQL
Nanshe browser ─┤              │
Steward portal ─┘        immutable records
```

The database owns raw punches and correction history. Sheets are derived and rebuildable.

## Docker quick start

Requirements: Docker Engine with Docker Compose.

```bash
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `AUTH_SECRET`; set unique database and Steward administrator passwords; then review all seeded employee values before starting:

```bash
docker compose up -d --build
docker compose ps
```

Open Nanshe at `http://127.0.0.1:3000`. Steward is at `http://127.0.0.1:3000/admin`.

Before production, use an HTTPS reverse proxy, strong unique credentials, encrypted and tested backups, restricted database/admin access, and an explicit records-retention policy. Remove the seeded PIN after setup. The app never automatically deletes payroll records.

## Development and verification

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev

npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
```

With a seeded server running, `npm run smoke` exercises Nanshe punches, a correction request and Steward approval, and two-week sheet reconciliation.

## Client builds

### Nanshe for Android

The APK bundles the Nanshe kiosk interface. On first launch, configure the central HTTPS service address. Only that address is stored; worker PINs are not.

```bash
npm run build --workspace @nanshe/kiosk
cd apps/android
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

CI produces a debug APK for testing. A production release needs the organization’s private Android signing key and managed-device policy.

### Nanshe for Ubuntu

```bash
npm run dist --workspace @nanshe/desktop
```

This produces an AppImage and DEB that open the worker clock.

### Steward for Windows and Ubuntu

```bash
npm run dist --workspace @steward/desktop
```

These packages open `/admin`, the separate owner portal. The `Build Nanshe and Steward apps` GitHub workflow produces Nanshe Android/Ubuntu and Steward Windows/Ubuntu artifacts.

## Pay-period approval

Before payroll, review each employee sheet, resolve every accuracy flag and correction, reconcile each week’s regular/overtime total, preserve the final export and database backup, and follow the organization’s worker/manager attestation policy. Nanshe deliberately does not auto-deduct meals, invent punches, or silently repair invalid sequences.

## Security and scope

PINs and administrator passwords are bcrypt-hashed; administrator sessions use HTTP-only same-site cookies; punch submissions use server time and idempotency keys. No real employee data, credentials, or organization-specific records belong in this public repository. Review [SECURITY.md](SECURITY.md) before internet exposure.

This release supports one employer per installation and a 14-day pay period made of two aligned seven-day workweeks. It produces reviewed time data; it is not a payroll processor.

## License

MIT
