# Contributing

Contributions are welcome through pull requests.

Before submitting:

```bash
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
```

Changes to punch pairing, paid-time credit, time zones, pay-period alignment, or overtime require focused calculation tests and an update to `docs/CALCULATION-CONTRACT.md`. Never include real employee records, credentials, entered clock codes, authorization tokens, or production database exports in an issue, fixture, commit, log, or pull request.
