# TimeClock cloud production

Cut over September 4, 2026 (Pacific). Application source: `f661c88`.

- URL: https://timeclock.whichmore.com (DNS-only Cloudflare A record; Caddy-managed TLS).
- Existing `whichmore.com` publication is unchanged.
- DigitalOcean droplet `timeclock-cloud-poc`, ID `597946629`, `147.182.228.55`, SFO3.
- Ubuntu 24.04, 1 vCPU, 2 GB RAM, 50 GB disk, 2 GB swap.
- Base $12/month plus daily backups at 30%: approximately $15.60/month before tax, excluding overages or additional resources. Daily snapshots retain seven days.
- Docker Compose in `/srv/timeclock`; repository in `/srv/timeclock/repo`. Only SSH and HTTP(S) are publicly exposed. PostgreSQL has no host port; application port 3100 is loopback-only.

## Data and clients

Cloud PostgreSQL is the **only active application database**. No seed ran and no employees were invented. Final cutover preserved all 11 employees, 53 punches, 14 correction requests and other existing records; every table's count and digest matched before opening the cloud app.

TRESA's original app process was stopped before the final dump. Its PostgreSQL data is retained as a pre-cutover recovery copy, not a current replica. Never restart that original app alongside the cloud writer.

The SYSTEM scheduled task `TimeClock Cloud Compatibility Bridge` runs `TimeClock-Cloud-Bridge.mjs` on TRESA port 3100. Existing tailnet and kiosk Funnel URLs forward to the cloud, preserving installed clients. The production `Start-TimeClock.ps1` also starts this bridge instead of Next.js. The previous script is retained as `Start-TimeClock.before-cloud.ps1`.

Existing clients using TRESA URLs still depend on TRESA for forwarding. Configure clients to use the new HTTPS URL to remove that dependency. This is backup-based recovery, **not automatic failover** or bidirectional database replication.

## Configuration and deployment

Copy `compose.yaml` and `Caddyfile` to `/srv/timeclock`. Required private files (directory mode 700, files 600):

- `secrets/database.env`: POSTGRES_DB=timeclock, POSTGRES_USER=timeclock, strong POSTGRES_PASSWORD.
- `secrets/app.env`: DATABASE_URL, the existing AUTH_SECRET (preserves PIN verifiers and sessions), KIOSK_ALLOWED_ORIGINS, and TIMECLOCK_ANDROID_RELEASE_DIR=/var/lib/timeclock/android-releases.
- `secrets/proxy.env`: existing KIOSK_DEVICE_KEY and a random BACKUP_DOWNLOAD_TOKEN.
- `secrets/backup-recipient.txt`: age public recipient only.

Check the application's environment schema before changing configuration. Never commit secrets, employee exports, backups, or decryption keys. APK releases live in `/srv/timeclock/android-releases`, readable by the application's non-root user.

Build a versioned image using the repository Dockerfile, set `TIMECLOCK_IMAGE` in `/srv/timeclock/.env`, and run `docker compose up -d app`. Back up before migrations, run migrations explicitly, and verify `/api/health` plus authenticated scheduling routes. Do not seed production. Do not run `docker compose down -v`.

The bulk offline roster requires the existing kiosk device key at the public proxy. Forwarded client-IP headers are replaced with the real socket address; keep the DNS record unproxied unless trusted-proxy handling is explicitly redesigned.

## Backups and recovery

`timeclock-backup.timer` runs every 15 minutes. Install `backup.sh` at `/srv/timeclock/backup.sh` and the unit files in `/etc/systemd/system`, then enable the timer. Requires Docker, age, flock, and the `timeclock-backup` group. Dumps are encrypted to the public recipient before being stored in `/srv/timeclock/backups`. The HTTPS backup endpoint serves only the latest encrypted dump and requires a bearer token; unauthorized requests return 404.

TRESA's SYSTEM scheduled task `TimeClock Cloud Backup Pull` runs the PowerShell wrapper every 15 minutes. `C:\ProgramData\TimeClockCloudBackup` contains the wrapper, `pull-backup.mjs`, `download-token.txt`, `backup.agekey`, `archives`, `pull.log`, and `last-success.txt`. Restrict this directory to SYSTEM, Administrators, and the designated operator; ensure copied files inherit those ACLs. The wrapper redirects Node output so unattended execution has valid standard streams.

The age private key is retained on TRESA and the operator's protected migration staging directory, **not on the droplet**. Store an additional secure offline copy: without this key the encrypted archives cannot be recovered. DigitalOcean snapshots remain protected by the cloud account, not by this age key.

Because generation and retrieval each run every 15 minutes, allow approximately 30 minutes of offsite recovery-point lag while both machines are online. If TRESA is offline, cloud backups continue and its pull resumes when available; missed intermediate archives are not all downloaded. Archives currently have no automatic pruning: monitor disk capacity and establish retention before extended operation. No external failure alerting is configured.

A backup received on TRESA was decrypted and restored into an isolated test database on the droplet. All 12 table fingerprints matched; the disposable database and droplet's temporary private decryption key were subsequently removed. Both unattended backup tasks passed, including a post-cutover pull.

For recovery, decrypt a selected archive using `age -d -i backup.agekey -o restore.dump archive.dump.age` on a secured machine. Restore into a **new isolated database** using `pg_restore --no-owner --no-acl --exit-on-error`, verify table fingerprints and authenticated behavior, then arrange a single-writer cutover. Never restore over a live database without first stopping writes and taking a fresh recovery copy.

For rollback after cloud writes have begun, stop cloud writes and restore a fresh cloud dump to TRESA first. Merely restarting the pre-cutover TRESA database would lose new records. Stop the bridge task, restore the saved startup script, then start the original application only after verifying the recovered database. Keep the other writer stopped throughout.

## Checks

`docker compose ps`, `systemctl status timeclock-backup.timer`, and `/api/health` check cloud services. On TRESA, inspect both scheduled tasks, `LastTaskResult` for the pull (expected 0), and `last-success.txt` freshness. The bridge task should remain Running. `database-fingerprint.mjs` emits counts and digests only, not employee details; run with the application's environment and working directory.
