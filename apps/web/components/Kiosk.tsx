"use client";

import { useEffect, useMemo, useState } from "react";

type PunchType = "WORK_IN" | "MEAL_START" | "MEAL_END" | "WORK_OUT";

interface SessionData {
  employee: { id: string; firstName: string; lastName: string };
  companyName: string;
  timeZone: string;
  serverNow: string;
  allowedPunchTypes: PunchType[];
  recentPunches: Array<{
    id: string;
    type: PunchType;
    occurredAt: string;
    originalOccurredAt?: string;
    revised?: boolean;
  }>;
}

const punchLabels: Record<PunchType, string> = {
  WORK_IN: "Clock in",
  MEAL_START: "Start meal",
  MEAL_END: "End meal",
  WORK_OUT: "Clock out",
};

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}

export function Kiosk() {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionKind, setCorrectionKind] = useState("MISSED_PUNCH");
  const [targetPunchId, setTargetPunchId] = useState("");
  const [requestedType, setRequestedType] = useState<PunchType>("WORK_IN");
  const [requestedAt, setRequestedAt] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: session?.timeZone,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }),
    [session?.timeZone],
  );

  async function refreshSession() {
    const response = await fetch("/api/kiosk/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode, pin }),
    });
    const data = (await readJson(response)) as SessionData;
    setSession(data);
    return data;
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await refreshSession();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Sign-in failed." });
    } finally {
      setBusy(false);
    }
  }

  async function punch(type: PunchType) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode,
          pin,
          type,
          idempotencyKey: crypto.randomUUID(),
          deviceLabel: navigator.userAgent.slice(0, 80),
        }),
      });
      const data = await readJson(response);
      setMessage({ kind: "success", text: `${punchLabels[type]} recorded at ${new Date(data.punch.occurredAt).toLocaleTimeString()}.` });
      await refreshSession();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Punch failed." });
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        employeeCode,
        pin,
        kind: correctionKind,
        targetPunchId: correctionKind === "WRONG_TIME" ? targetPunchId || null : null,
        requestedType: correctionKind === "MISSED_PUNCH" ? requestedType : null,
        requestedOccurredAt: correctionKind === "OTHER" || !requestedAt ? null : new Date(requestedAt).toISOString(),
        note: correctionNote,
      };
      await readJson(
        await fetch("/api/kiosk/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setMessage({ kind: "success", text: "Correction request submitted for manager review. Your original record is unchanged until approval." });
      setCorrectionOpen(false);
      setCorrectionNote("");
      setRequestedAt("");
      setTargetPunchId("");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Correction request failed." });
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setSession(null);
    setPin("");
    setMessage(null);
    setCorrectionOpen(false);
  }

  return (
    <main className="kiosk-shell">
      <section className="brand-block">
        <div className="brand-mark" aria-hidden="true">N</div>
        <div>
          <p className="eyebrow">{session?.companyName ?? "Worker timekeeping"}</p>
          <h1>Nanshe</h1>
        </div>
        <a className="admin-link" href="/admin">Steward</a>
      </section>

      <section className="clock-card" aria-live="polite">
        <p className="live-date">{formatter.format(now).split(" at ")[0]}</p>
        <p className="live-time">{formatter.format(now).split(" at ")[1]}</p>
      </section>

      {message && <div className={`notice ${message.kind}`}>{message.text}</div>}

      {!session ? (
        <form className="panel sign-in-panel" onSubmit={signIn}>
          <div className="panel-heading">
            <p className="eyebrow">Your time record</p>
            <h2>Record every hour you work</h2>
            <p>Open your record with your employee code and PIN. Your PIN is not saved on this device.</p>
          </div>
          <label>
            Employee code
            <input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} autoComplete="username" inputMode="numeric" required />
          </label>
          <label>
            PIN
            <input value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" inputMode="numeric" type="password" minLength={4} maxLength={8} required />
          </label>
          <button className="button primary large" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </form>
      ) : (
        <div className="kiosk-grid">
          <section className="panel action-panel">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">Signed in</p>
                <h2>{session.employee.firstName} {session.employee.lastName}</h2>
              </div>
              <button className="button quiet" type="button" onClick={signOut}>Done</button>
            </div>
            <div className="punch-actions">
              {session.allowedPunchTypes.map((type) => (
                <button
                  className={`punch-button ${type.toLowerCase()}`}
                  key={type}
                  type="button"
                  disabled={busy}
                  onClick={() => punch(type)}
                >
                  <span>{punchLabels[type]}</span>
                  <small>{type === "MEAL_START" ? "Only when fully relieved of work" : "Uses secure server time"}</small>
                </button>
              ))}
            </div>
            <p className="break-note"><strong>Paid rest breaks:</strong> remain clocked in. Use meal punches only for an unpaid, duty-free meal.</p>
          </section>

          <section className="panel recent-panel">
            <div className="panel-heading compact">
              <p className="eyebrow">Your record</p>
              <h2>Recently recorded time</h2>
            </div>
            <ol className="punch-list">
              {session.recentPunches.length === 0 && <li className="empty">No punches yet.</li>}
              {session.recentPunches.map((item) => (
                <li key={item.id}>
                  <span>{punchLabels[item.type]}</span>
                  <time>{new Intl.DateTimeFormat("en-US", { timeZone: session.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.occurredAt))}</time>
                  {item.revised && <small>Corrected</small>}
                </li>
              ))}
            </ol>
            <button className="button secondary full" type="button" onClick={() => setCorrectionOpen((value) => !value)}>
              {correctionOpen ? "Close correction form" : "Correct my time record"}
            </button>
          </section>

          {correctionOpen && (
            <form className="panel correction-panel" onSubmit={submitCorrection}>
              <div className="panel-heading compact">
                <p className="eyebrow">Protect the record</p>
                <h2>Tell us what your time should show</h2>
                <p>Your request and the original punch remain visible so the final record can be reviewed and explained.</p>
              </div>
              <label>
                What happened?
                <select value={correctionKind} onChange={(event) => setCorrectionKind(event.target.value)}>
                  <option value="MISSED_PUNCH">I missed a punch</option>
                  <option value="WRONG_TIME">A punch has the wrong time</option>
                  <option value="OTHER">Something else</option>
                </select>
              </label>
              {correctionKind === "WRONG_TIME" && (
                <label>
                  Which punch?
                  <select value={targetPunchId} onChange={(event) => setTargetPunchId(event.target.value)} required>
                    <option value="">Choose a recent punch</option>
                    {session.recentPunches.map((item) => (
                      <option value={item.id} key={item.id}>{punchLabels[item.type]} — {new Date(item.occurredAt).toLocaleString()}</option>
                    ))}
                  </select>
                </label>
              )}
              {correctionKind === "MISSED_PUNCH" && (
                <label>
                  Missed action
                  <select value={requestedType} onChange={(event) => setRequestedType(event.target.value as PunchType)}>
                    {Object.entries(punchLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
              )}
              {correctionKind !== "OTHER" && (
                <label>
                  Requested date and time
                  <input type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} required />
                </label>
              )}
              <label>
                Explanation
                <textarea value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} minLength={5} maxLength={1000} rows={4} placeholder="What happened, and what should the record show?" required />
              </label>
              <button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Submit correction request"}</button>
            </form>
          )}
        </div>
      )}

      <footer className="kiosk-footer">Nanshe preserves original punches. If the record does not match the work you performed, submit a correction here so every hour can be reviewed and paid.</footer>
    </main>
  );
}
