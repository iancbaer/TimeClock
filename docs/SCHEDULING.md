# Scheduling and time off

Open **Scheduling** from Manager home (`/admin/schedule`). Create a shift by choosing an existing active TimeClock employee and entering start/end dates and times in the company timezone. Shifts begin as drafts; **Publish** makes a shift visible to its employee. Editing a published shift updates it immediately. **Cancel** removes it from the active schedule while retaining the row and audit history.

Employees sign in with their existing PIN and open **My schedule & time off**. They see only their published shifts, approved time off, and their own request history. A request includes first and last dates (both included, full days) and an optional note. Admins approve or deny pending requests across all dates. Approval adds the time off to the weekly schedule. If a draft or published shift already overlaps, the admin must edit or cancel that shift before approving; approval never silently removes work.

## Architecture and guarantees

- `Shift` and `TimeOffRequest` reference the existing `Employee.id` in the central PostgreSQL database. No employee seed, copy, mock roster, or separate identity store is used.
- Existing `requireAdmin` and `requireKioskSession` enforce access. Employee identity comes from the signed session, never request parameters. Offline-punch tokens do not authorize scheduling.
- Create, edit, publish, cancel, request, and review run under one PostgreSQL transaction advisory lock with READ COMMITTED isolation. Conflict checks see earlier committed writes after waiting. Settings changes use the same lock and cannot introduce approved-leave conflicts through timezone changes.
- Draft and published shifts cannot overlap another active shift or approved time off for the same employee. Time intervals are half-open: a shift ending exactly at the start of leave is allowed. Overnight shifts and 23/25-hour daylight-saving days are handled in the company timezone. Ambiguous or nonexistent local shift times are rejected.
- Shift versions reject stale edits and publish/cancel actions. Review accepts only pending requests. Duplicate/overlapping pending or approved leave requests are rejected.
- Audit events accompany changes atomically. Notes are visible to the employee and administrators; notes are not copied into audit metadata. Scheduling does not generate punches, pay credit, or payroll entries, and time off does not prevent recording actual work.
- The same React scheduling view is used by the web worker app and the Android kiosk source. Scheduling requires a live connection. Existing installed APKs need a separately built and rolled-out APK to display the new view; deploying the server does not replace tablet applications.

## Verification and deployment

Run the repository lint, typecheck, tests, web build and kiosk build. `scheduling-rules.test.ts` covers date validation, overnight boundaries and daylight-saving transitions. To exercise the service against real existing identities without leaving schedule records, run `TIMECLOCK_SCHEDULING_DB_TEST=1 npx vitest run lib/scheduling.integration.test.ts` in `apps/web` with the central database environment loaded. This opt-in test delegates all SQL to one transaction and deliberately rolls it back; it never creates employees or punches. Do not run concurrently with a deployment.

Back up the database with the existing TRESA backup script, apply the additive `20260904000000_scheduling` migration, and deploy a verified build. No seeding is needed. Older application builds remain compatible with the added tables. Retain the prior application build for rollback and check local, gateway, tailnet and public readiness after rollout. Keep existing tablet installations and gateway configuration intact.
