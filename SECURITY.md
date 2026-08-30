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
- Keep PostgreSQL off the public internet.
- Restrict database and backup access to authorized administrators.
- Encrypt backups and test restoration.
- Patch the host, container runtime, Node dependencies, and PostgreSQL regularly.
- Review audit events and pending corrections before payroll approval.
- Configure retention and employee-record access based on controlling law and company policy.
- Do not enable public self-registration.

## Known boundaries

- Employee PIN authentication is intended for a supervised shared kiosk, not remote employee self-service over an untrusted network.
- The in-process API does not replace a reverse proxy/WAF, centralized rate limiting, monitoring, or intrusion detection.
- Android debug APKs from CI are for testing. Managed production deployment should use an organization-controlled signing key and device-management policy.
- This project does not store payroll bank information, Social Security numbers, or payroll credentials and should not be extended to do so without a separate security design review.
