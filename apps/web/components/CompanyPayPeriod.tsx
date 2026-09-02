"use client";

import { formatDuration } from "@timeclock/core";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ApprovalRecord {
  id: string;
  version: number;
  status: "APPROVED" | "REOPENED";
  approvedAt: string;
  blockerJustification?: string | null;
  snapshotHash: string;
  staleAt?: string | null;
  staleReason?: string | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  approvedBy: { name: string; email: string };
  reopenedBy?: { name: string; email: string } | null;
}

interface PayPeriodData {
  report: {
    companyName: string;
    timeZone: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    calculationVersion: string;
    totals: {
      actualMilliseconds: number;
      creditMilliseconds: number;
      payableMilliseconds: number;
      regularMilliseconds: number;
      overtimeMilliseconds: number;
    };
    employees: Array<{
      employee: { id: string; employeeNumber: string; firstName: string; lastName: string; active: boolean };
      summary: {
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
          payableMilliseconds: number;
          overtimeMilliseconds: number;
          days: Array<{
            date: string;
            actualMilliseconds: number;
            creditMilliseconds: number;
            payableMilliseconds: number;
            issues: Array<{ code: string; message: string }>;
            punches: Array<{ id: string; type: string; localTime: string; revised: boolean }>;
          }>;
        }>;
      };
      corrections: Array<{
        id: string;
        status: string;
        kind: string;
        note: string;
        requestedType?: string | null;
        requestedOccurredAt?: string | null;
        submittedAt: string;
        resolutionNote?: string | null;
        resolvedBy?: { name: string } | null;
      }>;
    }>;
  };
  reportSource: "APPROVED_SNAPSHOT" | "LIVE_DRAFT";
  selectedApproval: ApprovalRecord | null;
  approval: {
    state: "DRAFT" | "REOPENED" | "APPROVED" | "STALE";
    completed: boolean;
    available: boolean;
    opensAt: string | null;
    scheduleConfigured: boolean;
    canApprove: boolean;
    blockers: Array<{ type: string; employeeName: string; message: string }>;
    current: ApprovalRecord | null;
    history: ApprovalRecord[];
  };
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
}

export function CompanyPayPeriod({ initialPeriodStart }: { initialPeriodStart: string }) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [data, setData] = useState<PayPeriodData | null>(null);
  const [justification, setJustification] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const version = selectedVersion ? `?version=${selectedVersion}` : "";
      const response = await fetch(`/api/admin/pay-periods/${periodStart}${version}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (result.code === "PASSWORD_CHANGE_REQUIRED") {
        router.replace("/admin/change-password");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not load the company payroll report.");
      setData(result);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the company payroll report." });
    } finally {
      setBusy(false);
    }
  }, [periodStart, router, selectedVersion]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  function changePeriod(days: number) {
    const next = shiftDate(periodStart, days);
    setSelectedVersion(null);
    setPeriodStart(next);
    window.history.replaceState(null, "", `/admin/pay-period/${next}`);
  }

  async function approve() {
    if (data?.approval.blockers.length && justification.trim().length < 5) {
      setNotice({ kind: "error", text: "Enter a justification for approving with unresolved items." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/pay-periods/${periodStart}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justification: justification.trim() || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not approve this pay period.");
      setSelectedVersion(null);
      setNotice({ kind: "success", text: `Pay period approved as version ${result.approval.version}. Payroll-final files are now unlocked.` });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not approve this pay period." });
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (reopenReason.trim().length < 5) {
      setNotice({ kind: "error", text: "Enter the reason this approved period must be reopened." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/pay-periods/${periodStart}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not reopen this pay period.");
      setSelectedVersion(null);
      setReopenReason("");
      setNotice({ kind: "success", text: "The period is reopened. The former approval remains in history." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not reopen this pay period." });
    } finally {
      setBusy(false);
    }
  }

  const report = data?.report;
  const selectedApproval = data?.selectedApproval;
  const statusText = selectedApproval
    ? selectedApproval.status === "APPROVED" && !selectedApproval.staleAt
      ? `APPROVED — PAYROLL FINAL · VERSION ${selectedApproval.version}`
      : `HISTORICAL APPROVAL · VERSION ${selectedApproval.version}`
    : data?.approval.state === "STALE" ? "APPROVAL STALE — REOPEN REQUIRED" : "DRAFT — NOT APPROVED";

  return <main className="admin-shell company-period-shell">
    <header className="admin-header no-print">
      <div><a className="back-link" href="/admin">← Manager home</a><p className="eyebrow">Company payroll report</p></div>
      <nav>
        <button className="button quiet" type="button" disabled={busy} onClick={() => changePeriod(-14)}>← Previous</button>
        <button className="button quiet" type="button" disabled={busy} onClick={() => changePeriod(14)}>Next →</button>
        {report && <a className="button secondary" href={`/api/admin/pay-periods/${periodStart}/export?mode=draft`}>Download draft CSV</a>}
        {data?.approval.state === "APPROVED" && data.approval.current && !data.approval.current.staleAt && <a className="button primary" href={`/api/admin/pay-periods/${periodStart}/export?mode=approved`}>Download approved CSV</a>}
        <button className="button secondary" type="button" disabled={!report} onClick={() => window.print()}>Print / Save PDF</button>
      </nav>
    </header>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    {!data && !notice && <div className="loading-state">Building the company payroll report…</div>}
    {data && report && <>
      <section className={`payroll-status-banner ${data.approval.state.toLowerCase()}`}>
        <strong>{statusText}</strong>
        <span>{report.periodStart} through {report.periodEnd} · {report.timeZone}</span>
        {selectedApproval && <small>Approved by {selectedApproval.approvedBy.name} on {new Date(selectedApproval.approvedAt).toLocaleString()} · SHA-256 {selectedApproval.snapshotHash}</small>}
        {data.approval.current?.staleAt && <small>{data.approval.current.staleReason} The former snapshot remains in approval history.</small>}
      </section>

      <article className="timesheet-paper company-report-paper">
        <header className="sheet-title">
          <div><p className="eyebrow">{report.companyName}</p><h1>Company pay-period report</h1></div>
          <div className="sheet-identity"><strong>{statusText}</strong><span>{report.periodStart} — {report.periodEnd}</span><span>Generated {new Date(report.generatedAt).toLocaleString()}</span></div>
        </header>
        <div className="sheet-totals">
          <div><span>Exact worked</span><strong>{formatDuration(report.totals.actualMilliseconds)}</strong></div>
          <div><span>Paid time credit</span><strong>+{formatDuration(report.totals.creditMilliseconds)}</strong></div>
          <div><span>Regular payable</span><strong>{formatDuration(report.totals.regularMilliseconds)}</strong></div>
          <div><span>Overtime payable</span><strong>{formatDuration(report.totals.overtimeMilliseconds)}</strong></div>
          <div className="accent"><span>Total payable</span><strong>{formatDuration(report.totals.payableMilliseconds)}</strong></div>
        </div>
        {report.employees.map((sheet) => <section className="company-employee-report" key={sheet.employee.id}>
          <header>
            <div><p className="eyebrow">Employee {sheet.employee.employeeNumber}</p><h2>{sheet.employee.firstName} {sheet.employee.lastName}</h2></div>
            <div className="manager-totals"><span>Regular <strong>{formatDuration(sheet.summary.regularMilliseconds)}</strong></span><span>OT <strong>{formatDuration(sheet.summary.overtimeMilliseconds)}</strong></span><span>Total <strong>{formatDuration(sheet.summary.payableMilliseconds)}</strong></span></div>
          </header>
          {sheet.summary.issues.length > 0 && <div className="manager-flag">{sheet.summary.issues.length} accuracy flag{sheet.summary.issues.length === 1 ? "" : "s"}</div>}
          <div className="table-wrap"><table><thead><tr><th>Day</th><th>Punches</th><th>Exact</th><th>Credit</th><th>Payable</th><th>Review</th></tr></thead><tbody>
            {sheet.summary.weeks.flatMap((week) => week.days).map((day) => <tr className={day.issues.length ? "flagged-row" : ""} key={day.date}>
              <th>{dayLabel(day.date)}</th>
              <td className="punch-cell">{day.punches.length ? day.punches.map((punch) => <span key={punch.id}><b>{punch.type.replaceAll("_", " ")}</b> {punch.localTime}{punch.revised ? " *" : ""}</span>) : <span className="muted">—</span>}</td>
              <td>{formatDuration(day.actualMilliseconds)}</td><td>{day.creditMilliseconds ? `+${formatDuration(day.creditMilliseconds)}` : "—"}</td><td><strong>{formatDuration(day.payableMilliseconds)}</strong></td>
              <td>{day.issues.length ? day.issues.map((issue) => <span className="flag" key={`${day.date}-${issue.code}`}>{issue.message}</span>) : <span className="ok-mark">Clear</span>}</td>
            </tr>)}
          </tbody></table></div>
          {sheet.corrections.length > 0 && <div className="company-correction-history">
            <strong>Correction history</strong>
            {sheet.corrections.map((correction) => <div className="correction-evidence" key={correction.id}>
              <p><b>{correction.status}</b> · {correction.kind.replaceAll("_", " ")} · submitted {new Date(correction.submittedAt).toLocaleString()}</p>
              <p>{correction.note}</p>
              {correction.requestedOccurredAt && <small>Requested {correction.requestedType?.replaceAll("_", " ") ?? "time"}: {new Date(correction.requestedOccurredAt).toLocaleString()}</small>}
              {correction.resolutionNote && <small>Resolution by {correction.resolvedBy?.name ?? "manager"}: {correction.resolutionNote}</small>}
            </div>)}
          </div>}
        </section>)}
        {selectedApproval?.blockerJustification && <section className="approval-attestation"><strong>Manager justification for unresolved items</strong><p>{selectedApproval.blockerJustification}</p></section>}
        {selectedApproval && <footer className="approval-attestation"><strong>Approved by {selectedApproval.approvedBy.name}</strong><span>{new Date(selectedApproval.approvedAt).toLocaleString()} · Version {selectedApproval.version}</span><small>Snapshot integrity: {selectedApproval.snapshotHash}</small></footer>}
      </article>

      <section className="panel approval-controls no-print">
        <div className="panel-heading compact"><p className="eyebrow">Payroll approval</p><h2>Approval control</h2></div>
        {!data.approval.scheduleConfigured && <div className="notice error">Approval timing is not configured. Set it on Manager home before this period can be approved.</div>}
        {data.approval.scheduleConfigured && !data.approval.completed && <p className="empty">This pay period is still in progress. Approval is not available yet.</p>}
        {data.approval.scheduleConfigured && data.approval.completed && !data.approval.available && data.approval.opensAt && <p className="empty">Approval opens {new Date(data.approval.opensAt).toLocaleString()}.</p>}
        {data.approval.canApprove && <div className="approval-action">
          {data.approval.blockers.length > 0 && <><div className="accuracy-banner"><strong>{data.approval.blockers.length} unresolved item{data.approval.blockers.length === 1 ? "" : "s"}</strong><span>A written justification is required to approve.</span></div><ul className="blocker-list">{data.approval.blockers.map((item, index) => <li key={`${item.employeeName}-${index}`}><strong>{item.employeeName}</strong> — {item.message}</li>)}</ul><label>Approval justification<textarea rows={4} minLength={5} maxLength={2000} value={justification} onChange={(event) => setJustification(event.target.value)} required /></label></>}
          <button className="button primary" type="button" disabled={busy} onClick={() => void approve()}>Approve hours</button>
        </div>}
        {data.approval.current && <div className="approval-action"><label>Reason to reopen<textarea rows={3} minLength={5} maxLength={2000} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="What needs to change after approval?" required /></label><button className="button danger" type="button" disabled={busy} onClick={() => void reopen()}>Reopen approved period</button></div>}
      </section>

      {data.approval.history.length > 0 && <section className="panel approval-history no-print"><div className="panel-heading compact"><p className="eyebrow">Immutable evidence</p><h2>Approval history</h2></div>{data.approval.history.map((item) => <article key={item.id}><div><strong>Version {item.version} · {item.status}</strong><span>Approved by {item.approvedBy.name} on {new Date(item.approvedAt).toLocaleString()}</span>{item.reopenReason && <small>Reopened: {item.reopenReason}</small>}{item.staleReason && <small>Stale: {item.staleReason}</small>}</div><div><button className="button quiet" type="button" onClick={() => setSelectedVersion(item.version)}>View snapshot</button><a className="button quiet" href={`/api/admin/pay-periods/${periodStart}/export?mode=approved&version=${item.version}`}>Historical CSV</a></div></article>)}</section>}
    </>}
  </main>;
}
