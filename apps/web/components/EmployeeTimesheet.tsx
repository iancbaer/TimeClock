"use client";

import { formatDuration } from "@nanshe/core";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SheetData {
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string; active: boolean };
  settings: { companyName: string; timeZone: string; roundingMode: string; roundingIntervalMinutes: number };
  summary: {
    periodStart: string;
    periodEnd: string;
    actualMilliseconds: number;
    creditMilliseconds: number;
    payableMilliseconds: number;
    regularMilliseconds: number;
    overtimeMilliseconds: number;
    issues: Array<{ code: string; message: string; localDate: string }>;
    weeks: Array<{
      weekNumber: number;
      startDate: string;
      endDate: string;
      actualMilliseconds: number;
      creditMilliseconds: number;
      payableMilliseconds: number;
      regularMilliseconds: number;
      overtimeMilliseconds: number;
      days: Array<{
        date: string;
        actualMilliseconds: number;
        creditMilliseconds: number;
        payableMilliseconds: number;
        mealMilliseconds: number;
        issues: Array<{ code: string; message: string }>;
        punches: Array<{ id: string; type: string; localTime: string; occurredAt: string; revised: boolean }>;
      }>;
    }>;
  };
  corrections: Array<{
    id: string;
    kind: string;
    note: string;
    status: string;
    submittedAt: string;
    resolvedAt?: string | null;
    requestedType?: string | null;
    requestedOccurredAt?: string | null;
    resolutionNote?: string | null;
    targetPunch?: { id: string; type: string; occurredAt: string } | null;
    createdPunch?: { id: string; type: string; occurredAt: string } | null;
    resolvedBy?: { name: string } | null;
  }>;
  report: { generatedAt: string; calculationVersion: string; approvalState: string };
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function EmployeeTimesheet({ employeeId, initialPeriodStart }: { employeeId: string; initialPeriodStart?: string }) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(initialPeriodStart ?? "");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = periodStart ? `?periodStart=${encodeURIComponent(periodStart)}` : "";
      const response = await fetch(`/api/admin/timesheets/${employeeId}${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Could not load time sheet.");
      setSheet(data);
      setPeriodStart(data.summary.periodStart);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load time sheet.");
    } finally {
      setLoading(false);
    }
  }, [employeeId, periodStart, router]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function changePeriod(days: number) {
    if (!sheet) return;
    const next = shiftDate(sheet.summary.periodStart, days);
    setPeriodStart(next);
    window.history.replaceState(null, "", `?periodStart=${next}`);
  }

  if (loading && !sheet) return <main className="admin-shell"><div className="loading-state">Building the two-week sheet…</div></main>;

  return (
    <main className="admin-shell sheet-shell">
      <header className="admin-header no-print">
        <div><a className="back-link" href="/admin">← All employees</a><p className="eyebrow">Individual pay-period sheet</p></div>
        <nav>
          <button className="button quiet" onClick={() => changePeriod(-14)}>← Previous</button>
          <button className="button quiet" onClick={() => changePeriod(14)}>Next →</button>
          {sheet && <a className="button secondary" href={`/api/admin/timesheets/${employeeId}/export?periodStart=${sheet.summary.periodStart}`}>Export CSV</a>}
          <button className="button primary" onClick={() => window.print()}>Print pay-period packet</button>
        </nav>
      </header>
      {error && <div className="notice error">{error}</div>}
      {sheet && (
        <>
        <article className="timesheet-paper">
          <header className="sheet-title">
            <div><p className="eyebrow">{sheet.settings.companyName}</p><h1>Pay-period evidence packet</h1></div>
            <div className="sheet-identity">
              <strong>{sheet.employee.firstName} {sheet.employee.lastName}</strong>
              <span>Employee {sheet.employee.employeeNumber}</span>
              <span>Internal record {sheet.employee.id.slice(-8).toUpperCase()}</span>
              <span>{sheet.summary.periodStart} — {sheet.summary.periodEnd}</span>
            </div>
          </header>

          <section className="report-purpose">
            <div><strong>Purpose</strong><span>Evidence for reviewing recorded work, corrections, calculation results, exceptions, and payroll preparation.</span></div>
            <div><strong>Status</strong><span>Draft review record. Printing or exporting does not approve, sign, or freeze this pay period.</span></div>
            <div><strong>Generated</strong><span>{new Date(sheet.report.generatedAt).toLocaleString()} · {sheet.settings.timeZone} · {sheet.report.calculationVersion}</span></div>
          </section>

          <div className="sheet-totals">
            <div><span>Exact worked</span><strong>{formatDuration(sheet.summary.actualMilliseconds)}</strong></div>
            <div><span>Paid time credit</span><strong>+{formatDuration(sheet.summary.creditMilliseconds)}</strong></div>
            <div><span>Regular payable</span><strong>{formatDuration(sheet.summary.regularMilliseconds)}</strong></div>
            <div><span>Overtime payable</span><strong>{formatDuration(sheet.summary.overtimeMilliseconds)}</strong></div>
            <div className="accent"><span>Total payable</span><strong>{formatDuration(sheet.summary.payableMilliseconds)}</strong></div>
          </div>

          {sheet.summary.issues.length > 0 && (
            <section className="accuracy-banner">
              <strong>Review required: {sheet.summary.issues.length} accuracy {sheet.summary.issues.length === 1 ? "flag" : "flags"}</strong>
              <span>Resolve missing, unexpected, short, or late records before payroll approval.</span>
            </section>
          )}

          {sheet.summary.weeks.map((week) => (
            <section className="week-sheet" key={week.weekNumber}>
              <div className="week-heading">
                <h2>Week {week.weekNumber}</h2>
                <span>{week.startDate} — {week.endDate}</span>
                <span>Payable {formatDuration(week.payableMilliseconds)} · OT {formatDuration(week.overtimeMilliseconds)}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Day</th><th>Clock activity</th><th>Meal</th><th>Exact</th><th>Credit</th><th>Payable</th><th>Review</th></tr></thead>
                  <tbody>
                    {week.days.map((day) => (
                      <tr className={day.issues.length ? "flagged-row" : ""} key={day.date}>
                        <th>{dayLabel(day.date)}</th>
                        <td className="punch-cell">
                          {day.punches.length === 0 ? <span className="muted">—</span> : day.punches.map((punch) => (
                            <span key={punch.id}><b>{punch.type.replaceAll("_", " ").toLowerCase()}</b> {punch.localTime}{punch.revised ? " *" : ""}</span>
                          ))}
                        </td>
                        <td>{day.mealMilliseconds ? formatDuration(day.mealMilliseconds) : "—"}</td>
                        <td>{formatDuration(day.actualMilliseconds)}</td>
                        <td>{day.creditMilliseconds ? `+${formatDuration(day.creditMilliseconds)}` : "—"}</td>
                        <td><strong>{formatDuration(day.payableMilliseconds)}</strong></td>
                        <td>{day.issues.length ? day.issues.map((item) => <span className="flag" key={item.code}>{item.message}</span>) : <span className="ok-mark">Clear</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={3}>Week {week.weekNumber}</th><td>{formatDuration(week.actualMilliseconds)}</td><td>+{formatDuration(week.creditMilliseconds)}</td><td>{formatDuration(week.payableMilliseconds)}</td><td>{week.overtimeMilliseconds ? `${formatDuration(week.overtimeMilliseconds)} OT` : "No OT"}</td></tr></tfoot>
                </table>
              </div>
            </section>
          ))}

          <section className="sheet-notes">
            <div>
              <h2>Calculation notes</h2>
              <p>Original timestamps and approved revisions are retained. “Paid time credit” rounds each day’s total exact worked time up to the next 15-minute increment; meal duration is recorded exactly. Overtime is calculated separately for each seven-day workweek using payable hours.</p>
              <p>* Corrected punch; the original remains in the audit record.</p>
            </div>
            <div>
              <h2>Correction history</h2>
              {sheet.corrections.length === 0 ? <p>No correction requests associated with this period.</p> : sheet.corrections.map((item) => (
                <div className="correction-evidence" key={item.id}>
                  <p><strong>{item.status}</strong> · {item.kind.replaceAll("_", " ").toLowerCase()} · submitted {new Date(item.submittedAt).toLocaleString()}</p>
                  <p>Worker explanation: {item.note}</p>
                  {item.targetPunch && <p>Original target: {item.targetPunch.type.replaceAll("_", " ").toLowerCase()} at {new Date(item.targetPunch.occurredAt).toLocaleString()}</p>}
                  {item.requestedOccurredAt && <p>Requested: {item.requestedType?.replaceAll("_", " ").toLowerCase() ?? "time change"} at {new Date(item.requestedOccurredAt).toLocaleString()}</p>}
                  {item.resolutionNote && <p>Manager resolution: {item.resolutionNote}{item.resolvedBy ? ` — ${item.resolvedBy.name}` : ""}</p>}
                </div>
              ))}
            </div>
          </section>

          <footer className="signature-row">
            <span>Employee attestation ____________________ Date __________</span>
            <span>Manager attestation _____________________ Date __________</span>
          </footer>
          <p className="attestation-note">Sign only after reviewing this packet and resolving material flags or corrections. Blank lines are intentional; Nanshe does not fabricate signatures or approval.</p>
        </article>
        </>
      )}
    </main>
  );
}
