# Manager and kiosk operating guide

## TimeClock manager guide

### Add a worker

1. Sign in to TimeClock's manager view at `/admin`.
2. Enter the worker’s name and choose whether they have manager permission.
3. Save the employee and record the random four-digit PIN shown once.
4. Give that private PIN only to the employee. Internal employee numbers are assigned automatically and are not kiosk credentials.

### Review corrections and payroll

Review each pending correction against schedules and available records. Approval appends a revision or creates a correction-sourced missing punch; rejection leaves original punches unchanged. Always enter a specific resolution note. Before payroll, follow the reconciliation procedure in [REPORTS-AND-EVIDENCE.md](REPORTS-AND-EVIDENCE.md), then use the company report and named-manager approval described in [PAYROLL-APPROVAL.md](PAYROLL-APPROVAL.md).

### Manage named managers

Ian's active named-manager account can create another manager from Manager home. TimeClock displays a random temporary password once. The new manager must replace it with a password of at least 12 characters before any other manager action is available. Any active named manager may approve hours. TimeClock prevents a manager from disabling the account currently in use and serializes account changes so the last active manager cannot be disabled.

### Review punches on a tablet or Windows worker clock

1. Ian Baer enters his ordinary employee PIN, `9999`.
2. Ian may open **See hours for every employee** before punching. On Windows, a manager also remains on the confirmation screen after a successful punch so the report is still available; choose **Done** when finished.
3. Review the current aligned two-week period for every active employee. Each employee card shows the TRESA database punches, exact time, paid-time credit, payable time, overtime, and record flags.
4. Use **Previous two weeks** or **Next two weeks** when another period is needed.
5. Select **Back to my clock** when finished. The review is read-only and closes automatically after two minutes without activity.

Manager permission is part of Ian's employee record; it is not a separate service or shared review-only login. This PIN-based review cannot edit punches, approve corrections, or change settings. In the Windows application, use **TimeClock → Manager sign-in** for those named-manager administrative actions.

### Configure an Android kiosk

Normal managed builds include the HTTPS TimeClock address and device authorization, so another tablet only needs the same APK installed. A build without an embedded address asks for the HTTPS address on first launch. After setup, configuration is absent from the employee flow. A manager can press and hold the TimeClock mark for four seconds to reopen connection settings. This gesture is not an authentication control; physical kiosk access should be managed separately.

### Connect remote kiosks to TRESA

Remote tablets do not need Tailscale. Run the public gateway on TRESA with a random `KIOSK_DEVICE_KEY` of at least 32 characters:

```bash
node scripts/timeclock-public-gateway.mjs
```

The gateway listens on `127.0.0.1:3110`, forwards only `/api/health` and `/api/kiosk/*` to the local TimeClock service on port 3100, requires the matching device key for kiosk requests, and returns 404 for the administration site. Publish port 3110 through a stable HTTPS tunnel such as Tailscale Funnel:

```bash
tailscale funnel --https=10000 --bg http://127.0.0.1:3110
```

Set `VITE_TIMECLOCK_SERVER_URL` to that HTTPS address and `VITE_TIMECLOCK_DEVICE_KEY` to the matching gateway key when building the APK. Keep the key out of source control. The key identifies an installed app build; employee PINs and short-lived sessions still authorize employee actions.

## Worker kiosk guide

1. Tap the large numeric keypad to enter your private four-digit PIN. Android’s keyboard does not open.
2. Tap **Continue**.
3. Confirm your name and the single action shown: **Clock in** when out, or **Clock out** when in.
4. After a punch, read the confirmation. TimeClock returns to the PIN screen automatically.
5. For a missed or wrong punch, choose **Correct my time record**, explain the requested change, and submit. The manager reviews it; the original remains preserved.

Use **Done** when leaving without an action. The worker screen also closes after one minute without activity. Paid rest breaks stay clocked in. For an unpaid meal, clock out when it begins and clock back in when work resumes. TimeClock makes no automatic deductions.

If TRESA or Wi-Fi is unavailable, any employee whose profile has synchronized on this tablet can still sign in and punch. TimeClock labels the punch as saved on the tablet, preserves its original device timestamp, and retries delivery to TRESA every 15 seconds and whenever Android reports that the connection has returned. Do not clear app storage while unsent punches are shown.

## Backup and restore

Current Docker deployment stores PostgreSQL in the named `timeclock-postgres` volume. The application performs no automatic backup or deletion.

Create a logical backup from a scheduled, access-controlled host process:

```bash
docker compose exec -T database pg_dump -U timeclock -d timeclock --format=custom > timeclock-YYYY-MM-DD.dump
```

Test restoration into a separate empty database/environment before relying on a backup:

```bash
createdb timeclock_restore_test
pg_restore --clean --if-exists --no-owner --dbname=timeclock_restore_test timeclock-YYYY-MM-DD.dump
```

The second example assumes PostgreSQL client tools and a disposable local test database. Never run `--clean` against production. Encrypt backup files, restrict access, maintain off-host copies, and document recovery time and recovery point objectives.

## Retention

Implemented behavior: no automatic time-record deletion, correction deletion, or audit deletion. Recommended production control: adopt a written schedule that meets current Washington requirements and any longer payroll, tax, contract, litigation-hold, or benefit-plan requirement. Periodically test that retained records and backups remain readable. Deletion tooling should be a separately approved, auditable feature.

## Deployment

Current implementation supports Docker Compose, one Next.js service, and PostgreSQL. It binds to localhost by default. For production:

1. Generate high-entropy values for `AUTH_SECRET`, database, and TimeClock administrator credentials.
2. Put the app behind an HTTPS reverse proxy and expose only that proxy.
4. Keep PostgreSQL private; encrypt disks and backups.
5. Set only approved Capacitor origins in `KIOSK_ALLOWED_ORIGINS`.
6. Use a managed device/kiosk mode for Android and restrict physical settings access.
7. Add centralized rate limiting if more than one app instance is used.
8. Add monitoring, alerting, patching, backup jobs, and restore exercises.
9. Use an organization-controlled Android release signing key; CI’s debug APK is for testing.

These production controls are recommended; reverse proxying, off-host backup automation, centralized monitoring, mobile-device management, and multi-instance shared throttling are not bundled by this repository.

### Recommended managed host: Render

`render.yaml` defines the current small-employer target: one paid Docker web instance and one paid private PostgreSQL instance in Oregon. The Blueprint generates the signing secret, prompts for the initial TimeClock administrator email/password, runs migrations and idempotent initialization before deploy, and uses `/api/health` for readiness.

1. Fork or connect the public GitHub repository to an organization-controlled account.
2. In Render, create a Blueprint from `render.yaml`.
3. Enter a private TimeClock administrator email and a strong unique password when prompted. Do not enable `SEED_SYNTHETIC_EMPLOYEE` in production.
4. Confirm the Blueprint selects one web instance and the paid PostgreSQL plan; do not downgrade the production database to free.
5. After first deploy, sign in to TimeClock's manager view, set the real company label and pay-period settings, and create workers with IDs `1001` onward.
6. Run `SMOKE_BASE_URL=https://your-service.example SMOKE_EMPLOYEE_NUMBER=1999 npm run smoke` only with a designated synthetic test worker and test manager—not a real worker ID.
7. Enable platform notifications, verify managed recovery, schedule a separate encrypted logical export, and complete an isolated restore exercise.
8. Configure the Android/desktop clients with the final HTTPS service URL and restrict the device to kiosk use.

The deployment stays at one application instance because authentication failure state is currently process-local. Before adding replicas, implement a shared limiter and re-run the security and failure tests. The Blueprint is infrastructure configuration, not evidence that the service has actually been deployed or that backups have been restored.
