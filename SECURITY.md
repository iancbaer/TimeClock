# Security policy

Nanshe and its Steward owner portal store payroll-related records and personally identifying information. Treat every production installation as a sensitive system.

## Supported version

Security updates are applied to the latest release on the `main` branch.

## Reporting a vulnerability

Do not include employee data, credentials, database exports, or exploitable production URLs in a public GitHub issue. Report vulnerabilities privately through GitHub’s private vulnerability reporting feature for this repository.

Include the affected commit/version, reproducible steps using synthetic data, impact, and any suggested mitigation.

## Deployment requirements

- Use HTTPS for every non-local connection.
- Use unique, high-entropy `AUTH_SECRET`, database, and administrator credentials.
- Use a separate, high-entropy `CLOCK_CODE_PEPPER`; do not reuse `AUTH_SECRET`.
- Keep PostgreSQL off the public internet.
- Restrict database and backup access to authorized administrators.
- Encrypt backups and test restoration.
- Patch the host, container runtime, Node dependencies, and PostgreSQL regularly.
- Review audit events and pending corrections before payroll approval.
- Configure retention and employee-record access based on controlling law and company policy.
- Do not enable public self-registration.

## Known boundaries

- Numeric clock-code authentication is intended for a supervised shared kiosk. It uses protected database digests, a short-lived memory-only session, and single-instance throttling; it is not remote employee self-service or a substitute for long-password/MFA authentication.
- The in-process API does not replace a reverse proxy/WAF, centralized rate limiting, monitoring, or intrusion detection.
- Android debug APKs from CI are for testing. Managed production deployment should use an organization-controlled signing key and device-management policy.
- This project does not store payroll bank information, Social Security numbers, or payroll credentials and should not be extended to do so without a separate security design review.

The implemented privacy model and production-control gaps are documented in [docs/SECURITY-AND-PRIVACY.md](docs/SECURITY-AND-PRIVACY.md).
