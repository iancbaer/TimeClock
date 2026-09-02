# Guarded TRESA release and Windows installation

Release `f9fe05c` was deployed to TRESA on September 2, 2026 after the owner explicitly lifted the Ridpath hold. T1 and T2 remain on their existing compatible builds. Do not change a deployed tablet, its APK, the kiosk device key, the public gateway, the Funnel hostname, or Funnel port `10000` unless a later rollout explicitly places that component in scope.

The verified pre-deployment database backup is `production/backups/timeclock-20260902-160752.dump`; the previous production `.next` bundle is retained at `production/rollback/next-20260902-1609`. After rollout, all health routes and existing kiosk contracts returned HTTP 200, and the installed Windows manager-PIN report loaded all 11 employees.

## Server rollout

Run from an administrator PowerShell session on TRESA. The existing production scripts and secret environment file stay in place.

1. Confirm the current service and gateway are healthy at `http://127.0.0.1:3100/api/health` and `http://127.0.0.1:3110/api/health`. Record the current tailnet and public health results without changing either route.
2. Run the existing `production/Backup-TimeClock.ps1`. Retain the emitted `.dump` path. The script verifies that the target is the local TimeClock database, creates a custom-format backup, and validates its table of contents with `pg_restore --list`.
3. Run the release's tests, lint, type check, and build in the isolated release workspace before the maintenance window.
4. At the maintenance window, identify the single process listening on port `3100` and verify its command line is the TimeClock `next start` process. Stop only that process. Leave PostgreSQL, port `3110`, the prototype, Tailscale, and Funnel unchanged.
5. In the TimeClock repository, run `npm run db:migrate`, then `npm run build`. The migration is additive: it adds approval settings, manager state, and frozen approval history.
6. Run the existing `production/Start-TimeClock.ps1`. Because PostgreSQL and the gateway are already listening, it starts only the missing TimeClock service and performs local health checks.
7. Verify, in order: local service `3100`, filtered gateway `3110`, full tailnet service `https://sds-commercial-core.tail1a6de3.ts.net:8443`, public Funnel health on port `10000`, and the existing kiosk session/offline-roster contracts. Do not create a production punch.
8. Sign in as Ian, confirm Manager home loads, create or enable the intended named managers, and explicitly configure the approval delay and local time. No schedule is preset by the migration.

If the new service fails before any approval records are created, restart the prior application build; the added database objects are backward-compatible. Preserve the verified backup. Restore the database only for a confirmed data/schema emergency, into an isolated database first whenever possible.

## Windows installation on TRESA

The Windows app requires no new server port. It opens the existing full service at `https://sds-commercial-core.tail1a6de3.ts.net:8443`. Electron maps that hostname to TRESA's existing tailnet IP inside the app only; Windows DNS and Tailscale configuration remain unchanged.

1. Verify the installer's SHA-256 checksum against the release manifest.
2. Run `TimeClock-1.0.0-x64.exe` as the TRESA user. Choose the per-user install and keep both Start-menu and desktop shortcuts enabled.
3. Windows may display an unknown-publisher warning because the package is unsigned. Confirm only after checking the release hash.
4. Open TimeClock from the installed shortcut. Enter a manager-enabled employee PIN and confirm **See hours for every employee** opens read-only totals, punch times, flags, and pay-period navigation. Do not record a test punch in production.
5. From the TimeClock application menu, confirm **Worker clock** returns to the PIN screen and **Manager sign-in** opens the named-manager login used for approvals.
6. Pin the running TimeClock icon to the taskbar using Windows' **Pin to taskbar** action. Windows does not provide a stable supported installer API for forced taskbar pinning, so this final pin is manual.
7. Close and relaunch from the taskbar. Confirm it works without the source repository or a development server.

Uninstalling the Windows client removes only the per-user desktop application. It does not remove or alter TimeClock server data.
