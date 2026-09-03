# TimeClock

TimeClock is worker-protective timekeeping for a shared Android tablet, Windows or Ubuntu desktop, or browser. It preserves an accurate, auditable record so frontline employees can be paid for every hour worked. Manager review and administration are modes of the same TimeClock application and use the same service and database.

## Worker experience

- One private four-digit employee PIN entered through a large 3×4 keypad
- No text field or Android software keyboard during ordinary clocking
- Name confirmation followed by exactly one valid action: **Clock in** or **Clock out**
- Clear punch confirmation followed by automatic return to the PIN screen
- One-minute authenticated idle timeout and manual **Done** action
- Recent time and worker-submitted correction requests inside the brief worker session
- No visible administrative link or everyday server controls on the worker screen
- Ian Baer's ordinary employee account uses PIN `9999` and has manager permission; after signing in he can clock normally or open read-only biweekly hours for every employee
- Offline punches are saved durably on the tablet with their device time and automatically sent to the TimeClock database on TRESA when connectivity returns

Employee PINs are private kiosk credentials, stored by the service as keyed lookups and bcrypt verifiers rather than plaintext. Full TimeClock administration still requires the administrator account. See [Security and privacy](docs/SECURITY-AND-PRIVACY.md).

## Records and reports

- Immutable original punches and append-only approved revisions
- Server timestamps for connected punches; original tablet timestamps plus later database receipt times for offline punches; valid-state enforcement, idempotency, and per-worker database locking
- Individual 14-day packets split into two independent seven-day workweeks
- Exact time, paid time credit, regular payable time, overtime, flags, and correction history
- Company-wide draft reports, named-manager approval, immutable approval versions, and reopen history
- Consolidated payroll CSV and print/PDF evidence generated from the same frozen approved snapshot
- PostgreSQL, versioned migrations, Docker deployment, Android APK, and TimeClock desktop package

The printable packet is a draft review record. Printing does not approve, sign, lock, or freeze a period.

## Documentation

- [Architecture, data flows, and table dictionary](docs/ARCHITECTURE-AND-DATA.md)
- [Semantic design definition and domain glossary](docs/DESIGN-DEFINITION.md)
- [Architecture audit, remaining risks, and production gates](docs/ARCHITECTURE-AUDIT.md)
- [Calculation contract and invariants](docs/CALCULATION-CONTRACT.md)
- [Reports, outputs, and evidentiary purpose](docs/REPORTS-AND-EVIDENCE.md)
- [Manager, kiosk, backup, retention, and deployment guide](docs/OPERATIONS-GUIDE.md)
- [Payroll approval workflow and evidence rules](docs/PAYROLL-APPROVAL.md)
- [Guarded TRESA release and Windows installation runbook](docs/TRESA-RELEASE-RUNBOOK.md)
- [Security and privacy model; current versus recommended controls](docs/SECURITY-AND-PRIVACY.md)
- [Vulnerability and deployment security policy](SECURITY.md)

## Calculation contract

TimeClock never changes an original punch. With the default `EMPLOYEE_FAVOR_DAILY_CEILING` mode:

1. Exact work comes only from completed work segments.
2. Unpaid time is recorded by clocking out and back in; no meal time is deducted automatically.
3. Each local day’s exact worked total is rounded up to the next 15-minute increment.
4. The difference is labeled `Paid time credit`, never represented as actual work.
5. Overtime is calculated independently in each seven-day workweek using worker-favorable payable time.
6. Incomplete or contradictory records are flagged, not guessed.

Example: `7:37 exact` receives `0:08 paid time credit` and becomes `7:45 payable`.

## Washington note

Washington L&I’s current policy permits nearest-quarter-hour rounding under the seven-minute rule only when it works both directions and does not underpay workers over time. It requires original records to be retained for at least three years and says meal and rest periods may not be rounded. See L&I’s [Recordkeeping and Access to Payroll Records policy](https://www.lni.wa.gov/workers-rights/_docs/ESD1.pdf) and [meal and rest break guidance](https://www.lni.wa.gov/workers-rights/workplace-policies/rest-breaks-meal-periods-and-schedules).

TimeClock’s default is different and more favorable: actual punches remain intact and a separate daily credit is added. Employers should confirm the credit’s payroll, overtime, benefit-plan, collective-bargaining, and tax treatment with Washington employment counsel and a payroll professional. This repository is software, not legal advice.

## Architecture

```text
TimeClock Android (durable offline queue) ── ordinary HTTPS ── filtered app gateway on TRESA
                                                                    │
                                                                    ▼
                                                    TimeClock service + PostgreSQL on TRESA
```

## Docker quick start

Requirements: Docker Engine with Docker Compose.

```bash
cp .env.example .env
openssl rand -hex 32
```

Use the generated value for `AUTH_SECRET`; set unique database and TimeClock administrator credentials; and remove or replace all synthetic seed values before production.

```bash
docker compose up -d --build
docker compose ps
```

Open TimeClock at `http://127.0.0.1:3000`. The authenticated manager view is part of the same application at `http://127.0.0.1:3000/admin`.

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

With a designated test employee on a running server, set `SMOKE_EMPLOYEE_NUMBER` and `SMOKE_EMPLOYEE_PIN`; `npm run smoke` verifies PIN entry, failed-attempt throttling, strict alternating clock state, correction approval, report reconciliation, and evidence export.

`npm run smoke:approval` is a mutating release test that is hard-blocked from non-localhost services. Run it only against a disposable PostgreSQL database with `TIMECLOCK_SMOKE_ALLOW_MUTATION=isolated-test-only`; it verifies manager setup, schedule gating, concurrent approval, frozen versions, reopen, stale detection, exports, audit events, and offline occurrence-time preservation.

## Client builds

### TimeClock Android

```bash
export VITE_TIMECLOCK_SERVER_URL="https://timeclock.example.com"
export VITE_TIMECLOCK_DEVICE_KEY="$(openssl rand -hex 32)"
cd apps/android
npm run add
npm run icons
cd android
ANDROID_KEYSTORE_PATH=/secure/timeclock-release.p12 \
ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=timeclock ANDROID_KEY_PASSWORD=... \
./gradlew assembleRelease
cd ..
npm run release:manifest
```

Use the same device-key value as `KIOSK_DEVICE_KEY` on the gateway host. The APK bundles the worker and manager kiosk interface, its HTTPS service address, and its device authorization. It stores previously synchronized employee sign-in profiles and unsent offline punches on the device.

Production builds use an organization-controlled PKCS12 signing key. The public repository never stores the key, passwords, or release APK. GitHub Actions expects `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` as repository secrets and retains the signed APK plus verified manifest as an authenticated Actions artifact.

Approved APKs are published to the private TRESA release directory and assigned per tablet from the manager dashboard:

```bash
TIMECLOCK_ANDROID_RELEASE_DIR=/protected/timeclock/android-releases \
npm run android:publish-release -- --apk /path/app-release.apk --manifest /path/release-manifest.json
```

Each production-signed tablet checks the existing kiosk service at launch, on reconnect, and every six hours. Only a manager sees the installation action. TimeClock synchronizes all queued offline punches, verifies the APK hash, package, newer version code, and signing certificate, then opens Android’s normal installer. Declining or failing an update never blocks punching. Moving an existing debug-signed tablet to the production key requires one uninstall/reinstall after its offline queue is confirmed empty; later updates preserve local application data.

### TimeClock for Windows

```powershell
npm run dist:windows --workspace @timeclock/desktop
```

The x64 NSIS installer is created in `apps/timeclock-desktop/release`. It installs per user and creates Start-menu and desktop shortcuts. The Windows worker clock supports the same manager-PIN report as the tablet: a manager-enabled employee can open read-only biweekly hours for every employee, navigate periods, and inspect totals, punch times, and flags. The TimeClock application menu also provides direct **Worker clock** and **Manager sign-in** destinations. The TRESA build defaults to the existing full tailnet-only service and applies its hostname-to-tailnet-IP mapping inside Electron; it does not change Windows DNS, Tailscale, the Funnel, or any kiosk endpoint.

## Scope

The current release supports one employer per installation and a 14-day pay period composed of two aligned seven-day workweeks. It produces reviewed time data; it is not a payroll processor. Production recommendations that are not implemented are explicitly identified in the documentation.

## License

MIT
