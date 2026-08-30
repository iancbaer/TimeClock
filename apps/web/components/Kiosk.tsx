"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmployeeIdKeypad } from "./ClockCodeKeypad";

type PunchType = "WORK_IN" | "WORK_OUT";
type RecordPunchType = PunchType | "MEAL_START" | "MEAL_END";

interface SessionData {
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
  sessionToken: string;
  companyName: string;
  timeZone: string;
  serverNow: string;
  allowedPunchTypes: PunchType[];
  recentPunches: Array<{ id: string; type: RecordPunchType; occurredAt: string; originalOccurredAt?: string; revised?: boolean }>;
}

const punchLabels: Record<RecordPunchType, string> = {
  WORK_IN: "Clock in",
  MEAL_START: "Start meal",
  MEAL_END: "End meal",
  WORK_OUT: "Clock out",
};

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "The request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

export function Kiosk() {
  const [employeeId, setEmployeeId] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionKind, setCorrectionKind] = useState("MISSED_PUNCH");
  const [targetPunchId, setTargetPunchId] = useState("");
  const [requestedType, setRequestedType] = useState<PunchType>("WORK_IN");
  const [requestedAt, setRequestedAt] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const confirmationTimer = useRef<number | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const returnToCode = useCallback((notice?: { kind: "error" | "success"; text: string }) => {
    setSession(null);
    setSessionToken("");
    setEmployeeId("");
    setCorrectionOpen(false);
    setTargetPunchId("");
    setRequestedAt("");
    setCorrectionNote("");
    setBusy(false);
    setMessage(notice ?? null);
  }, []);

  useEffect(() => () => {
    if (confirmationTimer.current !== null) window.clearTimeout(confirmationTimer.current);
  }, []);

  useEffect(() => {
    if (!session) return;
    let timer = 0;
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => returnToCode({ kind: "error", text: "For privacy, this session ended after one minute without activity." }), 60_000);
    };
    restart();
    window.addEventListener("pointerdown", restart, { passive: true });
    window.addEventListener("keydown", restart);
    window.addEventListener("input", restart);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("keydown", restart);
      window.removeEventListener("input", restart);
    };
  }, [returnToCode, session]);

  const formatter = useMemo(() => new Intl.DateTimeFormat("en-US", {
    timeZone: session?.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }), [session?.timeZone]);

  async function signIn() {
    if (busy || employeeId.length !== 4) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = (await readJson(await fetch("/api/kiosk/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeNumber: employeeId }),
      }))) as SessionData;
      setSession(data);
      setSessionToken(data.sessionToken);
      setEmployeeId("");
    } catch (error) {
      setEmployeeId("");
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "That employee ID could not be checked." });
    } finally {
      setBusy(false);
    }
  }

  function schedulePrivateReturn(text: string) {
    setMessage({ kind: "success", text });
    confirmationTimer.current = window.setTimeout(() => returnToCode({ kind: "success", text }), 1_800);
  }

  async function punch(type: PunchType) {
    setBusy(true);
    setMessage(null);
    let completed = false;
    try {
      const data = await readJson(await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type, idempotencyKey: crypto.randomUUID(), deviceLabel: navigator.userAgent.slice(0, 80) }),
      }));
      completed = true;
      schedulePrivateReturn(`${punchLabels[type]} recorded at ${new Date(data.punch.occurredAt).toLocaleTimeString()}. Returning to the employee ID screen…`);
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your employee ID again." });
      } else {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "Punch failed. Nothing was recorded." });
      }
    } finally {
      if (!completed) setBusy(false);
    }
  }

  async function submitCorrection(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    let completed = false;
    try {
      await readJson(await fetch("/api/kiosk/corrections", {
        method: "POST",
        headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: correctionKind,
          targetPunchId: correctionKind === "WRONG_TIME" ? targetPunchId || null : null,
          requestedType: correctionKind === "MISSED_PUNCH" ? requestedType : null,
          requestedOccurredAt: correctionKind === "OTHER" || !requestedAt ? null : new Date(requestedAt).toISOString(),
          note: correctionNote,
        }),
      }));
      completed = true;
      schedulePrivateReturn("Correction request recorded for manager review. The original remains preserved. Returning to the employee ID screen…");
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your employee ID again." });
      } else {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "Correction request failed." });
      }
    } finally {
      if (!completed) setBusy(false);
    }
  }

  return (
    <main className="kiosk-shell">
      <section className="brand-block">
        <div className="brand-mark" aria-hidden="true">T</div>
        <div><p className="eyebrow">{session?.companyName ?? "Worker timekeeping"}</p><h1>TimeClock</h1></div>
      </section>

      <section className="clock-card" aria-live="polite">
        <p className="live-date">{now ? formatter.format(now).split(" at ")[0] : "Current date"}</p>
        <p className="live-time">{now ? formatter.format(now).split(" at ")[1] : "—:—"}</p>
      </section>

      {message && <div className={`notice ${message.kind}`} role="status">{message.text}</div>}

      {!session ? (
        <form className="panel clock-code-panel" onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
          <div className="panel-heading keypad-heading">
            <p className="eyebrow">Employee timeclock</p>
            <h2>Enter your employee ID</h2>
            <p>Use your four-digit ID, starting with 1. You will confirm the correct action on the next screen.</p>
          </div>
          <EmployeeIdKeypad value={employeeId} onChange={setEmployeeId} onSubmit={() => void signIn()} busy={busy} />
        </form>
      ) : (
        <div className="kiosk-grid">
          <section className="panel action-panel">
            <div className="welcome-row"><div><p className="eyebrow">Confirm your action</p><h2>{session.employee.firstName} {session.employee.lastName}</h2><p className="employee-number-label">Employee ID {session.employee.employeeNumber}</p></div><button className="button quiet" type="button" onClick={() => returnToCode()}>Not me</button></div>
            <div className={`punch-actions action-count-${session.allowedPunchTypes.length}`}>
              {session.allowedPunchTypes.map((type) => (
                <button className={`punch-button ${type.toLowerCase()}`} key={type} type="button" disabled={busy} onClick={() => punch(type)}>
                  <span>Confirm {punchLabels[type].toLowerCase()}</span><small>{type === "WORK_IN" ? "You are currently clocked out" : "You are currently clocked in"}</small>
                </button>
              ))}
            </div>
            <p className="break-note"><strong>No automatic deductions:</strong> TimeClock counts the time between clock in and clock out. For an unpaid meal, clock out when it begins and clock back in when work resumes.</p>
          </section>

          <section className="panel recent-panel">
            <div className="panel-heading compact"><p className="eyebrow">Your record</p><h2>Recently recorded time</h2></div>
            <ol className="punch-list">
              {session.recentPunches.length === 0 && <li className="empty">No punches yet.</li>}
              {session.recentPunches.map((item) => (
                <li key={item.id}><span>{punchLabels[item.type]}</span><time>{new Intl.DateTimeFormat("en-US", { timeZone: session.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.occurredAt))}</time>{item.revised && <small>Corrected; original preserved</small>}</li>
              ))}
            </ol>
            <button className="button secondary full" type="button" onClick={() => setCorrectionOpen((value) => !value)}>{correctionOpen ? "Close correction form" : "Correct my time record"}</button>
          </section>

          {correctionOpen && (
            <form className="panel correction-panel" onSubmit={submitCorrection}>
              <div className="panel-heading compact"><p className="eyebrow">Protect the record</p><h2>Tell us what your time should show</h2><p>Your request and the original punch remain visible for review. This screen closes automatically after submission or inactivity.</p></div>
              <label>What happened?<select value={correctionKind} onChange={(event) => setCorrectionKind(event.target.value)}><option value="MISSED_PUNCH">I missed a punch</option><option value="WRONG_TIME">A punch has the wrong time</option><option value="OTHER">Something else</option></select></label>
              {correctionKind === "WRONG_TIME" && <label>Which punch?<select value={targetPunchId} onChange={(event) => setTargetPunchId(event.target.value)} required><option value="">Choose a recent punch</option>{session.recentPunches.map((item) => <option value={item.id} key={item.id}>{punchLabels[item.type]} — {new Date(item.occurredAt).toLocaleString()}</option>)}</select></label>}
              {correctionKind === "MISSED_PUNCH" && <label>Missed action<select value={requestedType} onChange={(event) => setRequestedType(event.target.value as PunchType)}><option value="WORK_IN">Clock in</option><option value="WORK_OUT">Clock out</option></select></label>}
              {correctionKind !== "OTHER" && <label>Requested date and time<input type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} required /></label>}
              <label>Explanation<textarea value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} minLength={5} maxLength={1000} rows={4} placeholder="What happened, and what should the record show?" required /></label>
              <button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Submit correction request"}</button>
            </form>
          )}
        </div>
      )}

      <footer className="kiosk-footer">Original punches remain auditable. If your record does not match the work you performed, use the correction request so every hour can be reviewed and paid.</footer>
    </main>
  );
}
