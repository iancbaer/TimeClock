# Global Admin release handoff

## Source and scope

This artifact is based on the source-only copy of `/srv/timeclock/releases/endless-20260909` (live image reported as `timeclock:endless-final-20260909`), not the older `/home/ian-baer/TimeClock` checkout. Differences were compared before patching. Retained account invitation/recovery, password/session-version revocation, attendance, manager time off, and endless recurring scheduling. Only additive role changes were ported; old auth/dashboard/schema were NOT substituted wholesale.

`ADMIN` retains all existing privileges and displays **Admin**. `GLOBAL_ADMIN` displays **Global Admin** and bypasses area-role restrictions in the central `requireAdmin` guard, not authentication, disabled-account, revoked-session, or password-change checks. Future protected endpoints must call `requireAdmin({ allowedRoles: [...] })`; never authorize from JWT role claims. Ordinary creation and email invitations explicitly create ADMIN and never promote from request input.

## Local verification

Use Node >=22 and npm >=11. This machine used Node 22.22.3/npm 10.9.8; npm ci succeeded with an engine warning and existing dependency deprecation warnings. No dependency version/lockfile changes were required.

```sh
npm ci --no-audit --no-fund
npm run typecheck # builds core and generates Prisma before tests
npm run lint
npm run build
npm test
```

Verified locally after the final invitation change: core 8/8 tests and web 54/54 non-integration tests passed; root typecheck, lint (zero ESLint warnings), and production build all exited 0. Full `npm test` was also attempted after generating Prisma/building core: its remaining failures are missing isolated DATABASE_URL for account-links and recurrence integration suites; scheduling integration is opt-in and skipped. Local PostgreSQL discovery hit an approval timeout and was not retried. Real database migration/promotion verification remains for the authorized operator.

All feature slices were observed failing before their implementation was ported, then passing. Session-revocation regression coverage includes Global Admin. Unit tests mock external persistence; do not interpret them as real DB migration verification.

The full test command requires a **fresh disposable PostgreSQL database**, with database name starting `timeclock_email_test_`, for account-link and recurrence integration suites. Never supply production DATABASE_URL. Apply migrations to that disposable database with `npm run db:migrate`, then run `npm test`. The existing scheduling integration test also has its own opt-in guard; inspect its prerequisites before claiming it ran. Without an isolated DB, full-suite verification is blocked, not passed. No DB credentials/secrets were copied into this source artifact.

## Authorized operator deployment steps (NOT executed here)

1. Reconfirm the current production source/image is still the stated base; rebase if it advanced. Preserve deployment secrets and existing environment outside source control. Back up production through the established protected backup mechanism and verify recoverability.
2. Build and stage a uniquely tagged image from this latest-source artifact. Do not reuse an old-checkout build. Inspect pending Prisma migrations: existing account-email/attendance/endless migrations must remain present and already applied as appropriate.
3. After deployment authorization, run `npm run db:migrate` in the controlled release environment. The new `20260910000000_admin_roles` migration only adds an enum and a NOT NULL role column defaulting to ADMIN. It does not promote or modify identities.
4. Verify Ian's exact existing active identity securely. Parent reported Ian `ian@sdsrealty.com`, id `cmtszf87m0020qw0jc4vojidk`; revalidate immediately before applying. Run preview:

   ```sh
   npm run admin:promote --workspace @timeclock/web -- --email ian@sdsrealty.com --expected-id cmtszf87m0020qw0jc4vojidk
   ```

   Verify the preview, then, only with authorized production write scope:

   ```sh
   npm run admin:promote --workspace @timeclock/web -- --email ian@sdsrealty.com --expected-id cmtszf87m0020qw0jc4vojidk --apply --confirm-email ian@sdsrealty.com
   ```

   Promotion changes only the role, writes an atomic audit, and checks exact-target post-commit readback. Default is read-only preview; invalid/missing identity and mismatched confirmation fail closed. No password, name, active status, sessionVersion, or other account fields are changed (apart from Prisma-managed updatedAt).
5. Willow remains **Admin**, same privileges and title. Parent reported existing id `cmtufkdts0005ry0kp3wqw4mt`; verify her role remains ADMIN and do not run promotion on her. Verify only the intended role change and audit using safe selected fields, not full account records.
6. Switch to the staged image through the established deployment procedure. Check health, Ian Global Admin label and access, Willow Admin label and existing access, invitations/recovery, revoked-session rejection, attendance, and recurring scheduling. Verify exact live targets after writes before claiming completion.

## Rollback

Keep the previous latest-release image for application rollback; the additive schema is backward compatible with that previous release. An application rollback alone does not erase the stored GLOBAL_ADMIN role. Do not drop the column/type or automatically demote anyone. Any role correction requires separately authorized exact-target audited action. Never use migrate reset, seed, or an older migration tree against production.

No production deployment, promotion, write, push, or backup operation was performed by this worker.
