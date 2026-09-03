# Security policy

TimeClock's worker and manager modes store payroll-related records and personally identifying information. Treat every production installation as a sensitive system.

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
- Keep `KIOSK_DEVICE_KEY` and APK build values out of source control. Rotate the key and rebuild managed APKs if an installed package is distributed outside the intended devices.

## Known boundaries

- Employee IDs are intentionally accepted as low-friction identification on a supervised shared kiosk. They are predictable and are not strong authentication. The short-lived memory-only session and limited worker view reduce exposure, but this is not remote employee self-service or a substitute for private authentication where that is required.
- The in-process API does not replace a reverse proxy/WAF, centralized rate limiting, monitoring, or intrusion detection.
- Android production APKs use an organization-controlled signing key stored outside Git and in protected GitHub Actions secrets. Keep an encrypted recovery copy; losing the key makes in-place updates impossible.
- Tablet APKs and release manifests are private TRESA-hosted artifacts. Do not publish them in public GitHub Releases while the shared kiosk device key remains embedded.
- The shared kiosk device key filters public gateway traffic but is bundled into each APK and is not a substitute for employee PIN authentication, managed-device controls, or server-side session authorization.
- This project does not store payroll bank information, Social Security numbers, or payroll credentials and should not be extended to do so without a separate security design review.

The implemented privacy model and production-control gaps are documented in [docs/SECURITY-AND-PRIVACY.md](docs/SECURITY-AND-PRIVACY.md).
