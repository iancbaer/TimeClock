import { useEffect, useMemo, useState } from "react";

type PunchType = "WORK_IN" | "MEAL_START" | "MEAL_END" | "WORK_OUT";
interface Session {
  employee: { firstName: string; lastName: string };
  companyName: string;
  timeZone: string;
  allowedPunchTypes: PunchType[];
  recentPunches: Array<{ id: string; type: PunchType; occurredAt: string; revised?: boolean }>;
}

const labels: Record<PunchType, string> = {
  WORK_IN: "Clock in",
  MEAL_START: "Start meal",
  MEAL_END: "End meal",
  WORK_OUT: "Clock out",
};

function normalizedServer(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname))) return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function data(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body;
}

export function App() {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem("nanshe-server") ?? "");
  const [setupOpen, setSetupOpen] = useState(() => !localStorage.getItem("nanshe-server"));
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [kind, setKind] = useState("MISSED_PUNCH");
  const [targetPunchId, setTargetPunchId] = useState("");
  const [requestedType, setRequestedType] = useState<PunchType>("WORK_IN");
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dateTime = useMemo(() => new Intl.DateTimeFormat("en-US", {
    timeZone: session?.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }), [session?.timeZone]);

  async function saveServer(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const normalized = normalizedServer(serverDraft);
    if (!normalized) {
      setNotice({ kind: "error", text: "Enter an HTTPS server address. HTTP is allowed only for local development." });
      setBusy(false);
      return;
    }
    try {
      await data(await fetch(`${normalized}/api/health`, { cache: "no-store" }));
      localStorage.setItem("nanshe-server", normalized);
      setServerUrl(normalized);
      setSetupOpen(false);
      setSession(null);
      setNotice({ kind: "success", text: "Nanshe is connected and ready to preserve worker time." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? `Could not connect: ${error.message}` : "Could not connect." });
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const result = await data(await fetch(`${serverUrl}/api/kiosk/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode, pin }),
    })) as Session;
    setSession(result);
    return result;
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try { await refresh(); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Sign-in failed." }); }
    finally { setBusy(false); }
  }

  async function punch(type: PunchType) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await data(await fetch(`${serverUrl}/api/kiosk/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, pin, type, idempotencyKey: crypto.randomUUID(), deviceLabel: "Android kiosk" }),
      }));
      setNotice({ kind: "success", text: `${labels[type]} recorded at ${new Date(result.punch.occurredAt).toLocaleTimeString()}.` });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Punch failed. Nothing was recorded." });
    } finally { setBusy(false); }
  }

  async function requestCorrection(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await data(await fetch(`${serverUrl}/api/kiosk/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode,
          pin,
          kind,
          targetPunchId: kind === "WRONG_TIME" ? targetPunchId || null : null,
          requestedType: kind === "MISSED_PUNCH" ? requestedType : null,
          requestedOccurredAt: kind !== "OTHER" && requestedAt ? new Date(requestedAt).toISOString() : null,
          note,
        }),
      }));
      setNotice({ kind: "success", text: "Correction request submitted for manager review." });
      setCorrectionOpen(false);
      setNote(""); setRequestedAt(""); setTargetPunchId("");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request failed." });
    } finally { setBusy(false); }
  }

  if (setupOpen) {
    return <main className="shell setup-shell"><form className="panel setup" onSubmit={saveServer}>
      <p className="eyebrow">Kiosk configuration</p><h1>Connect this tablet</h1>
      <p className="muted">Enter the HTTPS address for your organization’s Nanshe service. Only the server address is stored on this device.</p>
      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
      <label>Server address<input type="url" value={serverDraft} onChange={(event) => setServerDraft(event.target.value)} placeholder="https://timeclock.example.com" required /></label>
      <button className="button primary" disabled={busy}>{busy ? "Testing connection…" : "Save and connect"}</button>
      {serverUrl && <button className="button quiet" type="button" onClick={() => setSetupOpen(false)}>Cancel</button>}
    </form></main>;
  }

  return <main className="shell">
    <header className="brand"><span>N</span><div><p className="eyebrow">{session?.companyName ?? "Worker timekeeping"}</p><h1>Nanshe</h1></div><button onClick={() => { setServerDraft(serverUrl); setSetupOpen(true); }} aria-label="Nanshe connection settings">⚙</button></header>
    <section className="clock"><p>{dateTime.format(now).split(" at ")[0]}</p><strong>{dateTime.format(now).split(" at ")[1]}</strong></section>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    {!session ? <form className="panel login" onSubmit={signIn}>
      <p className="eyebrow">Your time record</p><h2>Record every hour you work</h2><p className="muted">Open your record with your employee code and PIN. Your PIN is not saved on this tablet.</p>
      <label>Employee code<input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} inputMode="numeric" required /></label>
      <label>PIN<input type="password" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" minLength={4} maxLength={8} required /></label>
      <button className="button primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
    </form> : <div className="grid">
      <section className="panel actions"><div className="welcome"><div><p className="eyebrow">Signed in</p><h2>{session.employee.firstName} {session.employee.lastName}</h2></div><button className="button quiet" onClick={() => { setSession(null); setPin(""); setCorrectionOpen(false); }}>Done</button></div>
        <div className="action-grid">{session.allowedPunchTypes.map((type) => <button className={`punch ${type}`} onClick={() => punch(type)} disabled={busy} key={type}><strong>{labels[type]}</strong><small>{type === "MEAL_START" ? "Only when fully relieved" : "Secure server time"}</small></button>)}</div>
        <p className="break"><b>Paid rest breaks:</b> remain clocked in. Use meal punches only for an unpaid, duty-free meal.</p>
      </section>
      <section className="panel recent"><p className="eyebrow">Your record</p><h2>Recently recorded time</h2>
        <ol>{session.recentPunches.map((item) => <li key={item.id}><span>{labels[item.type]}</span><time>{new Intl.DateTimeFormat("en-US", { timeZone: session.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.occurredAt))}</time>{item.revised && <small>Corrected</small>}</li>)}</ol>
        <button className="button secondary" onClick={() => setCorrectionOpen((open) => !open)}>{correctionOpen ? "Close correction form" : "Correct my time record"}</button>
      </section>
      {correctionOpen && <form className="panel correction" onSubmit={requestCorrection}><p className="eyebrow">Protect the record</p><h2>Tell us what your time should show</h2><p className="muted">Your request and the original punch remain visible so the final record can be reviewed and explained.</p>
        <label>What happened?<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="MISSED_PUNCH">I missed a punch</option><option value="WRONG_TIME">A punch has the wrong time</option><option value="OTHER">Something else</option></select></label>
        {kind === "WRONG_TIME" && <label>Which punch?<select value={targetPunchId} onChange={(event) => setTargetPunchId(event.target.value)} required><option value="">Choose a recent punch</option>{session.recentPunches.map((item) => <option value={item.id} key={item.id}>{labels[item.type]} — {new Date(item.occurredAt).toLocaleString()}</option>)}</select></label>}
        {kind === "MISSED_PUNCH" && <label>Missed action<select value={requestedType} onChange={(event) => setRequestedType(event.target.value as PunchType)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
        {kind !== "OTHER" && <label>Requested date and time<input type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} required /></label>}
        <label>Explanation<textarea rows={4} minLength={5} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} required /></label>
        <button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Submit correction request"}</button>
      </form>}
    </div>}
  </main>;
}
