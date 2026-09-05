import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Schedule } from "../../web/components/Schedule";

type PunchType = "WORK_IN" | "WORK_OUT";
type RecordPunchType = PunchType | "MEAL_START" | "MEAL_END";
interface Session {
  employee: { id: string; firstName: string; lastName: string; manager: boolean };
  sessionToken: string;
  offlineToken: string;
  offline?: boolean;
  companyName: string;
  timeZone: string;
  allowedPunchTypes: PunchType[];
  recentPunches: Array<{ id: string; type: RecordPunchType; occurredAt: string; revised?: boolean }>;
}

interface QueuedPunch {
  employeeId: string;
  offlineToken: string;
  idempotencyKey: string;
  type: PunchType;
  occurredAt: string;
}

interface OfflineRoster {
  generatedAt: string;
  profiles: Array<{ profileKey: string; session: Session }>;
}

type KioskUpdateState = "CURRENT" | "AVAILABLE" | "DOWNLOADING" | "INSTALLING" | "INSTALLED" | "FAILED" | "DISMISSED";

interface AppInfo {
  packageName: string;
  versionCode: number;
  versionName: string;
  certificateSha256: string;
  canInstallPackages: boolean;
}

interface AvailableUpdate {
  id: string;
  versionCode: number;
  versionName: string;
  releaseNotes: string;
  sha256: string;
  certificateSha256: string;
  byteSize: number;
  downloadPath: string;
}

interface AppUpdatePlugin {
  getAppInfo(): Promise<AppInfo>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstall(options: {
    url: string;
    sha256: string;
    certificateSha256: string;
    headers: Record<string, string>;
  }): Promise<{ started: boolean }>;
}

const AppUpdate = registerPlugin<AppUpdatePlugin>("AppUpdate");

const OFFLINE_PROFILES_KEY = "timeclock-offline-profiles-v1";
const OFFLINE_QUEUE_KEY = "timeclock-offline-punches-v1";
const DEVICE_ID_KEY = "timeclock-device-id-v1";
const DEVICE_LABEL_KEY = "timeclock-device-label-v1";
const DEFAULT_SERVER_URL = import.meta.env.VITE_TIMECLOCK_SERVER_URL ?? "";
const DEVICE_KEY = import.meta.env.VITE_TIMECLOCK_DEVICE_KEY ?? "";

function kioskHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-TimeClock-Device-Key": DEVICE_KEY, ...extra };
}

function storedJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

function storedDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

async function pinDigest(pin: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`timeclock-local-pin:${pin}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface ManagerReview {
  companyName: string;
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  recordSource: "central-database";
  employees: Array<{
    employee: { id: string; employeeNumber: string; firstName: string; lastName: string; active: boolean };
    summary: {
      actualMilliseconds: number;
      creditMilliseconds: number;
      payableMilliseconds: number;
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
          punches: Array<{ id: string; type: RecordPunchType; localTime: string; occurredAt: string; revised: boolean }>;
        }>;
      }>;
    };
  }>;
}

const labels: Record<RecordPunchType, string> = { WORK_IN: "Clock in", MEAL_START: "Start meal", MEAL_END: "End meal", WORK_OUT: "Clock out" };

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function dayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function normalizedServer(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const privateHttp = url.protocol === "http:" && (["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname.toLowerCase()) || url.hostname.startsWith("100.") || url.hostname.startsWith("192.168.") || url.hostname.startsWith("10."));
    if (url.protocol !== "https:" && !privateHttp) return null;
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
    <output className="clock-code-display" aria-label={`${value.length} PIN digits entered`} aria-live="polite">{value || <span>Enter your 4-digit PIN</span>}</output>
    <div className="numeric-keypad" aria-label="Numeric employee PIN keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((number) => <button className="keypad-key" type="button" onClick={() => digit(number)} disabled={busy} key={number}>{number}</button>)}
      <button className="keypad-key utility" type="button" onClick={() => onChange("")} disabled={busy || !value}>Clear</button>
      <button className="keypad-key" type="button" onClick={() => digit("0")} disabled={busy}>0</button>
      <button className="keypad-key continue" disabled={busy || value.length !== 4}>{busy ? "Wait…" : "Continue"}</button>
    </div>
    <p className="code-privacy-note">Your PIN is cleared immediately after sign-in.</p>
  </div>;
}

export function App() {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem("timeclock-server") ?? DEFAULT_SERVER_URL);
  const [setupOpen, setSetupOpen] = useState(() => !serverUrl);
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [deviceLabel, setDeviceLabel] = useState(() => localStorage.getItem(DEVICE_LABEL_KEY) ?? "");
  const [deviceLabelDraft, setDeviceLabelDraft] = useState(() => localStorage.getItem(DEVICE_LABEL_KEY) ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  const [offlineProfileKey, setOfflineProfileKey] = useState("");
  const [queuedCount, setQueuedCount] = useState(() => storedJson<QueuedPunch[]>(OFFLINE_QUEUE_KEY, []).length);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [kind, setKind] = useState("MISSED_PUNCH");
  const [targetPunchId, setTargetPunchId] = useState("");
  const [requestedType, setRequestedType] = useState<PunchType>("WORK_IN");
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const confirmationTimer = useRef<number | null>(null);
  const configurationTimer = useRef<number | null>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => {
    if (confirmationTimer.current !== null) window.clearTimeout(confirmationTimer.current);
    if (configurationTimer.current !== null) window.clearTimeout(configurationTimer.current);
  }, []);

  useEffect(() => {
    if (!session || !offlineProfileKey) return;
    const profiles = storedJson<Record<string, Session>>(OFFLINE_PROFILES_KEY, {});
    profiles[offlineProfileKey] = { ...session, sessionToken: "", offline: true };
    localStorage.setItem(OFFLINE_PROFILES_KEY, JSON.stringify(profiles));
  }, [offlineProfileKey, session]);

  const syncOfflineProfiles = useCallback(async (url = serverUrl) => {
    if (!url) return;
    try {
      const result = await data(await fetch(`${url}/api/kiosk/offline-roster`, { cache: "no-store", headers: kioskHeaders() })) as OfflineRoster;
      const profiles = Object.fromEntries(result.profiles.map(({ profileKey, session: profile }) => [
        profileKey,
        { ...profile, sessionToken: "", offline: true },
      ]));
      localStorage.setItem(OFFLINE_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      // Keep the last complete roster when the network is unavailable.
    }
  }, [serverUrl]);

  useEffect(() => {
    void syncOfflineProfiles();
    const timer = window.setInterval(() => void syncOfflineProfiles(), 5 * 60_000);
    const online = () => void syncOfflineProfiles();
    window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [syncOfflineProfiles]);

  const syncQueuedPunches = useCallback(async () => {
    if (!serverUrl) return;
    const queue = storedJson<QueuedPunch[]>(OFFLINE_QUEUE_KEY, []);
    if (!queue.length) { setQueuedCount(0); return; }
    const remaining: QueuedPunch[] = [];
    for (const punch of queue) {
      try {
        await data(await fetch(`${serverUrl}/api/kiosk/offline-punch`, {
          method: "POST",
          headers: kioskHeaders({ Authorization: `Bearer ${punch.offlineToken}`, "Content-Type": "application/json" }),
          body: JSON.stringify({ type: punch.type, occurredAt: punch.occurredAt, idempotencyKey: punch.idempotencyKey, deviceLabel: "Android kiosk · saved offline" }),
        }));
      } catch { remaining.push(punch); }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    setQueuedCount(remaining.length);
  }, [serverUrl]);

  const checkForUpdate = useCallback(async (updateState?: KioskUpdateState, lastUpdateError?: string | null, suppressDisplay = false) => {
    if (!serverUrl || !deviceLabel || !Capacitor.isNativePlatform()) return null;
    try {
      const info = await AppUpdate.getAppInfo();
      const deviceId = storedDeviceId();
      const result = await data(await fetch(`${serverUrl}/api/kiosk/updates/check`, {
        method: "POST",
        headers: kioskHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          deviceId,
          label: deviceLabel,
          versionCode: info.versionCode,
          versionName: info.versionName,
          updateState,
          lastUpdateError: lastUpdateError ?? null,
        }),
      })) as { update: AvailableUpdate | null };
      if (!suppressDisplay) setAvailableUpdate(result.update);
      return result.update;
    } catch {
      return null;
    }
  }, [deviceLabel, serverUrl]);

  useEffect(() => {
    void syncQueuedPunches();
    const timer = window.setInterval(() => void syncQueuedPunches(), 15_000);
    const online = () => void syncQueuedPunches();
    window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [syncQueuedPunches]);

  useEffect(() => {
    void checkForUpdate();
    const timer = window.setInterval(() => void checkForUpdate(), 6 * 60 * 60_000);
    const online = () => void checkForUpdate();
    window.addEventListener("online", online);
    return () => { window.clearInterval(timer); window.removeEventListener("online", online); };
  }, [checkForUpdate]);

  useEffect(() => {
    if (session?.employee.manager && !session.offline) void checkForUpdate();
  }, [checkForUpdate, session?.employee.manager, session?.offline]);

  const returnToCode = useCallback((nextNotice?: { kind: "error" | "success"; text: string }) => {
    setScheduleOpen(false);
    setSession(null); setSessionToken(""); setManagerReview(null); setOfflineProfileKey(""); setEmployeeId(""); setCorrectionOpen(false); setTargetPunchId(""); setRequestedAt(""); setNote(""); setBusy(false); setNotice(nextNotice ?? null);
  }, []);

  useEffect(() => {
    if (!session || managerReview) return;
    let timer = 0;
    const restart = () => { window.clearTimeout(timer); timer = window.setTimeout(() => returnToCode({ kind: "error", text: "For privacy, this session ended after one minute without activity." }), 60_000); };
    restart();
    window.addEventListener("pointerdown", restart, { passive: true }); window.addEventListener("keydown", restart); window.addEventListener("input", restart);
    return () => { window.clearTimeout(timer); window.removeEventListener("pointerdown", restart); window.removeEventListener("keydown", restart); window.removeEventListener("input", restart); };
  }, [managerReview, returnToCode, session]);

  useEffect(() => {
    if (!managerReview) return;
    let timer = 0;
    const restart = () => { window.clearTimeout(timer); timer = window.setTimeout(() => returnToCode({ kind: "error", text: "Manager review closed after two minutes without activity." }), 120_000); };
    restart();
    window.addEventListener("pointerdown", restart, { passive: true }); window.addEventListener("keydown", restart); window.addEventListener("scroll", restart, { passive: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("pointerdown", restart); window.removeEventListener("keydown", restart); window.removeEventListener("scroll", restart); };
  }, [managerReview, returnToCode]);

  const dateTime = useMemo(() => new Intl.DateTimeFormat("en-US", { timeZone: managerReview?.timeZone ?? session?.timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }), [managerReview?.timeZone, session?.timeZone]);

  async function saveServer(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const normalized = normalizedServer(serverDraft);
    const normalizedLabel = deviceLabelDraft.trim();
    if (!normalized) { setNotice({ kind: "error", text: "Enter an HTTPS server address. HTTP is allowed only for local development." }); setBusy(false); return; }
    if (!normalizedLabel) { setNotice({ kind: "error", text: "Give this tablet a short name, such as T1 or T2." }); setBusy(false); return; }
    try {
      await data(await fetch(`${normalized}/api/health`, { cache: "no-store" }));
      localStorage.setItem("timeclock-server", normalized); localStorage.setItem(DEVICE_LABEL_KEY, normalizedLabel); setServerUrl(normalized); setDeviceLabel(normalizedLabel); setSetupOpen(false); returnToCode({ kind: "success", text: "TimeClock is connected and ready." });
      void syncOfflineProfiles(normalized);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? `Could not connect: ${error.message}` : "Could not connect." }); }
    finally { setBusy(false); }
  }

  async function signIn() {
    if (busy || employeeId.length !== 4) return;
    setBusy(true); setNotice(null);
    const profileKey = await pinDigest(employeeId);
    try {
      const result = await data(await fetch(`${serverUrl}/api/kiosk/session`, { method: "POST", headers: kioskHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ pin: employeeId }) })) as Session;
      setSession(result); setSessionToken(result.sessionToken); setOfflineProfileKey(profileKey); setEmployeeId("");
      void syncQueuedPunches();
    } catch (error) {
      const cached = storedJson<Record<string, Session>>(OFFLINE_PROFILES_KEY, {})[profileKey];
      if (!(error as Error & { status?: number }).status) {
        if (cached) {
          setSession({ ...cached, offline: true }); setSessionToken(""); setOfflineProfileKey(profileKey); setEmployeeId("");
          setNotice({ kind: "success", text: "Not connected to internet. You can still clock in or out, and your punch will be saved locally." });
        } else {
          setEmployeeId("");
          setNotice({ kind: "error", text: "Not connected to internet. This employee has not been prepared for offline use on this tablet yet. Reconnect once and try again." });
        }
      } else {
        setEmployeeId(""); setNotice({ kind: "error", text: error instanceof Error ? error.message : "That PIN could not be checked." });
      }
    }
    finally { setBusy(false); }
  }

  async function loadManagerReview(periodStart: string) {
    setBusy(true); setNotice(null);
    try {
      const query = periodStart ? `?periodStart=${encodeURIComponent(periodStart)}` : "";
      const result = await data(await fetch(`${serverUrl}/api/kiosk/manager/review${query}`, {
        cache: "no-store",
        headers: kioskHeaders({ Authorization: `Bearer ${sessionToken}` }),
      })) as { review: ManagerReview };
      setManagerReview(result.review);
    } catch (error) {
      if ([401, 403].includes((error as Error & { status?: number }).status ?? 0)) returnToCode({ kind: "error", text: error instanceof Error ? error.message : "An Admin Account is required." });
      else setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load manager review." });
    } finally { setBusy(false); }
  }

  async function installAvailableUpdate() {
    if (!availableUpdate || !session?.employee.manager || session.offline || updateBusy) return;
    setUpdateBusy(true); setNotice(null);
    try {
      await syncQueuedPunches();
      const queued = storedJson<QueuedPunch[]>(OFFLINE_QUEUE_KEY, []);
      if (queued.length) throw new Error(`${queued.length} offline ${queued.length === 1 ? "punch is" : "punches are"} still waiting to synchronize. The update was postponed.`);
      const info = await AppUpdate.getAppInfo();
      if (!info.canInstallPackages) {
        await AppUpdate.openInstallPermissionSettings();
        throw new Error("Allow TimeClock to install updates, then return here and tap Install update again.");
      }
      await checkForUpdate("DOWNLOADING");
      const deviceId = storedDeviceId();
      await AppUpdate.downloadAndInstall({
        url: new URL(availableUpdate.downloadPath, `${serverUrl}/`).toString(),
        sha256: availableUpdate.sha256,
        certificateSha256: availableUpdate.certificateSha256,
        headers: kioskHeaders({ "X-TimeClock-Device-Id": deviceId }),
      });
      await checkForUpdate("INSTALLING");
      setNotice({ kind: "success", text: "Android is ready to install the verified update. Confirm the system prompt to finish." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The tablet update could not be installed.";
      await checkForUpdate("FAILED", message);
      setNotice({ kind: "error", text: message });
    } finally {
      setUpdateBusy(false);
    }
  }

  function scheduleReturn(text: string) { setNotice({ kind: "success", text }); confirmationTimer.current = window.setTimeout(() => returnToCode({ kind: "success", text }), 1_800); }

  async function punch(type: PunchType) {
    setBusy(true); setNotice(null); let completed = false;
    const occurredAt = new Date().toISOString();
    const idempotencyKey = crypto.randomUUID();
    const updateLocalState = (id: string, timestamp: string) => setSession((current) => current ? {
      ...current,
      allowedPunchTypes: [type === "WORK_IN" ? "WORK_OUT" : "WORK_IN"],
      recentPunches: [{ id, type, occurredAt: timestamp }, ...current.recentPunches].slice(0, 12),
    } : current);
    const saveOffline = () => {
      if (!session) return;
      const queue = storedJson<QueuedPunch[]>(OFFLINE_QUEUE_KEY, []);
      queue.push({ employeeId: session.employee.id, offlineToken: session.offlineToken, idempotencyKey, type, occurredAt });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue)); setQueuedCount(queue.length);
      updateLocalState(idempotencyKey, occurredAt); completed = true;
      const message = `Not connected to internet. Your ${labels[type].toLowerCase()} at ${new Date(occurredAt).toLocaleTimeString()} has been saved locally and will sync automatically.`;
      if (session.employee.manager) { setNotice({ kind: "success", text: message }); setBusy(false); }
      else scheduleReturn(message);
    };
    try {
      if (session?.offline) { saveOffline(); return; }
      const result = await data(await fetch(`${serverUrl}/api/kiosk/punch`, { method: "POST", headers: kioskHeaders({ "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" }), body: JSON.stringify({ type, idempotencyKey, deviceLabel: "Android kiosk" }) }));
      completed = true;
      const recordedText = `${labels[type]} recorded at ${new Date(result.punch.occurredAt).toLocaleTimeString()}.`;
      updateLocalState(result.punch.id, result.punch.occurredAt);
      if (session?.employee.manager) {
        setNotice({ kind: "success", text: recordedText });
        setBusy(false);
      } else {
        scheduleReturn(`${recordedText} Returning to the PIN screen…`);
      }
    } catch (error) {
      if (!(error as Error & { status?: number }).status && session?.offlineToken) saveOffline();
      else if ((error as Error & { status?: number }).status === 401) returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your PIN again." });
      else setNotice({ kind: "error", text: error instanceof Error ? error.message : "Punch failed. Nothing was recorded." });
    } finally { if (!completed) setBusy(false); }
  }

  async function requestCorrection(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null); let completed = false;
    try {
      await data(await fetch(`${serverUrl}/api/kiosk/corrections`, { method: "POST", headers: kioskHeaders({ "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json" }), body: JSON.stringify({ kind, targetPunchId: kind === "WRONG_TIME" ? targetPunchId || null : null, requestedType: kind === "MISSED_PUNCH" ? requestedType : null, requestedOccurredAt: kind !== "OTHER" && requestedAt ? new Date(requestedAt).toISOString() : null, note }) }));
      completed = true; scheduleReturn("Correction request recorded for manager review. The original remains preserved. Returning to the PIN screen…");
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) returnToCode({ kind: "error", text: error instanceof Error ? error.message : "Enter your PIN again." });
      else setNotice({ kind: "error", text: error instanceof Error ? error.message : "Request failed." });
    } finally { if (!completed) setBusy(false); }
  }

  function startConfigurationHold() {
    configurationTimer.current = window.setTimeout(() => { setServerDraft(serverUrl); setDeviceLabelDraft(deviceLabel); setSetupOpen(true); }, 4_000);
  }
  function cancelConfigurationHold() { if (configurationTimer.current !== null) window.clearTimeout(configurationTimer.current); configurationTimer.current = null; }

  if (setupOpen) return <main className="shell setup-shell"><form className="panel setup" onSubmit={saveServer}>
    <p className="eyebrow">Admin Account configuration</p><h1>Connect this tablet</h1><p className="muted">Name the tablet and enter the HTTPS address for the TimeClock service. These settings stay on this device.</p>
    {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    <label>Tablet name<input value={deviceLabelDraft} onChange={(event) => setDeviceLabelDraft(event.target.value)} placeholder="T1" maxLength={80} required /></label>
    <label>Server address<input type="url" value={serverDraft} onChange={(event) => setServerDraft(event.target.value)} placeholder="https://timeclock.example.com" required /></label>
    <button className="button primary" disabled={busy}>{busy ? "Testing connection…" : "Save and connect"}</button>
    {serverUrl && <button className="button quiet" type="button" onClick={() => setSetupOpen(false)}>Cancel</button>}
  </form></main>;

  return <main className="shell">
    <header className="brand"><button className="brand-mark-button" onPointerDown={startConfigurationHold} onPointerUp={cancelConfigurationHold} onPointerCancel={cancelConfigurationHold} onPointerLeave={cancelConfigurationHold} onContextMenu={(event) => event.preventDefault()} aria-label="TimeClock"><span>T</span></button><h1>TimeClock</h1></header>
    {!managerReview && <section className="clock"><p>{dateTime.format(now).split(" at ")[0]}</p><strong>{dateTime.format(now).split(" at ")[1]}</strong></section>}
    {notice && <div className={`notice ${notice.kind}`} role="status">{notice.text}</div>}
    {managerReview ? <section className="manager-review">
      <header className="panel manager-review-header">
        <div><p className="eyebrow">Read-only manager review</p><h2>Biweekly employee punches</h2><p className="muted">Live central records for {managerReview.periodStart} through {managerReview.periodEnd}. Generated {new Date(managerReview.generatedAt).toLocaleTimeString()}.</p></div>
        <button className="button quiet" type="button" onClick={() => setManagerReview(null)}>Back to my clock</button>
      </header>
      <nav className="manager-period-nav" aria-label="Pay period navigation">
        <button className="button secondary" type="button" disabled={busy} onClick={() => void loadManagerReview(shiftDate(managerReview.periodStart, -14))}>← Previous two weeks</button>
        <span>{managerReview.periodStart} — {managerReview.periodEnd}</span>
        <button className="button secondary" type="button" disabled={busy} onClick={() => void loadManagerReview(shiftDate(managerReview.periodStart, 14))}>Next two weeks →</button>
      </nav>
      {managerReview.employees.length === 0 && <div className="panel empty">No active employees are configured.</div>}
      {managerReview.employees.map(({ employee, summary }) => <article className="panel manager-employee" key={employee.id}>
        <header className="manager-employee-header">
          <div><p className="eyebrow">Employee {employee.employeeNumber}</p><h2>{employee.firstName} {employee.lastName}</h2></div>
          <div className="manager-totals"><span>Exact <strong>{formatDuration(summary.actualMilliseconds)}</strong></span><span>Credit <strong>+{formatDuration(summary.creditMilliseconds)}</strong></span><span>Payable <strong>{formatDuration(summary.payableMilliseconds)}</strong></span><span>OT <strong>{formatDuration(summary.overtimeMilliseconds)}</strong></span></div>
        </header>
        {summary.issues.length > 0 && <div className="manager-flag">Review required: {summary.issues.length} {summary.issues.length === 1 ? "flag" : "flags"}</div>}
        {summary.weeks.map((week) => <section className="manager-week" key={week.weekNumber}>
          <header><strong>Week {week.weekNumber}</strong><span>{week.startDate} — {week.endDate}</span><span>{formatDuration(week.payableMilliseconds)} payable{week.overtimeMilliseconds ? ` · ${formatDuration(week.overtimeMilliseconds)} OT` : ""}</span></header>
          <div className="manager-table-wrap"><table><thead><tr><th>Day</th><th>Punches</th><th>Exact</th><th>Credit</th><th>Payable</th><th>Status</th></tr></thead><tbody>
            {week.days.map((day) => <tr className={day.issues.length ? "flagged-row" : ""} key={day.date}>
              <th>{dayLabel(day.date)}</th>
              <td className="manager-punches">{day.punches.length ? day.punches.map((punch) => <span key={punch.id}>{labels[punch.type]} {punch.localTime}{punch.revised ? " *" : ""}</span>) : <span className="muted">—</span>}</td>
              <td>{formatDuration(day.actualMilliseconds)}</td><td>{day.creditMilliseconds ? `+${formatDuration(day.creditMilliseconds)}` : "—"}</td><td><strong>{formatDuration(day.payableMilliseconds)}</strong></td><td>{day.issues.length ? day.issues.map((issue) => <span className="flag" key={issue.code}>{issue.message}</span>) : <span className="ok-mark">Clear</span>}</td>
            </tr>)}
          </tbody></table></div>
        </section>)}
      </article>)}
    </section> : !session ? <form className="panel clock-code-panel" onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
      <p className="eyebrow">Employee timeclock</p><h2>Enter your PIN</h2><p className="muted">Use your private four-digit PIN. Confirm the correct action on the next screen.</p>
      <Keypad value={employeeId} onChange={setEmployeeId} submit={() => void signIn()} busy={busy} />
    </form> : <div className="grid">
      <section className="panel actions"><div className="welcome"><div><p className="eyebrow">Confirm your action</p><h2>{session.employee.firstName} {session.employee.lastName}</h2>{session.employee.manager && <p className="employee-number">Admin Account</p>}{session.offline && <p className="employee-number">Offline · punches save on this tablet</p>}</div><button className="button quiet" onClick={() => returnToCode()}>Done</button></div>
        <div className={`action-grid action-count-${session.allowedPunchTypes.length}`}>{session.allowedPunchTypes.map((type) => <button className={`punch ${type}`} onClick={() => punch(type)} disabled={busy} key={type}><strong>Confirm {labels[type].toLowerCase()}</strong><small>{type === "WORK_IN" ? "You are currently clocked out" : "You are currently clocked in"}</small></button>)}</div>
        <p className="break"><b>No automatic deductions:</b> TimeClock counts the time between clock in and clock out. For an unpaid meal, clock out when it begins and clock back in when work resumes.</p>
        {session.employee.manager && <button className="button primary" type="button" disabled={busy || session.offline} onClick={() => void loadManagerReview("")}>{session.offline ? "See hours requires internet" : "See hours for every employee"}</button>}
        {session.employee.manager && availableUpdate && <aside className="tablet-update-card">
          <p className="eyebrow">Tablet update available</p>
          <h3>TimeClock {availableUpdate.versionName}</h3>
          <p>{availableUpdate.releaseNotes}</p>
          <small>{Math.max(1, Math.round(availableUpdate.byteSize / 1_048_576))} MB · signed and verified before Android opens the installer</small>
          <div className="decision-row">
            <button className="button primary" type="button" disabled={busy || updateBusy || session.offline} onClick={() => void installAvailableUpdate()}>{updateBusy ? "Preparing update…" : "Install update"}</button>
            <button className="button quiet" type="button" disabled={updateBusy} onClick={() => { setAvailableUpdate(null); void checkForUpdate("DISMISSED", null, true); }}>Later</button>
          </div>
          <p className="form-help">Punching stays available even when an update is postponed.</p>
        </aside>}
      </section>
      <section className="panel recent"><p className="eyebrow">Your record</p><h2>Recently recorded time</h2><ol>{session.recentPunches.length === 0 && <li className="empty">No punches yet.</li>}{session.recentPunches.map((item) => <li key={item.id}><span>{labels[item.type]}</span><time>{new Intl.DateTimeFormat("en-US", { timeZone: session.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.occurredAt))}</time>{item.revised && <small>Corrected; original preserved</small>}</li>)}</ol>
        <button className="button secondary" onClick={() => setCorrectionOpen((open) => !open)}>{correctionOpen ? "Close correction form" : "Correct my time record"}</button>
      </section>
      <div className="schedule-launch"><button className="button secondary" disabled={busy || session.offline} onClick={() => setScheduleOpen((open) => !open)}>{scheduleOpen ? "Close my schedule" : "My schedule & time off"}</button>{session.offline && <p className="muted">Reconnect and sign in to view your schedule or request time off.</p>}</div>
      {scheduleOpen && !session.offline && <Schedule sessionToken={sessionToken} serverUrl={serverUrl} deviceKey={DEVICE_KEY} onSessionExpired={returnToCode} />}
      {correctionOpen && <form className="panel correction" onSubmit={requestCorrection}><p className="eyebrow">Protect the record</p><h2>Tell us what your time should show</h2><p className="muted">The original remains available for review. This screen closes after submission or inactivity.</p>
        <label>What happened?<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="MISSED_PUNCH">I missed a punch</option><option value="WRONG_TIME">A punch has the wrong time</option><option value="OTHER">Something else</option></select></label>
        {kind === "WRONG_TIME" && <label>Which punch?<select value={targetPunchId} onChange={(event) => setTargetPunchId(event.target.value)} required><option value="">Choose a recent punch</option>{session.recentPunches.map((item) => <option value={item.id} key={item.id}>{labels[item.type]} — {new Date(item.occurredAt).toLocaleString()}</option>)}</select></label>}
        {kind === "MISSED_PUNCH" && <label>Missed action<select value={requestedType} onChange={(event) => setRequestedType(event.target.value as PunchType)}><option value="WORK_IN">Clock in</option><option value="WORK_OUT">Clock out</option></select></label>}
        {kind !== "OTHER" && <label>Requested date and time<input type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} required /></label>}
        <label>Explanation<textarea rows={4} minLength={5} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} required /></label>
        <button className="button primary" disabled={busy}>{busy ? "Submitting…" : "Submit correction request"}</button>
      </form>}
    </div>}
    <footer className="kiosk-footer">{managerReview ? "Manager review is read-only and closes automatically. Punches come from the central TimeClock database." : `${queuedCount ? `${queuedCount} ${queuedCount === 1 ? "punch" : "punches"} saved locally, waiting to sync when internet returns. ` : ""}Original punches remain auditable. Use the correction request if your record does not match your work.`}</footer>
  </main>;
}
