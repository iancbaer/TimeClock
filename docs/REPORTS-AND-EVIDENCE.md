# Reports, calculations, and evidence

## Pay-period evidence packet

Steward’s employee report is a single printable 14-day packet. It includes:

- worker identity and pay-period boundaries;
- exact work, paid time credit, regular payable time, overtime, and total payable time;
- two separate seven-day workweeks;
- each day’s effective punch activity, exact meal duration, calculated totals, and review flags;
- correction history, worker explanations, requested changes, status, and manager resolution;
- the calculation note, generation time, time zone, and calculation version; and
- blank employee and manager attestation lines.

Its purpose is evidentiary review and payroll preparation. It shows what the system captured, how approved corrections changed the effective view, what calculation was applied, and which exceptions remain. It is labeled a draft review record: printing or exporting does not approve, sign, lock, or freeze anything. Nanshe does not fabricate signatures.

## Definitions

| Term | Implemented definition |
| --- | --- |
| Original punch | Server-recorded kiosk event that is never overwritten. |
| Effective punch | Original punch interpreted through the newest approved append-only revision. |
| Exact worked | Duration of closed work segments, excluding recorded meal segments exactly. |
| Paid time credit | In worker-favorable mode, the difference between exact daily work and the next 15-minute daily total. |
| Payable | Exact worked plus paid time credit. |
| Regular | Weekly payable time up to 40 hours. |
| Overtime | Weekly payable time above 40 hours. Each week stands alone. |
| Accuracy flag | A visible exception such as an open segment, unexpected punch, short/late meal, or long shift without a recorded meal. |

Detailed state-machine and edge-case invariants are in [CALCULATION-CONTRACT.md](CALCULATION-CONTRACT.md).

## Generated outputs

### CSV

The CSV contains document purpose/status, generation metadata, employee/internal record identity, period bounds, day-level punches and totals, flags, period totals, and correction history. It is UTF-8, spreadsheet-compatible, and generated on demand from current authoritative data. It does not contain clock codes or password material.

### Print/PDF

`Print pay-period packet` opens the browser print path. Selecting a PDF destination creates the same evidence packet as a PDF. The application does not store the resulting file, mark it approved, or know whether it was signed. Store final payroll evidence under the organization’s controlled retention process.

## Reconciliation before payroll

1. Select the intended employee and 14-day period.
2. Confirm the two week boundaries match payroll’s workweeks.
3. Resolve material flags and pending corrections.
4. Compare exact, credit, regular, overtime, and payable totals with the payroll entry/import.
5. Generate the packet and CSV after corrections are resolved.
6. Complete attestations only after human review.
7. Preserve the final packet, export, payroll result, and a recoverable database backup together under policy.

Reports are rebuildable. If a setting changes, historical sheets currently recalculate under the current setting; the packet’s generation metadata documents when and under which named calculation version it was generated. A production organization requiring period locking or versioned historical policy snapshots should add an explicit approval/freeze workflow rather than treating a print operation as approval.
