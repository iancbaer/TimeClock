# Payroll approval and frozen evidence

## Configure availability

Approval timing is intentionally unset after migration. On Manager home, choose both the number of days after a pay period ends and the local opening time. TimeClock calculates the opening instant on the server in `America/Los_Angeles`, including daylight-saving transitions. A workstation clock cannot make approval appear early.

The approval applies to the entire completed two-week company period. The report includes all active employees plus any inactive employee with punches or corrections in that period.

## Review and approve

1. Open the company payroll report for the completed period.
2. Download or print a draft if needed. Every pre-approval output is marked `DRAFT — NOT APPROVED`.
3. Review every accuracy flag and pending correction shown before the approval control.
4. If unresolved items remain, enter a meaningful justification. TimeClock rejects approval without it.
5. Select **Approve hours**. Concurrent attempts are serialized; only one approval version is created.

The approval stores the named manager, approval time, unresolved-item justification, calculation and settings snapshot, complete report snapshot, and SHA-256 integrity hash. The approved CSV and printable report are rendered from that frozen snapshot, not recalculated from current settings.

## Reopen and reapprove

A named manager must enter a reason to reopen an approved period. The old version stays in approval history. Corrections can then be resolved and a new approval creates the next version.

Late offline punches retain the tablet's original occurrence time and the database's later receipt time as distinct evidence. If a late punch or correction request affects an active approved period, TimeClock marks that approval stale. Payroll-final export is blocked until a manager reopens and approves a new version. Historical versions remain viewable and downloadable with a clear historical label.

TimeClock does not email or transmit payroll data. Delivery remains a deliberate manual step after the final files are downloaded.
