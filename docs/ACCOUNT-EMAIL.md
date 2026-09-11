# SDS Operations account email

Status: deployed on 2026-09-09 at https://sdsoperations.com. Cloudflare confirms delivery of all three requested invitations.

This change adds password recovery and manager invitations at https://sdsoperations.com. The public domain currently fronts the existing TimeClock application at https://timeclock.whichmore.com. The origin is DigitalOcean droplet timeclock-cloud-poc (147.182.228.55), accessible through the DigitalOcean root console. The deployed base is f661c88e9c0bb4a9f73df587f33fc0b7b5fe120c. A fresh encrypted backup was created at /srv/timeclock/backups/timeclock-20260909T181827Z.dump.age. The new release is staged at /srv/timeclock/releases/account-email-20260909.

## Runtime configuration

Configure these on the application server, never in the browser or source repository:

- TIMECLOCK_EMAIL_RELAY_KEY: a dedicated random secret shared with the Cloudflare Worker. The Worker uses its EMAIL sending binding and sends from accounts@sdsoperations.com. This is the preferred configuration and keeps Cloudflare account credentials off the origin.

Alternative Resend configuration:

- RESEND_API_KEY: a sending credential for the organization's Resend account.
- TIMECLOCK_EMAIL_FROM: a sender on a verified domain, for example SDS Operations <accounts@sdsoperations.com>.

An email provider account and verified sender are required. The Gmail connector available to Codex is not a runtime email service for the website. The user approved Workers Paid ($5/month) on 2026-09-09; the subscription was activated and sdsoperations.com was onboarded to Cloudflare Email Sending. DNS sender authentication is configured.

## Deploy

1. Obtain access to the actual production application deployment and PostgreSQL database. Match the current deployed source with this patch before applying it; the local source copy may predate server-only changes.
2. Back up production PostgreSQL with the established deployment procedure.
3. Apply the included source changes and migration. Run npm ci, npm run build --workspace @timeclock/core, npm run typecheck --workspace @timeclock/web, and npm run build --workspace @timeclock/web.
4. Configure the two email variables and verify sender-domain DNS records using the records supplied by the email provider. Do not invent SPF or DKIM values.
5. Run prisma migrate deploy for apps/web before starting the new application. The migration adds a session version and separate link/rate-limit tables; it does not modify employee punches or schedules.
6. Deploy the application using its established service manager. If replacing the origin, preserve and migrate the full database and required runtime secrets first, then point the Cloudflare Worker at the new origin. Keep sdsoperations.com as every user-facing URL.
7. Ensure the trusted front proxy overwrites x-forwarded-for with the actual client IP, instead of trusting client-supplied values. The Cloudflare Worker should set it from CF-Connecting-IP and remove x-real-ip. Configure any origin proxy equivalently.
8. Verify the production login, forgot-password page, and invitation POST as an authenticated administrator. Test delivery to Ian first, then send the three requested invitations from Manager accounts. Do not claim delivery merely because the provider accepted the request; review provider delivery status.

## Requested invitations

- Robbie Bernardin: robbie@sdsrealty.com
- Willow Gold-Whitworth: willow@sdsrealty.com
- Ian Baer: ian.c.baer@gmail.com

Invitations grant full manager administration, matching the current account model. They do not implement scheduling-only roles. The email states that scope. Existing activated accounts must use Forgot password; the invitation endpoint cannot reset an existing activated account.

## Security behavior

- A 256-bit random token is sent in a URL fragment so access logs and Referer headers do not receive it. Only its SHA-256 hash is stored in the database.
- Invitation expiry: 48 hours. Reset expiry: 30 minutes. Opening an email or link does not consume it; only submitting a new password does.
- Redemption serializes on the account record and invalidates all outstanding links, preventing concurrent reuse.
- Passwords require 12–200 characters and use the existing bcrypt cost 12.
- Reset and password-change increment the session version; previous sessions stop working. Reset does not automatically sign the recipient in.
- Reset requests return the same message for registered and unregistered addresses. Next.js after() performs the email work after the response. Failures log only a fixed error code, never the token or message body.
- PostgreSQL-backed limits constrain reset requests, invitations, and redemption attempts across restarts and processes.
- Resend requests use idempotency keys. The Cloudflare relay sends one message per authorized call. No password or link token is returned by invitation APIs.
- Accounts without email configuration return an explicit unavailable response; they do not pretend to send a message.
- Schedule routine cleanup of expired AccountEmailLimit rows and used/expired AccountLink rows older than your retention period. Preserve AuditEvent history.

## Validation completed

- Production Next.js build passed.
- Type checking passed.
- Six integration tests passed in an isolated PostgreSQL cluster: token hashing, activation, expiry, disabled accounts, concurrent redemption, and rate limiting.
- Three session tests passed: legacy-session compatibility, revocation after password change/reset, and disabled-account rejection.
- The test server was stopped after testing. Production data was not used or modified.

Production image timeclock:account-email-20260909 is running and healthy. The migration completed successfully. Live login, forgot-password, and set-password pages return 200. Unauthenticated invitations are rejected (401), invalid tokens rejected (400), and unknown reset emails receive the generic response (200). The three recipient accounts are pending activation. Three additional relay tests passed, covering authentication, the fixed sender and domain, malformed tokens, and provider failure.



