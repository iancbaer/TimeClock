# Owner Relations v1 — implementation and release handoff

## Status

Implemented locally on branch `feat/owner-relations`, based on verified Global Admin live-source commit f6726b3. Not deployed to production. Owner invitations and financial statements have not been sent or added to production.

## Features

- Separate Owner Relations routes and owner credentials; no OwnerContact creates a TimeClock administrator or employee.
- Global Admin management only; ordinary Admin access unchanged and excluded from Owner Relations management.
- Owner contacts: name/email, activation via emailed single-use invitation, disable/reactivate, password recovery.
- Explicit ENTITY or PROPERTY scopes and many-to-many access grants. A shared name or property never implies access to a different scope.
- Manual PDF uploads with title and reporting month; explicit scope audience. Files are immediately available to contacts already granted that scope (UI states this before upload).
- 10 MiB per PDF and 1 GiB aggregate document quota; signature, filename and MIME checks. No malware-scanning claim.
- Bytes stored separately from metadata in PostgreSQL, included in existing database backup mechanism. A fresh restore of owner PDFs remains a deployment acceptance check.
- Current grant checks on listings/downloads, private/no-store attachment responses, no public file paths.
- Complete paginated metadata loading before filters or grant editing; readable mobile layout.
- Atomic audit events for management writes. Owner account links are hashed, expire and redeem once; password changes revoke sessions.

## Verified

- Root typecheck, lint and production build passed before final pagination refinement; final component/typecheck verification passed after refinement.
- Full suite in a temporary isolated PostgreSQL Docker network: core 8 passed, web 104 passed, one opt-in scheduling test skipped (before final pagination tests).
- Final Owner component tests: 23 passed.
- Dedicated real-Prisma Owner DB integration: 6 passed. Includes complete migration tree, PDF bytes/checksum, current access grants and revocation, advisory-lock contention, audited rollback, concurrent single-use invitations, invalid/expired/disabled links.
- Two Worker tests passed: bounded public routing and fixed, backward-compatible email application discriminator.
- Mobile owner sign-in viewed at 390px; no horizontal overflow, large sign-in control. Not a full authenticated browser end-to-end test.
- All disposable test containers/networks removed. No production records or real email delivery used during tests.

## Release prerequisites

1. Reverify production image/source has not changed from `timeclock:global-admin-20260910`.
2. Obtain existing authorized Cloudflare deployment access. The copied Worker is `scripts/sds-domain-worker.mjs`. Existing live relay accepts only TimeClock templates and live Worker only permits TimeClock paths. BOTH app and Worker must be deployed; app-only deployment is not a working portal.
3. Preserve Worker bindings/secrets/routes; new application discriminator only supports fixed owner-relations templates/URLs. Do not provision another paid service or weaken authentication. Do not send owners a TimeClock administrator invitation.
4. Rebuild final source image after all frontend refinements; test image `timeclock:owner-relations-test` predates final pagination changes and is NOT the final release image.
5. Fresh encrypted production backup; explicitly apply the additive owner-relations migration; never seed production. Retain prior image/config for rollback.
6. Deploy app/Worker together, verify public routes, Global Admin access and ordinary Admin denial; verify actual owner invitation acceptance/delivery with an approved test recipient before inviting real owners. Never claim provider acceptance is delivery.
7. Exercise authenticated upload/list/download against designated synthetic or explicitly approved test scope, verify no cross-owner access and downloaded checksum; no real financial documents without explicit publication instruction.

## Reproduce isolated Owner DB tests

Set DATABASE_URL only to a disposable database whose pathname starts `/timeclock_email_test_`, apply migrations, then from apps/web run:

`OWNER_DB_TEST=1 npx vitest run lib/owner-db.integration.test.ts`

The test skips by default and fails closed for non-test database names. It mocks authentication and blocks outbound mail, but uses real Prisma, PostgreSQL transactions, storage bytes and row/advisory locks.
