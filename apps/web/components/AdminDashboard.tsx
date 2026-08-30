"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  active: boolean;
}

interface Correction {
  id: string;
  kind: string;
  note: string;
  status: string;
  requestedType?: string | null;
  requestedOccurredAt?: string | null;
  submittedAt: string;
  employee: Employee;
  targetPunch?: { id: string; type: string; occurredAt: string } | null;
}

interface Settings {
  companyName: string;
  timeZone: string;
  payPeriodAnchor: string;
  workweekStartsOn: number;
  roundingMode: "EXACT" | "EMPLOYEE_FAVOR_DAILY_CEILING";
  roundingIntervalMinutes: 15;
}

async function json(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "Request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

export function AdminDashboard() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [newEmployee, setNewEmployee] = useState({ employeeNumber: "", firstName: "", lastName: "" });
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeData, correctionData, settingsData] = await Promise.all([
        fetch("/api/admin/employees", { cache: "no-store" }).then(json),
        fetch("/api/admin/corrections?status=PENDING", { cache: "no-store" }).then(json),
        fetch("/api/admin/settings", { cache: "no-store" }).then(json),
      ]);
      setEmployees(employeeData.employees);
      setNewEmployee((current) => current.employeeNumber ? current : {
        ...current,
        employeeNumber: employeeData.suggestedEmployeeNumber ?? "",
      });
      setCorrections(correctionData.corrections);
      setSettings(settingsData.settings);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        router.replace("/admin/login");
        return;
      }
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load Steward." });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function addEmployee(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await json(await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmployee),
      }));
      setNewEmployee({ employeeNumber: "", firstName: "", lastName: "" });
      setNotice({ kind: "success", text: "Employee created." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create employee." });
    } finally {
      setBusy(false);
    }
  }

  async function resolveCorrection(id: string, decision: "APPROVE" | "REJECT") {
    const resolutionNote = resolutionNotes[id]?.trim();
    if (!resolutionNote || resolutionNote.length < 3) {
      setNotice({ kind: "error", text: "Add a short manager note before resolving the correction." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await json(await fetch(`/api/admin/corrections/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, resolutionNote }),
      }));
      setNotice({ kind: "success", text: decision === "APPROVE" ? "Correction approved and applied." : "Correction rejected; original punches remain unchanged." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not resolve correction." });
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setNotice(null);
    try {
      await json(await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }));
      setNotice({ kind: "success", text: "Timekeeping settings saved. Future and historical sheets will show the configured calculation." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save settings." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  if (loading && !settings) return <main className="admin-shell"><div className="loading-state">Loading Steward…</div></main>;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Owner portal · {settings?.companyName ?? "Your organization"}</p>
          <h1>Steward</h1>
        </div>
        <nav><Link href="/">TimeClock worker app</Link><button className="button quiet" onClick={signOut}>Sign out</button></nav>
      </header>

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

      <section className="admin-summary" aria-label="Steward summary">
        <article><strong>{employees.filter((employee) => employee.active).length}</strong><span>Active employees</span></article>
        <article><strong>{corrections.length}</strong><span>Pending corrections</span></article>
        <article><strong>{settings?.roundingMode === "EMPLOYEE_FAVOR_DAILY_CEILING" ? "On" : "Off"}</strong><span>Worker-favorable pay credit</span></article>
      </section>

      <div className="admin-grid">
        <section className="panel admin-employees">
          <div className="panel-heading compact">
            <p className="eyebrow">Pay-period records</p>
            <h2>Employees</h2>
            <p>Open an employee to review their individual two-week sheet.</p>
          </div>
          <div className="employee-list">
            {employees.map((employee) => (
              <a className={`employee-row ${employee.active ? "" : "inactive"}`} href={`/admin/employee/${employee.id}`} key={employee.id}>
                <span className="avatar">{employee.firstName[0]}{employee.lastName[0]}</span>
                <span><strong>{employee.firstName} {employee.lastName}</strong><small>Employee ID {employee.employeeNumber}{employee.active ? "" : " · Inactive"}</small></span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
          <form className="inline-form" onSubmit={addEmployee}>
            <h3>Add employee</h3>
            <p className="form-help">Workers enter this four-digit ID on the TimeClock keypad.</p>
            <div className="form-grid">
              <label>Official employee number<input inputMode="numeric" pattern="1[0-9]{3}" minLength={4} maxLength={4} value={newEmployee.employeeNumber} onChange={(event) => setNewEmployee({ ...newEmployee, employeeNumber: event.target.value.replace(/\D/g, "").slice(0, 4) })} required /></label>
              <label>First name<input value={newEmployee.firstName} onChange={(event) => setNewEmployee({ ...newEmployee, firstName: event.target.value })} required /></label>
              <label>Last name<input value={newEmployee.lastName} onChange={(event) => setNewEmployee({ ...newEmployee, lastName: event.target.value })} required /></label>
            </div>
            <button className="button secondary" disabled={busy}>Create employee</button>
          </form>
        </section>

        <section className="panel corrections-panel">
          <div className="panel-heading compact">
            <p className="eyebrow">Protect the record</p>
            <h2>Correction requests</h2>
            <p>Approval creates an auditable revision. The original worker record always remains available.</p>
          </div>
          <div className="correction-list">
            {corrections.length === 0 && <p className="empty">No pending requests.</p>}
            {corrections.map((item) => (
              <article className="correction-card" key={item.id}>
                <div className="correction-meta">
                  <strong>{item.employee.firstName} {item.employee.lastName}</strong>
                  <span>{item.kind.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <p>{item.note}</p>
                {item.targetPunch && <p className="detail-line">Existing: {item.targetPunch.type.replaceAll("_", " ").toLowerCase()} at {new Date(item.targetPunch.occurredAt).toLocaleString()}</p>}
                {item.requestedOccurredAt && <p className="detail-line">Requested: {item.requestedType?.replaceAll("_", " ").toLowerCase() ?? "new time"} at {new Date(item.requestedOccurredAt).toLocaleString()}</p>}
                <label>Manager note<textarea rows={2} value={resolutionNotes[item.id] ?? ""} onChange={(event) => setResolutionNotes({ ...resolutionNotes, [item.id]: event.target.value })} placeholder="Why this was approved or rejected" /></label>
                <div className="decision-row">
                  <button className="button primary" type="button" disabled={busy} onClick={() => resolveCorrection(item.id, "APPROVE")}>Approve & apply</button>
                  <button className="button danger" type="button" disabled={busy} onClick={() => resolveCorrection(item.id, "REJECT")}>Reject</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {settings && (
        <form className="panel settings-panel" onSubmit={saveSettings}>
          <div className="panel-heading compact">
            <p className="eyebrow">Calculation contract</p>
            <h2>Company settings</h2>
            <p>Raw punches are never rounded. The enabled option adds paid time after each day’s exact worked total.</p>
          </div>
          <div className="settings-grid">
            <label>Company name<input value={settings.companyName} onChange={(event) => setSettings({ ...settings, companyName: event.target.value })} /></label>
            <label>Time zone<input value={settings.timeZone} onChange={(event) => setSettings({ ...settings, timeZone: event.target.value })} /></label>
            <label>Two-week period begins<input type="date" value={settings.payPeriodAnchor} onChange={(event) => setSettings({ ...settings, payPeriodAnchor: event.target.value })} /></label>
            <label>Workweek begins<select value={settings.workweekStartsOn} onChange={(event) => setSettings({ ...settings, workweekStartsOn: Number(event.target.value) })}>
              <option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option><option value={7}>Sunday</option>
            </select></label>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={settings.roundingMode === "EMPLOYEE_FAVOR_DAILY_CEILING"} onChange={(event) => setSettings({ ...settings, roundingMode: event.target.checked ? "EMPLOYEE_FAVOR_DAILY_CEILING" : "EXACT" })} />
            <span><strong>Worker-favorable 15-minute daily pay credit</strong><small>Round each day’s payable worked total up to the next quarter hour. Exact punches and exact meal duration remain visible.</small></span>
          </label>
          <div className="compliance-note"><strong>Built-in safeguard:</strong> paid rest periods are not deducted or rounded; recorded meals stay exact. Each week calculates overtime independently from the other week.</div>
          <button className="button primary" disabled={busy}>Save settings</button>
        </form>
      )}
    </main>
  );
}
