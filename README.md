# Nanshe

Nanshe is worker-protective timekeeping for a shared Android tablet, Ubuntu desktop, or browser. It preserves an accurate, auditable record so frontline employees can be paid for every hour worked.

Steward is the separate owner portal in this repository. It manages workers and private clock codes, reviews corrections, prepares two-week evidence packets, exports CSV, and maintains settings. Steward desktop packages are available for Windows and Ubuntu; they never change the worker-facing Nanshe identity.

## Worker experience

- One private 6–10 digit clock code entered through a large masked 3×4 keypad
- No text field or Android software keyboard during ordinary clocking
- Only valid current actions: **Clock in**; **Start meal** and **Clock out**; or **End meal**
- Clear punch confirmation followed by automatic return to the private code screen
- One-minute authenticated idle timeout and manual **Done** action
- Recent time and worker-submitted correction requests inside the private session
- No visible Steward link or everyday server controls on the worker screen

Codes are not employee numbers and are never stored or displayed in plaintext. See [Security and privacy](docs/SECURITY-AND-PRIVACY.md).

## Records and reports

- Immutable original punches and append-only approved revisions
- Server timestamps, valid-state enforcement, idempotency, and per-worker database locking
- Individual 14-day packets split into two independent seven-day workweeks
- Exact time, paid time credit, regular payable time, overtime, flags, and correction history
- Self-explanatory CSV and print/PDF evidence outputs with blank attestation lines
- PostgreSQL, versioned migrations, Docker deployment, Android APK, Nanshe Ubuntu package, and Steward Windows/Ubuntu packages

The printable packet is a draft review record. Printing does not approve, sign, lock, or freeze a period.

## Documentation

- [Architecture, data flows, and table dictionary](docs/ARCHITECTURE-AND-DATA.md)
- [Calculation contract and invariants](docs/CALCULATION-CONTRACT.md)
- [Reports, outputs, and evidentiary purpose](docs/REPORTS-AND-EVIDENCE.md)
- [Manager, kiosk, backup, retention, and deployment guide](docs/OPERATIONS-GUIDE.md)
- [Security and privacy model; current versus recommended controls](docs/SECURITY-AND-PRIVACY.md)
- [Vulnerability and deployment security policy](SECURITY.md)

## Calculation contract

Nanshe never changes an original punch. With the default `EMPLOYEE_FAVOR_DAILY_CEILING` mode:

1. Exact work comes only from completed work segments.
2. Recorded meal duration is excluded exactly; meal and rest periods are never rounded.
3. Each local day’s exact worked total is rounded up to the next 15-minute increment.
4. The difference is labeled `Paid time credit`, never represented as actual work.
5. Overtime is calculated independently in each seven-day workweek using worker-favorable payable time.
6. Incomplete or contradictory records are flagged, not guessed.

Example: `7:37 exact` receives `0:08 paid time credit` and becomes `7:45 payable`.

## Washington note

Washington L&I’s current policy permits nearest-quarter-hour rounding under the seven-minute rule only when it works both directions and does not underpay workers over time. It requires original records to be retained for at least three years and says meal and rest periods may not be rounded. See L&I’s [Recordkeeping and Access to Payroll Records policy](https://www.lni.wa.gov/workers-rights/_docs/ESD1.pdf) and [meal and rest break guidance](https://www.lni.wa.gov/workers-rights/workplace-policies/rest-breaks-meal-periods-and-schedules).

Nanshe’s default is different and more favorable: actual punches remain intact and a separate daily credit is added. Employers should confirm the credit’s payroll, overtime, benefit-plan, collective-bargaining, and tax treatment with Washington employment counsel and a payroll professional. This repository is software, not legal advice.

## Architecture

```text
Nanshe Android ─┐
Nanshe Ubuntu ──┼── HTTPS ── Next.js API ── PostgreSQL
Nanshe browser ─┤                 │
Steward portal ─┘          immutable records
```

## Docker quick start

Requirements: Docker Engine with Docker Compose.

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Use separate generated values for `AUTH_SECRET` and `CLOCK_CODE_PEPPER`; set unique database and Steward credentials; remove or replace all synthetic seed values before production.

```bash
docker compose up -d --build
docker compose ps
```

Open Nanshe at `http://127.0.0.1:3000`. Steward remains a separate route at `http://127.0.0.1:3000/admin`.

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

With a seeded server running, `npm run smoke` verifies private clock-code authentication, failed-attempt throttling, valid punches, correction approval, report reconciliation, and evidence export.

## Client builds

### Nanshe Android

```bash
npm run build --workspace @nanshe/kiosk
cd apps/android
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK bundles the worker interface. Only the configured service address is stored. CI’s debug APK is for testing; production requires an organization-controlled signing key and managed-device policy.

### Nanshe Ubuntu

```bash
npm run dist --workspace @nanshe/desktop
```

### Steward Windows and Ubuntu

```bash
npm run dist --workspace @steward/desktop
```

The `Build Nanshe and Steward apps` GitHub workflow produces Android, Windows, and Ubuntu artifacts.

## Scope

The current release supports one employer per installation and a 14-day pay period composed of two aligned seven-day workweeks. It produces reviewed time data; it is not a payroll processor. Production recommendations that are not implemented are explicitly identified in the documentation.

## License

MIT
