"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import "./schedule.css";

type Employee = { id: string; firstName: string; lastName: string; active: boolean };
type Shift = { id: string; employeeId: string; employee: Employee; startsAt: string; endsAt: string; note: string; status: string; version: number };
type TimeOff = { id: string; employee: Employee; startDate: string; endDate: string; note: string; status: string };
type Data = { start: string; end: string; timeZone: string; employees: Employee[]; shifts: Shift[]; timeOff: TimeOff[]; requests: TimeOff[] };
const emptyShift = { employeeId: "", startsAt: "", endsAt: "", note: "" };
const name = (employee: Employee) => `${employee.firstName} ${employee.lastName}`;
const dateLabel = (date: string) => DateTime.fromISO(date.slice(0, 10)).toFormat("MMM d, yyyy");

export function Schedule({ sessionToken, onSessionExpired, serverUrl = "", deviceKey }: { sessionToken?: string; onSessionExpired?: () => void; serverUrl?: string; deviceKey?: string }) {
  const admin = sessionToken === undefined;
  const [data, setData] = useState<Data | null>(null);
  const [start, setStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [form, setForm] = useState(emptyShift);
  const [leave, setLeave] = useState({ startDate: "", endDate: "", note: "" });

  const api = useCallback(async (url: string, body?: unknown) => {
    const response = await fetch(`${serverUrl}${url}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...(deviceKey ? { "X-TimeClock-Device-Key": deviceKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) { if (admin) window.location.replace("/admin/login"); else onSessionExpired?.(); }
      if (result.code === "PASSWORD_CHANGE_REQUIRED" && admin) window.location.replace("/admin/change-password");
      throw new Error(result.error ?? "Could not complete the request.");
    }
    return result;
  }, [admin, deviceKey, onSessionExpired, serverUrl, sessionToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api(`/api/${admin ? "admin" : "kiosk"}/schedule${start ? `?start=${start}` : ""}`)); return true; }
    catch (error) { setData(null); setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load schedule." }); return false; }
    finally { setLoading(false); }
  }, [admin, api, start]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function mutate(url: string, body: unknown, message: string, reset?: () => void) {
    setBusy(true); setNotice(null);
    try { await api(url, body); reset?.(); if (await load()) setNotice({ kind: "success", text: message }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save." }); }
    finally { setBusy(false); }
  }
  const formatTime = (value: string) => DateTime.fromISO(value).setZone(data?.timeZone).toFormat("MMM d, h:mm a");
  const disabled = busy || loading;

  return <section className="schedule-section" aria-label={admin ? "Employee scheduling" : "My schedule and time off"}>
    <div className="panel schedule-toolbar">
      <div><p className="eyebrow">{admin ? "Plan the week" : "Your week ahead"}</p><h2>{admin ? "Employee schedule" : "My schedule"}</h2><p className="muted">{data ? `All dates and times: ${data.timeZone}.` : "Loading TimeClock schedule…"} {admin ? "Draft shifts are visible only to admins." : "Published shifts and approved time off."}</p></div>
      <nav className="schedule-navigation" aria-label="Schedule week">
        <button className="button secondary" disabled={disabled || !data} onClick={() => setStart(DateTime.fromISO(data!.start).minus({ days: 7 }).toISODate()!)}>← Previous</button>
        <label>Week of<input type="date" value={start || data?.start || ""} disabled={busy} onChange={(event) => { if (event.target.value) setStart(DateTime.fromISO(event.target.value).startOf("week").toISODate()!); }} /></label>
        <button className="button secondary" disabled={disabled || !data} onClick={() => setStart(DateTime.fromISO(data!.start).plus({ days: 7 }).toISODate()!)}>Next →</button>
        <button className="button quiet" disabled={disabled} onClick={() => void load()}>Refresh</button>
      </nav>
    </div>
    {notice && <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
    {loading && <p role="status">Loading schedule…</p>}
    {data && !loading && <>
      <div className="schedule-days">
        {Array.from({ length: 7 }, (_, index) => {
          const day = DateTime.fromISO(data.start, { zone: data.timeZone }).plus({ days: index });
          const date = day.toISODate()!;
          const shifts = data.shifts.filter((shift) => DateTime.fromISO(shift.startsAt) < day.plus({ days: 1 }) && DateTime.fromISO(shift.endsAt) > day);
          const timeOff = data.timeOff.filter((item) => item.startDate.slice(0, 10) <= date && item.endDate.slice(0, 10) >= date);
          return <section className="schedule-day" key={date}>
            <h3>{day.toFormat("ccc")} <span>{day.toFormat("MMM d")}</span></h3>
            {!shifts.length && !timeOff.length && <p className="empty">No shifts or time off.</p>}
            {timeOff.map((item) => <article className="schedule-entry leave" key={item.id}><strong>{name(item.employee)}</strong><span className="schedule-badge">Approved time off</span><small>All day</small></article>)}
            {shifts.map((shift) => <article className={`schedule-entry ${shift.status.toLowerCase()}`} key={shift.id}>
              <strong>{name(shift.employee)}</strong><span className="schedule-badge">{shift.status === "DRAFT" ? "Draft" : "Published"}</span>
              <span>{formatTime(shift.startsAt)}<br />to {formatTime(shift.endsAt)}</span>
              {shift.note && <p className="schedule-note">{shift.note}</p>}
              {admin && <div className="schedule-actions">
                <button className="button secondary" disabled={disabled} onClick={() => {
                  setEditing(shift); setForm({ employeeId: shift.employeeId, startsAt: DateTime.fromISO(shift.startsAt).setZone(data.timeZone).toFormat("yyyy-MM-dd'T'HH:mm"), endsAt: DateTime.fromISO(shift.endsAt).setZone(data.timeZone).toFormat("yyyy-MM-dd'T'HH:mm"), note: shift.note });
                  document.getElementById("shift-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Edit</button>
                {shift.status === "DRAFT" && <button className="button primary" disabled={disabled} onClick={() => void mutate(`/api/admin/schedule/${shift.id}`, { action: "PUBLISH", version: shift.version }, "Shift published. The employee can now see it.")}>Publish</button>}
                <button className="button danger" disabled={disabled} onClick={() => {
                  if (window.confirm(`Cancel this shift for ${name(shift.employee)}?`)) void mutate(`/api/admin/schedule/${shift.id}`, { action: "CANCEL", version: shift.version }, "Shift cancelled.", () => { if (editing?.id === shift.id) { setEditing(null); setForm(emptyShift); } });
                }}>Cancel</button>
              </div>}
            </article>)}
          </section>;
        })}
      </div>
      <div className="schedule-forms">
        {admin ? <form id="shift-form" className="panel" onSubmit={(event) => {
          event.preventDefault();
          void mutate(editing ? `/api/admin/schedule/${editing.id}` : "/api/admin/schedule", editing ? { ...form, action: "SAVE", version: editing.version } : form, editing ? "Shift updated." : "Draft shift created. Publish it when ready.", () => { setEditing(null); setForm(emptyShift); });
        }}>
          <h2>{editing ? "Edit shift" : "Create a shift"}</h2>
          {editing?.status === "PUBLISHED" && <p className="muted">Saving updates this published shift immediately for the employee.</p>}
          {!data.employees.some((employee) => employee.active) && <p className="empty">No active employees are available. Manage employees in TimeClock to enable scheduling.</p>}
          <fieldset disabled={disabled}>
            <label>Employee<select required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Choose an existing employee</option>{data.employees.filter((employee) => employee.active || employee.id === form.employeeId).map((employee) => <option value={employee.id} key={employee.id}>{name(employee)}{employee.active ? "" : " (inactive)"}</option>)}</select></label>
            <div className="form-grid"><label>Starts<input type="datetime-local" required value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label><label>Ends<input type="datetime-local" required value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label></div>
            <label>Shift note (optional)<textarea maxLength={1000} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="schedule-actions"><button className="button primary">{editing ? "Save changes" : "Create draft"}</button>{editing && <button type="button" className="button quiet" onClick={() => { setEditing(null); setForm(emptyShift); }}>Discard edit</button>}</div>
          </fieldset>
        </form> : <form className="panel" onSubmit={(event) => {
          event.preventDefault(); void mutate("/api/kiosk/time-off", leave, "Time-off request submitted for admin review.", () => setLeave({ startDate: "", endDate: "", note: "" }));
        }}>
          <h2>Request time off</h2><p className="muted">Both dates are included, for the full day. Requests need admin approval.</p>
          <fieldset disabled={disabled}>
            <div className="form-grid"><label>First day<input type="date" required min={DateTime.now().setZone(data.timeZone).toISODate()!} value={leave.startDate} onChange={(event) => setLeave({ ...leave, startDate: event.target.value })} /></label><label>Last day<input type="date" required min={leave.startDate || DateTime.now().setZone(data.timeZone).toISODate()!} value={leave.endDate} onChange={(event) => setLeave({ ...leave, endDate: event.target.value })} /></label></div>
            <label>Note (optional)<textarea maxLength={1000} rows={3} value={leave.note} onChange={(event) => setLeave({ ...leave, note: event.target.value })} /></label>
            <button className="button primary">Submit request</button>
          </fieldset>
        </form>}
        <section className="panel"><h2>{admin ? "Time-off requests" : "My requests"}</h2><p className="muted">{admin ? "Pending requests across all dates. Resolve conflicting shifts before approving." : "Your request history across all dates."}</p>
          {!data.requests.length && <p className="empty">{admin ? "No pending requests." : "You have not requested time off yet."}</p>}
          {data.requests.map((item) => <article className="correction-card" key={item.id}>
            <strong>{name(item.employee)}</strong><p>{dateLabel(item.startDate)} – {dateLabel(item.endDate)}</p><span className="schedule-badge">{item.status === "PENDING" ? "Pending review" : item.status === "APPROVED" ? "Approved" : "Denied"}</span>
            {item.note && <p className="schedule-note">{item.note}</p>}
            {admin && item.status === "PENDING" && <div className="schedule-actions"><button className="button primary" disabled={disabled} onClick={() => void mutate(`/api/admin/time-off/${item.id}`, { decision: "APPROVED" }, "Time off approved and added to the schedule.")}>Approve</button><button className="button danger" disabled={disabled} onClick={() => void mutate(`/api/admin/time-off/${item.id}`, { decision: "DENIED" }, "Time-off request denied.")}>Deny</button></div>}
          </article>)}
        </section>
      </div>
    </>}
  </section>;
}
