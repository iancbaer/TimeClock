# Manager and kiosk operating guide

## Steward manager guide

### Add a worker

1. Sign in to Steward at `/admin`.
2. Assign the next unique official employee number. Steward suggests the first available number beginning with `1001`.
3. Enter the worker’s name and save.
4. Give the worker their employee ID. IDs must be unique; the initial ten are `1001` through `1010`.

### Review corrections and payroll

Review each pending correction against schedules and available records. Approval appends a revision or creates a correction-sourced missing punch; rejection leaves original punches unchanged. Always enter a specific resolution note. Before payroll, follow the reconciliation procedure in [REPORTS-AND-EVIDENCE.md](REPORTS-AND-EVIDENCE.md).

### Configure an Android kiosk

On first launch, enter the central HTTPS TimeClock service address. After setup, configuration is absent from the employee flow. A manager can press and hold the TimeClock mark for four seconds to reopen connection settings. This gesture is not an authentication control; physical kiosk access should be managed separately.

## Worker kiosk guide

1. Tap the large numeric keypad to enter your four-digit employee ID. Android’s keyboard does not open.
2. Tap **Continue**.
3. Confirm your name and the single action shown: **Clock in** when out, or **Clock out** when in.
4. After a punch, read the confirmation. TimeClock returns to the employee ID screen automatically.
5. For a missed or wrong punch, choose **Correct my time record**, explain the requested change, and submit. The manager reviews it; the original remains preserved.

Use **Done** when leaving without an action. The worker screen also closes after one minute without activity. Paid rest breaks stay clocked in. For an unpaid meal, clock out when it begins and clock back in when work resumes. TimeClock makes no automatic deductions.

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

1. Generate high-entropy values for `AUTH_SECRET`, database, and Steward credentials.
2. Put the app behind an HTTPS reverse proxy and expose only that proxy.
3. Keep PostgreSQL private; encrypt disks and backups.
4. Set only approved Capacitor origins in `KIOSK_ALLOWED_ORIGINS`.
5. Use a managed device/kiosk mode for Android and restrict physical settings access.
6. Add centralized rate limiting if more than one app instance is used.
7. Add monitoring, alerting, patching, backup jobs, and restore exercises.
8. Use an organization-controlled Android release signing key; CI’s debug APK is for testing.

These production controls are recommended; reverse proxying, off-host backup automation, centralized monitoring, mobile-device management, and multi-instance shared throttling are not bundled by this repository.

### Recommended managed host: Render

`render.yaml` defines the current small-employer target: one paid Docker web instance and one paid private PostgreSQL instance in Oregon. The Blueprint generates the signing secret, prompts for the initial Steward email/password, runs migrations and idempotent initialization before deploy, and uses `/api/health` for readiness.

1. Fork or connect the public GitHub repository to an organization-controlled account.
2. In Render, create a Blueprint from `render.yaml`.
3. Enter a private Steward email and a strong unique password when prompted. Do not enable `SEED_SYNTHETIC_EMPLOYEE` in production.
4. Confirm the Blueprint selects one web instance and the paid PostgreSQL plan; do not downgrade the production database to free.
5. After first deploy, sign in to Steward, set the real company label and pay-period settings, and create workers with IDs `1001` onward.
6. Run `SMOKE_BASE_URL=https://your-service.example SMOKE_EMPLOYEE_NUMBER=1999 npm run smoke` only with a designated synthetic test worker and test manager—not a real worker ID.
7. Enable platform notifications, verify managed recovery, schedule a separate encrypted logical export, and complete an isolated restore exercise.
8. Configure the Android/desktop clients with the final HTTPS service URL and restrict the device to kiosk use.

The deployment stays at one application instance because authentication failure state is currently process-local. Before adding replicas, implement a shared limiter and re-run the security and failure tests. The Blueprint is infrastructure configuration, not evidence that the service has actually been deployed or that backups have been restored.
