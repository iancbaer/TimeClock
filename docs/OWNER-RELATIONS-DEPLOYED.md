# Owner Relations production deployment — 2026-09-11 UTC

## Verified account and artifacts

- Explicit user authorization to verify the SDS Cloudflare account and deploy.
- Cloudflare API verified account `b001bc95975b4a9da36d15c89841489b`, named `Ian@sdsrealty.com's Account`.
- Zone `sdsoperations.com` active under that exact account; Worker `sdsoperations-timeclock`.
- Existing live Worker matched the recorded source byte-for-byte before replacement.
- Application source commit `bc425c0bd8263271698ab665c82f30e5c60979e1`.
- Final image `timeclock:owner-relations-bc425c0`; manifest `sha256:644e9f84a29296a9a8d8a7192e14d35db4a6e8cf122a130d0062e50f9e282d34`.
- Worker deployment ID `020e6570850d43348f89374b9621df47`; exact source readback SHA256 `67116e09038cbb0af36b83f3c64c5490982a7debab4620667fd6e8fe79a6ff2d`.
- Preserved EMAIL send_email binding and both existing secret_text bindings; names/types read back unchanged. Secret values not displayed or committed.

## Production changes

- Fresh encrypted backup `timeclock-20260911T061059Z.dump.age` created before migration; no fresh restore claimed.
- Only pending migration `20260910195500_owner_relations` applied successfully; no seeding.
- Compose app-only rollout, container healthy; proxy/database/kiosk configurations unchanged.
- Public Worker updated for precise Owner Relations paths and fixed owner invitation/reset templates while preserving existing TimeClock defaults.

## Live verification

- Public owner login rendered in browser with Owner Relations branding and correct separate-account guidance.
- Browser fetch `/api/health`: HTTP 200, status ok, database ready.
- Without authentication: owner manage contacts 401, owner statement list 401, TimeClock admin users 401.
- All AdminUser rows' aggregate fingerprint exactly matched pre-deployment (including Ian and Willow).
- OwnerContact and OwnerStatement counts remained zero: no real owners invited or statements published.
- Plain urllib requests received edge 403; real browser loads/fetches succeeded. Do not mistake edge client filtering for origin health failure.
- Existing saved Ian manager credential was rejected by normal login; stopped attempts. Authenticated management screen verification remains pending user login. No passwords changed, sessions forged, or authentication bypasses performed.
- No real invitation acceptance/delivery verification yet. Existing tests verify fixed template routing and token behavior, not actual email delivery.

## Entry points and rollback

- Management: https://sdsoperations.com/owner-relations/manage (Global Admin session).
- Owner login: https://sdsoperations.com/owner-relations/login.
- Prior application image `timeclock:global-admin-20260910`; prior Compose `/srv/timeclock/compose.yaml.before-owner-relations`.
- Pre-change Worker source matched `/srv/timeclock/releases/endless-20260909/sds-domain-worker.mjs` (also staged privately during deployment). Preserve all Worker bindings on rollback.
- Schema is additive. Do not drop owner tables or restore an old production database merely to roll back UI.
