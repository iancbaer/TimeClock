import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PunchType = "WORK_IN" | "WORK_OUT";
type RecordPunchType = PunchType | "MEAL_START" | "MEAL_END";
interface Session {
  employee: { employeeNumber: string; firstName: string; lastName: string };
  sessionToken: string;
  companyName: string;
  timeZone: string;
  allowedPunchTypes: PunchType[];
  recentPunches: Array<{ id: string; type: RecordPunchType; occurredAt: string; revised?: boolean }>;
}

const labels: Record<RecordPunchType, string> = { WORK_IN: "Clock in", MEAL_START: "Start meal", MEAL_END: "End meal", WORK_OUT: "Clock out" };

function normalizedServer(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname))) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return null; }
}

async function data(response: Response) {
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error ?? "The request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

function Keypad({ value, onChange, submit, busy }: { value: string; onChange: (value: string) => void; submit: () => void; busy: boolean }) {
  function digit(valueToAdd: string) { if (!busy && value.length < 4) onChange(`${value}${valueToAdd}`); }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) { event.preventDefault(); digit(event.key); }
      else if (["Backspace", "Delete", "Escape"].includes(event.key)) { event.preventDefault(); onChange(""); }
      else if (event.key === "Enter" && value.length === 4 && !busy) { event.preventDefault(); submit(); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return <div className="clock-code-entry">
    <output className="clock-code-display" aria-label={`${value.length} employee ID digits entered`} aria-live="polite">{value || <span>Enter your 4-digit ID</span>}</output>
    <div className="numeric-keypad" aria-label="Numeric employee ID keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((number) => <button className="keypad-key" type="button" onClick={() => digit(number)} disabled={busy} key={number}>{number}</button>)}
      <button className="keypad-key utility" type="button" onClick={() => onChange("")} disabled={busy || !value}>Clear</button>
      <button className="keypad-key" type="button" onClick={() => digit("0")} disabled={busy}>0</button>
      <button className="keypad-key continue" disabled={busy || value.length !== 4}>{busy ? "Wait…" : "Continue"}</button>
    </div>
    <p className="code-privacy-note">Your employee ID is cleared when you finish or after a recorded punch.</p>
  </div>;
}

export function App() {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem("nanshe-server") ?? "");
  const [setupOpen, setSetupOpen] = useState(() => !localStorage.getItem("nanshe-server"));
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [employeeId, setEmployeeId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [kind, setKind] = useState("MISSED_PUNCH");
  const [targetPunchId, setTargetPunchId] = useState("");
  const [requestedType, setRequestedType] = useState<PunchType>("WORK_IN");
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");
  const confirmationTimer = useRef<number | null>(null);
  const configurationTimer = useRef<number | null>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => {
    if (confirmationTimer.current !== null) window.clearTimeout(confirmationTimer.current);
    if (configurationTimer.current !== null) window.clearTimeout(configurationTimer.current);
  }, []);

  const returnToCode = useCallback((nextNotice?: { kind: "error" | "success"; text: string }) => {
    setSession(null); setSessionToken(""); setEmployeeId(""); setCorrectionOpen(false); setTargetPunchId(""); setRequestedAt(""); setNote(""); setBusy(false); setNotice(nextNotice ?? null);
  }, []);

  useEffect(() => {
    if (!session) return;
    let timer = 0;
    const restart = () => { window.clearTimeout(timer); timer = window.setTimeout(() => returnToCode({ kind: "error", text: "For privacy, this session ended after one minute without activity." }), 60_000); };
    restart();
    window.addEventListener("pointerdown", restart, { passive: true }); window.addEventListener("keydown", restart); window.addEventListener("input", restart);
    return () => { window.clearTimeout(timer); window.removeEventListener("pointerdown", restart); window.removeEventListener("keydown", restart); window.removeEventListener("input", restart); };
  }, [returnToCode, session]);

  const dateTime = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: session?.timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }), [session?.timeZone]);

  async function saveServer(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const normalized = normalizedServer(serverDraft);
    if (!normalized) { setNotice({ kind: "error", text: "Enter an HTTPS server address. HTTP is allowed only for local development." }); setBusy(false); return; }
    try {
      await data(await fetch(`${normalized}/api/health`, { cache: "no-store" }));
      localStorage.setItem("nanshe-server", normalized); setServerUrl(normalized); setSetupOpen(false); returnToCode({ kind: "success", text: "Nanshe is connected and ready." });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? `Could not connect: ${error.message}` : "Could not connect." }); }
    finally { setBusy(false); }
  }

  async function signIn() {
    if (busy || employeeId.length !== 4) return;
    setBusy(true); setNotice(null);
    try {
      const result = await data(await fetch(`${serverUrl}/api/kiosk/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeNumber: employeeId }) })) as Session;
      setSession(result); setSessionToken(result.sessionToken); setEmployeeId("");
    } catch (error) { setEmployeeId(""); setNotice({ kind: "error", text: error instanceof Error ? error.message : "That employee ID could not be checked." }); }
    finally { setBusy(false); }
  }

  function scheduleReturn(text: string) { setNotice({ kind: "success", text }); confirmationTimer.current = window.setTimeout(() => returnToCode({ kind: "success", text }), 1_800); }

  async function punch(type: PunchType) {
    setBusy(true); setNotice(null); let completed = false;
    try {
      const result = await data(await fetch(`${serverUrl}/api/kiosk/punch`, { method: "POST", headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ type, idempotencyKey: crypto.randomUUID(), deviceLabel: "Android kiosk" }) }));
      completed = true; scheduleReturn(`${labels[type]} recorded at ${new Date(result.punch.occurredAt).toLocaleTimeString()}. Returning to the employee ID screen…`);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your employee ID again." });
      else setNotice({ kind: "error", text: error instanceof Error ? error.message : "Punch failed. Nothing was recorded." });
    } finally { if (!completed) setBusy(false); }
  }

  async function requestCorrection(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null); let completed = false;
    try {
      await data(await fetch(`${serverUrl}/api/kiosk/corrections`, { method: "POST", headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ kind, targetPunchId: kind === "WRONG_TIME" ? targetPunchId || null : null, requestedType: kind === "MISSED_PUNCH" ? requestedType : null, requestedOccurredAt: kind !== "OTHER" && requestedAt ? new Date(requestedAt).toISOString() : null, note }) }));
      completed = true; scheduleReturn("Correction request recorded for manager review. The original remains preserved. Returning to the employee ID screen…");
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your employee ID again." });
      else setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request failed." });
    } finally { if (!completed) setBusy(false); }
  }

  function startConfigurationHold() {
    configurationTimer.current = window.setTimeout(() => { setServerDraft(serverUrl); setSetupOpen(true); }, 4_000);
  }
  function cancelConfigurationHold() { if (configurationTimer.current !== null) window.clearTimeout(configurationTimer.current); configurationTimer.current = null; }

  if (setupOpen) return <main className="shell setup-shell"><form className="panel setup" onSubmit={saveServer}>
    <p className="eyebrow">Manager configuration</p><h1>Connect this tablet</h1><p className="muted">Enter the HTTPS address for the Nanshe service. Only this address is stored on the device.</p>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    <label>Server address<input type="url" value={serverDraft} onChange={(event) => setServerDraft(event.target.value)} placeholder="https://nanshe.example.com" required /></label>
    <button className="button primary" disabled={busy}>{busy ? "Testing connection…" : "Save and connect"}</button>
    {serverUrl && <button className="button quiet" type="button" onClick={() => setSetupOpen(false)}>Cancel</button>}
  </form></main>;

  return <main className="shell">
    <header className="brand"><button className="brand-mark-button" onPointerDown={startConfigurationHold} onPointerUp={cancelConfigurationHold} onPointerCancel={cancelConfigurationHold} onPointerLeave={cancelConfigurationHold} onContextMenu={(event) => event.preventDefault()} aria-label="Nanshe"><span>N</span></button><div><p className="eyebrow">{session?.companyName ?? "Worker timekeeping"}</p><h1>Nanshe</h1></div></header>
    <section className="clock"><p>{dateTime.format(now).split(" at ")[0]}</p><strong>{dateTime.format(now).split(" at ")[1]}</strong></section>
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
    {!session ? <form className="panel clock-code-panel" onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
      <p className="eyebrow">Employee timeclock</p><h2>Enter your employee ID</h2><p className="muted">Use your four-digit ID, starting with 1. Confirm the correct action on the next screen.</p>
      <Keypad value={employeeId} onChange={setEmployeeId} submit={() => void signIn()} busy={busy} />
    </form> : <div className="grid">
      <section className="panel actions"><div className="welcome"><div><p className="eyebrow">Confirm your action</p><h2>{session.employee.firstName} {session.employee.lastName}</h2><p className="employee-number">Employee ID {session.employee.employeeNumber}</p></div><button className="button quiet" onClick={() => returnToCode()}>Not me</button></div>
        <div className={`action-grid action-count-${session.allowedPunchTypes.length}`}>{session.allowedPunchTypes.map((type) => <button className={`punch ${type}`} onClick={() => punch(type)} disabled={busy} key={type}><strong>Confirm {labels[type].toLowerCase()}</strong><small>{type === "WORK_IN" ? "You are currently clocked out" : "You are currently clocked in"}</small></button>)}</div>
        <p className="break"><b>No automatic deductions:</b> Nanshe counts the time between clock in and clock out. For an unpaid meal, clock out when it begins and clock back in when work resumes.</p>
      </section>
      <section className="panel recent"><p className="eyebrow">Your record</p><h2>Recently recorded time</h2><ol>{session.recentPunches.length === 0 && <li className="empty">No punches yet.</li>}{session.recentPunches.map((item) => <li key={item.id}><span>{labels[item.type]}</span><time>{new Intl.DateTimeFormat("en-US", { timeZone: session.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.occurredAt))}</time>{item.revised && <small>Corrected; original preserved</small>}</li>)}</ol>
        <button className="button secondary" onClick={() => setCorrectionOpen((open) => !open)}>{correctionOpen ? "Close correction form" : "Correct my time record"}</button>
      </section>
      {correctionOpen && <form className="panel correction" onSubmit={requestCorrection}><p className="eyebrow">Protect the record</p><h2>Tell us what your time should show</h2><p className="muted">The original remains available for review. This screen closes after submission or inactivity.</p>
        <label>What happened?<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="MISSED_PUNCH">I missed a punch</option><option value="WRONG_TIME">A punch has the wrong time</option><option value="OTHER">Something else</option></select></label>
        {kind === "WRONG_TIME" && <label>Which punch?<select value={targetPunchId} onChange={(event) => setTargetPunchId(event.target.value)} required><option value="">Choose a recent punch</option>{session.recentPunches.map((item) => <option value={item.id} key={item.id}>{labels[item.type]} — {new Date(item.occurredAt).toLocaleString()}</option>)}</select></label>}
        {kind === "MISSED_PUNCH" && <label>Missed action<select value={requestedType} onChange={(event) => setRequestedType(event.target.value as PunchType)}><option value="WORK_IN">Clock in</option><option value="WORK_OUT">Clock out</option></select></label>}
        {kind !== "OTHER" && <label>Requested date and time<input type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} required /></label>}
        <label>Explanation<textarea rows={4} minLength={5} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} required /></label>
        <button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Submit correction request"}</button>
      </form>}
    </div>}
    <footer className="kiosk-footer">Original punches remain auditable. Use the correction request if your record does not match your work.</footer>
  </main>;
}
