"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import "./schedule.css";

type Employee = { id: string; firstName: string; lastName: string; active: boolean };
type Shift = { id: string; employeeId: string; employee: Employee; startsAt: string; endsAt: string; note: string; status: string; version: number; seriesId?: string; series?: {version:number;intervalWeeks:number;untilDate:string|null} };
type TimeOff = { id: string; employee: Employee; startDate: string; endDate: string; note: string; status: string };
type Attendance = {id:string;employee:Employee;date:string;kind:string;note:string;version:number};
type Data = { start: string; end: string; timeZone: string; employees: Employee[]; shifts: Shift[]; timeOff: TimeOff[]; requests: TimeOff[]; attendance?:Attendance[] };
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
  const [repeat,setRepeat]=useState(false);
  const [repeatDays,setRepeatDays]=useState<number[]>([1,2,3,4,5]);
  const [repeatWeeks,setRepeatWeeks]=useState(1);
  const [repeatUntil,setRepeatUntil]=useState("");
  const [repeatForever,setRepeatForever]=useState(true);
  const [publishNow,setPublishNow]=useState(true);
  const [editScope,setEditScope]=useState("ONE");
  const [attendanceForm,setAttendanceForm]=useState({employeeId:"",date:"",kind:"SICK",note:""});
  const [leave, setLeave] = useState({ startDate: "", endDate: "", note: "" });
  const [leaveEmployeeId, setLeaveEmployeeId] = useState("");

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
          const attendance=(data.attendance??[]).filter(item=>item.date.slice(0,10)===date);
          return <section className="schedule-day" key={date}>
            <h3>{day.toFormat("ccc")} <span>{day.toFormat("MMM d")}</span></h3>
            {!shifts.length && !timeOff.length && !attendance.length && <p className="empty">No shifts or time off.</p>}
            {timeOff.map((item) => <article className="schedule-entry leave" key={item.id}><strong>{name(item.employee)}</strong><span className="schedule-badge">Approved time off</span><small>All day</small></article>)}
            {attendance.map(item=><article className="schedule-entry attendance" key={item.id}><strong>{name(item.employee)}</strong><span className="schedule-badge">{item.kind==="SICK"?"Sick day":"No-call / no-show"}</span>{item.note&&<p className="schedule-note">{item.note}</p>}<button className="button quiet" disabled={disabled} onClick={()=>{const reason=window.prompt("Reason for removing this attendance record (kept in audit history):");if(reason) void mutate("/api/admin/attendance",{action:"VOID",id:item.id,version:item.version,reason},"Attendance record removed; audit history preserved.");}}>Remove incorrect record</button></article>)}
            {shifts.map((shift) => <article className={`schedule-entry ${shift.status.toLowerCase()}`} key={shift.id}>
              <strong>{name(shift.employee)}</strong><span className="schedule-badge">{shift.status === "DRAFT" ? "Draft" : "Published"}</span>
              <span>{formatTime(shift.startsAt)}<br />to {formatTime(shift.endsAt)}</span>
              {shift.series && <small>Repeats every {shift.series.intervalWeeks} week{shift.series.intervalWeeks===1?"":"s"} · {shift.series.untilDate ? `through ${dateLabel(shift.series.untilDate)}` : "until cancelled"}</small>}
              {shift.note && <p className="schedule-note">{shift.note}</p>}
              {admin && <div className="schedule-actions">
                <button className="button secondary" disabled={disabled} onClick={() => {
                  setEditing(shift); setEditScope("ONE"); setForm({ employeeId: shift.employeeId, startsAt: DateTime.fromISO(shift.startsAt).setZone(data.timeZone).toFormat("yyyy-MM-dd'T'HH:mm"), endsAt: DateTime.fromISO(shift.endsAt).setZone(data.timeZone).toFormat("yyyy-MM-dd'T'HH:mm"), note: shift.note });
                  document.getElementById("shift-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Edit</button>
                {shift.status === "DRAFT" && <button className="button primary" disabled={disabled} onClick={() => void mutate(`/api/admin/schedule/${shift.id}`, { action: "PUBLISH", version: shift.version }, "Shift published. The employee can now see it.")}>Publish</button>}
                {shift.series && <>
                  {shift.status==="DRAFT" && <button className="button primary" disabled={disabled} onClick={()=>{if(window.confirm("Publish this and all following shifts in this series?")) void mutate(`/api/admin/schedule/${shift.id}`,{action:"PUBLISH",version:shift.version,scope:"FOLLOWING",seriesVersion:shift.series!.version},"Remaining series published.");}}>Publish remaining series</button>}
                  <button className="button danger" disabled={disabled} onClick={()=>{if(window.confirm("Cancel this and all following shifts in this series? Earlier shifts are kept.")) void mutate(`/api/admin/schedule/${shift.id}`,{action:"CANCEL",version:shift.version,scope:"FOLLOWING",seriesVersion:shift.series!.version},"Remaining series cancelled.",()=>{setEditing(null);setForm(emptyShift);});}}>Cancel remaining series</button>
                </>}
                <button className="button danger" disabled={disabled} onClick={() => {
                  if (window.confirm(`Cancel this shift for ${name(shift.employee)}?`)) void mutate(`/api/admin/schedule/${shift.id}`, { action: "CANCEL", version: shift.version }, "Shift cancelled.", () => { if (editing?.id === shift.id) { setEditing(null); setForm(emptyShift); } });
                }}>Cancel</button>
              </div>}
            </article>)}
          </section>;
        })}
      </div>
      {admin && <form className="panel" onSubmit={event=>{event.preventDefault();void mutate("/api/admin/attendance",attendanceForm,"Attendance recorded.",()=>setAttendanceForm({...attendanceForm,note:""}));}}>
        <h2>Record attendance</h2><p className="muted">Record a sick day or no-call/no-show for today or a past date. Admins can see these records; clock punches and scheduled shifts are preserved.</p>
        <fieldset disabled={disabled}><div className="form-grid">
          <label>Employee<select required value={attendanceForm.employeeId} onChange={e=>setAttendanceForm({...attendanceForm,employeeId:e.target.value})}><option value="">Choose an employee</option>{data.employees.map(employee=><option value={employee.id} key={employee.id}>{name(employee)}{employee.active?"":" (inactive)"}</option>)}</select></label>
          <label>Date<input type="date" required max={DateTime.now().setZone(data.timeZone).toISODate()!} value={attendanceForm.date} onChange={e=>setAttendanceForm({...attendanceForm,date:e.target.value})}/></label>
          <label>Attendance type<select value={attendanceForm.kind} onChange={e=>setAttendanceForm({...attendanceForm,kind:e.target.value})}><option value="SICK">Sick day</option><option value="NO_CALL_NO_SHOW">No-call / no-show</option></select></label>
          <label>Admin note (optional)<input maxLength={1000} value={attendanceForm.note} onChange={e=>setAttendanceForm({...attendanceForm,note:e.target.value})}/></label>
        </div><button className="button primary">Record attendance</button></fieldset>
      </form>}
      <div className="schedule-forms">
        {admin ? <form id="shift-form" className="panel" onSubmit={(event) => {
          event.preventDefault();
          void mutate(editing ? `/api/admin/schedule/${editing.id}` : "/api/admin/schedule", editing ? { ...form, action: "SAVE", version: editing.version, scope:editScope,seriesVersion:editing.series?.version } : {...form,publish:publishNow,...(repeat?{recurrence:{intervalWeeks:repeatWeeks,weekdays:repeatDays,untilDate:repeatForever?null:repeatUntil}}:{})}, editing ? "Shift updated." : publishNow ? "Schedule created and published." : "Draft schedule created. Publish it when ready.", () => { setEditing(null); setForm(emptyShift); });
        }}>
          <h2>{editing ? "Edit shift" : "Create a shift"}</h2>
          {editing?.status === "PUBLISHED" && <p className="muted">Saving updates this published shift immediately for the employee.</p>}
          {!data.employees.some((employee) => employee.active) && <p className="empty">No active employees are available. Manage employees in TimeClock to enable scheduling.</p>}
          <fieldset disabled={disabled}>
            {editing?.series && <label>Apply changes to<select value={editScope} onChange={e=>setEditScope(e.target.value)}><option value="ONE">This shift only</option><option value="FOLLOWING">This and following shifts</option></select><small>For the remaining series, keep this occurrence date and change its times, employee, or note.</small></label>}
            <label>Employee<select required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Choose an existing employee</option>{data.employees.filter((employee) => employee.active || employee.id === form.employeeId).map((employee) => <option value={employee.id} key={employee.id}>{name(employee)}{employee.active ? "" : " (inactive)"}</option>)}</select></label>
            <div className="form-grid"><label>Starts<input type="datetime-local" required value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label><label>Ends<input type="datetime-local" required value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label></div>
            {!editing && <div className="recurrence-options">
              <label className="schedule-check"><input type="checkbox" checked={repeat} onChange={e=>{setRepeat(e.target.checked);if(!repeatUntil)setRepeatUntil(DateTime.fromISO(form.startsAt||data.start).plus({weeks:12}).toISODate()!);}}/>Repeat each week</label>
              {repeat && <>
                <label>Repeat every (weeks)<input type="number" min={1} max={12} required value={repeatWeeks} onChange={e=>setRepeatWeeks(Number(e.target.value))}/></label>
                <fieldset><legend>On these days</legend><div className="weekday-options">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,i)=><label className="schedule-check" key={day}><input type="checkbox" checked={repeatDays.includes(i+1)} onChange={e=>setRepeatDays(e.target.checked?[...repeatDays,i+1]:repeatDays.filter(d=>d!==i+1))}/>{day}</label>)}</div></fieldset>
                <label className="schedule-check"><input type="checkbox" checked={repeatForever} onChange={e=>setRepeatForever(e.target.checked)}/>Continue until cancelled</label>
                {!repeatForever && <label>Repeat through<input type="date" required min={form.startsAt.slice(0,10)} max={form.startsAt?DateTime.fromISO(form.startsAt).plus({years:2}).toISODate()!:undefined} value={repeatUntil} onChange={e=>setRepeatUntil(e.target.value)}/></label>}
                <p className="muted">Uses the start and end times above on each selected day. {repeatForever ? "Continues automatically until you cancel the remaining series. Approved time off is respected." : "All shifts are created together; any conflict prevents the whole series from being saved. Maximum 520 shifts."}</p>
              </>}
              <label className="schedule-check"><input type="checkbox" checked={publishNow} onChange={e=>setPublishNow(e.target.checked)}/>Publish immediately so the worker can see it</label>
            </div>}
            <label>Shift note (optional)<textarea maxLength={1000} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            <div className="schedule-actions"><button className="button primary">{editing ? "Save changes" : publishNow ? "Create and publish" : "Create draft"}</button>{editing && <button type="button" className="button quiet" onClick={() => { setEditing(null); setForm(emptyShift); }}>Discard edit</button>}</div>
          </fieldset>
        </form> : null}
        <form id="time-off-request-form" className="panel" onSubmit={(event) => {
          event.preventDefault(); void mutate(`/api/${admin ? "admin" : "kiosk"}/time-off`, admin ? { ...leave, employeeId: leaveEmployeeId } : leave, "Time-off request submitted for admin review.", () => setLeave({ startDate: "", endDate: "", note: "" }));
        }}>
          <h2>Request time off</h2><p className="muted">Both dates are included, for the full day. Requests need admin approval.</p>
          <fieldset disabled={disabled}>
            {admin && <label>Request for<select required value={leaveEmployeeId} onChange={event => setLeaveEmployeeId(event.target.value)}><option value="">Choose your employee record</option>{data.employees.filter(employee => employee.active).map(employee => <option key={employee.id} value={employee.id}>{name(employee)}</option>)}</select><small>Select your own name to request time off. Admins can also submit on behalf of an employee.</small></label>}
            <div className="form-grid"><label>First day<input type="date" required min={DateTime.now().setZone(data.timeZone).toISODate()!} value={leave.startDate} onChange={(event) => setLeave({ ...leave, startDate: event.target.value })} /></label><label>Last day<input type="date" required min={leave.startDate || DateTime.now().setZone(data.timeZone).toISODate()!} value={leave.endDate} onChange={(event) => setLeave({ ...leave, endDate: event.target.value })} /></label></div>
            <label>Note (optional)<textarea maxLength={1000} rows={3} value={leave.note} onChange={(event) => setLeave({ ...leave, note: event.target.value })} /></label>
            <button className="button primary">Submit request</button>
          </fieldset>
        </form>
        <section className="panel"><h2>{admin ? "Time-off requests" : "My requests"}</h2><p className="muted">{admin ? "Pending requests across all dates. Approve normally, or explicitly cancel overlapping shifts as part of approval." : "Your request history across all dates."}</p>
          {!data.requests.length && <p className="empty">{admin ? "No pending requests." : "You have not requested time off yet."}</p>}
          {data.requests.map((item) => <article className="correction-card" key={item.id}>
            <strong>{name(item.employee)}</strong><p>{dateLabel(item.startDate)} – {dateLabel(item.endDate)}</p><span className="schedule-badge">{item.status === "PENDING" ? "Pending review" : item.status === "APPROVED" ? "Approved" : "Denied"}</span>
            {item.note && <p className="schedule-note">{item.note}</p>}
            {admin && item.status === "PENDING" && <div className="schedule-actions"><button className="button primary" disabled={disabled} onClick={() => void mutate(`/api/admin/time-off/${item.id}`, { decision: "APPROVED" }, "Time off approved and added to the schedule.")}>Approve</button><button className="button secondary" disabled={disabled} onClick={()=>{if(window.confirm(`Approve time off for ${name(item.employee)} and cancel all overlapping shifts? Other dates in recurring series will remain scheduled.`)) void mutate(`/api/admin/time-off/${item.id}`,{decision:"APPROVED",cancelConflictingShifts:true},"Time off approved. Overlapping shifts cancelled.");}}>Approve & cancel conflicting shifts</button><button className="button danger" disabled={disabled} onClick={() => void mutate(`/api/admin/time-off/${item.id}`, { decision: "DENIED" }, "Time-off request denied.")}>Deny</button></div>}
          </article>)}
        </section>
      </div>
    </>}
  </section>;
}


