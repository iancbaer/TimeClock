# Global Admin production deployment — 2026-09-11 UTC

Deployed with explicit user authorization. Source preserves the latest endless-final release features; GitHub main had lagged behind deployed source.

- Image: `timeclock:global-admin-20260910`
- Image manifest: `sha256:26b60a67eca7d41d045c1df092a4b84e472edf01cf97432607e679afc113b9c8`
- Production Docker build completed successfully.
- Encrypted pre-migration backup: `timeclock-20260911T021917Z.dump.age`; fresh restore not exercised during this change.
- Only pending migration `20260910000000_admin_roles` applied successfully.
- Explicit target account promotion completed with transactional audit and fresh-process database readback.
- Ian confirmed active GLOBAL_ADMIN; Willow confirmed active ADMIN.
- Willow's complete existing account record fingerprint excluding the added role field matched before/after.
- Existing Admin access retained; future area restrictions must use the central role-aware guard. Global Admin does not bypass authentication, session revocation, inactive-account or forced-password-change checks.
- Container healthy; public https://sdsoperations.com/api/health returned status ok and database ready.
- Authenticated browser verification remains outstanding; do not claim every screen was manually exercised.
- Worker-reported local verification: core 8/8 and web 54/54 non-integration tests, typecheck, lint, production build passed. Full database integration suite was not completed due to unavailable isolated test database.

Rollback image remains `timeclock:endless-final-20260909`; prior Compose config retained at `/srv/timeclock/compose.yaml.before-global-admin`. The additive schema is backward-compatible. Do not restore stale databases, seed production, or modify kiosk/proxy configuration.
