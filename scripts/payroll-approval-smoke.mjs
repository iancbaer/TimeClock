import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { DateTime } from "luxon";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../apps/web/node_modules/@prisma/client");

const baseUrl = process.env.TIMECLOCK_SMOKE_BASE_URL ?? "http://127.0.0.1:3200";
const adminEmail = process.env.TIMECLOCK_SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.TIMECLOCK_SMOKE_ADMIN_PASSWORD;
const employeePin = process.env.TIMECLOCK_SMOKE_EMPLOYEE_PIN;

if (process.env.TIMECLOCK_SMOKE_ALLOW_MUTATION !== "isolated-test-only") {
  throw new Error(
    "Set TIMECLOCK_SMOKE_ALLOW_MUTATION=isolated-test-only to run this mutating validation.",
  );
}
const parsedBase = new URL(baseUrl);
if (!["127.0.0.1", "localhost"].includes(parsedBase.hostname)) {
  throw new Error(
    "Payroll approval smoke validation may run only against localhost.",
  );
}
if (!adminEmail || !adminPassword || !employeePin || !process.env.DATABASE_URL) {
  throw new Error(
    "Set the isolated admin credentials, employee PIN, and DATABASE_URL before running this validation.",
  );
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "Expected an administrator session cookie.");
  return value.split(";", 1)[0];
}

async function request(path, { cookie, token, method = "GET", body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response) {
  const value = await response.json();
  return { response, value };
}

async function expectJson(path, options, status) {
  const result = await json(await request(path, options));
  assert.equal(
    result.response.status,
    status,
    `${options?.method ?? "GET"} ${path}: ${JSON.stringify(result.value)}`,
  );
  return result.value;
}

const zone = "America/Los_Angeles";
const anchor = DateTime.fromISO("2026-08-24", { zone });
const today = DateTime.now().setZone(zone).startOf("day");
const periodIndex = Math.floor(today.diff(anchor, "days").days / 14);
const previousStart = anchor.plus({ days: (periodIndex - 1) * 14 });
const periodStart = previousStart.toISODate();
const workDate = previousStart.plus({ days: 3 });
const occurredIn = workDate
  .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
  .toUTC()
  .toISO();
const occurredOut = workDate
  .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
  .toUTC()
  .toISO();
const lateIn = workDate
  .plus({ days: 1 })
  .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
  .toUTC()
  .toISO();

const prisma = new PrismaClient();
try {
  const health = await expectJson("/api/health", {}, 200);
  assert.equal(health.database, "ready");

  await expectJson(`/api/admin/pay-periods/${periodStart}`, {}, 401);

  const login = await request("/api/admin/login", {
    method: "POST",
    body: { email: adminEmail, password: adminPassword },
  });
  assert.equal(login.status, 200);
  const adminCookie = cookieFrom(login);
  const loginBody = await login.json();

  await expectJson(
    `/api/admin/users/${loginBody.admin.id}`,
    {
      cookie: adminCookie,
      method: "PATCH",
      body: { active: false },
    },
    409,
  );

  const managerEmail = `approval-smoke-${randomUUID()}@example.invalid`;
  const createdManager = await expectJson(
    "/api/admin/users",
    {
      cookie: adminCookie,
      method: "POST",
      body: { name: "Approval Smoke Manager", email: managerEmail },
    },
    201,
  );
  assert.ok(createdManager.temporaryPassword.length >= 12);

  const managerLogin = await request("/api/admin/login", {
    method: "POST",
    body: { email: managerEmail, password: createdManager.temporaryPassword },
  });
  assert.equal(managerLogin.status, 200);
  const managerCookie = cookieFrom(managerLogin);
  await managerLogin.json();
  const blockedSetup = await expectJson(
    "/api/admin/users",
    { cookie: managerCookie },
    403,
  );
  assert.equal(blockedSetup.code, "PASSWORD_CHANGE_REQUIRED");
  await expectJson(
    "/api/admin/change-password",
    {
      cookie: managerCookie,
      method: "POST",
      body: {
        currentPassword: createdManager.temporaryPassword,
        newPassword: `Changed-${randomUUID()}-Aa1!`,
      },
    },
    200,
  );
  await expectJson("/api/admin/users", { cookie: managerCookie }, 200);

  const settingsPayload = await expectJson(
    "/api/admin/settings",
    { cookie: adminCookie },
    200,
  );
  const settings = settingsPayload.settings;
  await expectJson(
    "/api/admin/settings",
    {
      cookie: adminCookie,
      method: "PATCH",
      body: {
        companyName: settings.companyName,
        timeZone: settings.timeZone,
        payPeriodAnchor: settings.payPeriodAnchor,
        workweekStartsOn: settings.workweekStartsOn,
        roundingMode: settings.roundingMode,
        roundingIntervalMinutes: settings.roundingIntervalMinutes,
        approvalDelayDays: null,
        approvalOpenLocalTime: null,
      },
    },
    200,
  );
  const unscheduled = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(unscheduled.approval.scheduleConfigured, false);
  await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    {
      cookie: adminCookie,
      method: "POST",
      body: { justification: null },
    },
    409,
  );

  await expectJson(
    "/api/admin/settings",
    {
      cookie: adminCookie,
      method: "PATCH",
      body: {
        companyName: settings.companyName,
        timeZone: settings.timeZone,
        payPeriodAnchor: settings.payPeriodAnchor,
        workweekStartsOn: settings.workweekStartsOn,
        roundingMode: settings.roundingMode,
        roundingIntervalMinutes: settings.roundingIntervalMinutes,
        approvalDelayDays: 1,
        approvalOpenLocalTime: "00:00",
      },
    },
    200,
  );

  const kiosk = await expectJson(
    "/api/kiosk/session",
    {
      method: "POST",
      body: { pin: employeePin },
    },
    200,
  );
  const inKey = randomUUID();
  await expectJson(
    "/api/kiosk/offline-punch",
    {
      token: kiosk.offlineToken,
      method: "POST",
      body: {
        type: "WORK_IN",
        occurredAt: occurredIn,
        idempotencyKey: inKey,
        deviceLabel: "isolated-smoke",
      },
    },
    201,
  );
  await expectJson(
    "/api/kiosk/offline-punch",
    {
      token: kiosk.offlineToken,
      method: "POST",
      body: {
        type: "WORK_OUT",
        occurredAt: occurredOut,
        idempotencyKey: randomUUID(),
        deviceLabel: "isolated-smoke",
      },
    },
    201,
  );
  const storedPunch = await prisma.punch.findUniqueOrThrow({
    where: { idempotencyKey: inKey },
  });
  assert.equal(storedPunch.occurredAt.toISOString(), occurredIn);
  assert.ok(
    storedPunch.recordedAt.getTime() - storedPunch.occurredAt.getTime() >
      60_000,
  );

  await expectJson(
    "/api/kiosk/corrections",
    {
      token: kiosk.sessionToken,
      method: "POST",
      body: {
        kind: "MISSED_PUNCH",
        requestedType: "WORK_IN",
        requestedOccurredAt: previousStart
          .plus({ days: 2 })
          .set({ hour: 9 })
          .toUTC()
          .toISO(),
        note: "Isolated approval smoke pending correction",
      },
    },
    201,
  );

  const draft = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(draft.report.periodStart, periodStart);
  assert.ok(draft.approval.blockers.length > 0);
  const workedSheet = draft.report.employees.find(
    (sheet) => sheet.employee.employeeNumber === "1001",
  );
  assert.ok(workedSheet);
  const punchDay = workedSheet.summary.weeks
    .flatMap((week) => week.days)
    .find((day) => day.date === workDate.toISODate());
  assert.ok(punchDay);
  assert.ok(
    punchDay.punches.some((punch) => punch.localTime.startsWith("9:00")),
  );
  const draftCsv = await request(
    `/api/admin/pay-periods/${periodStart}/export?mode=draft`,
    { cookie: adminCookie },
  );
  assert.equal(draftCsv.status, 200);
  assert.match(await draftCsv.text(), /DRAFT — NOT APPROVED/);

  await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    {
      cookie: adminCookie,
      method: "POST",
      body: { justification: null },
    },
    422,
  );

  const concurrent = await Promise.all([
    request(`/api/admin/pay-periods/${periodStart}`, {
      cookie: adminCookie,
      method: "POST",
      body: {
        justification: "Validated pending correction before payroll handoff.",
      },
    }),
    request(`/api/admin/pay-periods/${periodStart}`, {
      cookie: managerCookie,
      method: "POST",
      body: {
        justification: "Validated pending correction before payroll handoff.",
      },
    }),
  ]);
  assert.deepEqual(
    concurrent.map((response) => response.status).sort(),
    [201, 409],
  );

  const approvedV1 = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(approvedV1.approval.state, "APPROVED");
  assert.equal(approvedV1.selectedApproval.version, 1);
  const approvedCsv = await request(
    `/api/admin/pay-periods/${periodStart}/export?mode=approved`,
    { cookie: adminCookie },
  );
  assert.equal(approvedCsv.status, 200);
  const approvedCsvText = await approvedCsv.text();
  assert.match(approvedCsvText, /APPROVED — PAYROLL FINAL/);
  assert.match(approvedCsvText, /WORK_IN:9:00/);

  await expectJson(
    `/api/admin/pay-periods/${periodStart}/reopen`,
    {
      cookie: adminCookie,
      method: "POST",
      body: {
        reason:
          "Validate approval versioning in the isolated release database.",
      },
    },
    200,
  );
  const reopened = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(reopened.approval.state, "REOPENED");

  const approvedV2Response = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    {
      cookie: adminCookie,
      method: "POST",
      body: {
        justification: "Validated pending correction before second approval.",
      },
    },
    201,
  );
  assert.equal(approvedV2Response.approval.version, 2);
  const immutableV2 = await expectJson(
    `/api/admin/pay-periods/${periodStart}?version=2`,
    { cookie: adminCookie },
    200,
  );
  const frozenReport = JSON.stringify(immutableV2.report);

  await expectJson(
    "/api/kiosk/offline-punch",
    {
      token: kiosk.offlineToken,
      method: "POST",
      body: {
        type: "WORK_IN",
        occurredAt: lateIn,
        idempotencyKey: randomUUID(),
        deviceLabel: "isolated-smoke-late",
      },
    },
    201,
  );
  const stale = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(stale.approval.state, "STALE");
  assert.equal(stale.approval.current.version, 2);
  const blockedFinal = await expectJson(
    `/api/admin/pay-periods/${periodStart}/export?mode=approved`,
    { cookie: adminCookie },
    409,
  );
  assert.equal(blockedFinal.code, "APPROVAL_STALE");
  const historicalExport = await request(
    `/api/admin/pay-periods/${periodStart}/export?mode=approved&version=2`,
    { cookie: adminCookie },
  );
  assert.equal(historicalExport.status, 200);
  assert.match(
    await historicalExport.text(),
    /HISTORICAL APPROVAL — NOT CURRENT/,
  );
  const immutableV2After = await expectJson(
    `/api/admin/pay-periods/${periodStart}?version=2`,
    { cookie: adminCookie },
    200,
  );
  assert.equal(JSON.stringify(immutableV2After.report), frozenReport);

  const employees = await expectJson(
    "/api/admin/employees",
    { cookie: adminCookie },
    200,
  );
  const workedEmployee = employees.employees.find(
    (employee) => employee.employeeNumber === "1001",
  );
  assert.ok(workedEmployee);
  await expectJson(
    `/api/admin/employees/${workedEmployee.id}`,
    {
      cookie: adminCookie,
      method: "PATCH",
      body: { active: false },
    },
    200,
  );
  const afterDeactivation = await expectJson(
    `/api/admin/pay-periods/${periodStart}`,
    { cookie: adminCookie },
    200,
  );
  assert.ok(
    afterDeactivation.report.employees.some(
      (sheet) => sheet.employee.employeeNumber === "1001",
    ),
  );

  const auditActions = await prisma.auditEvent.findMany({
    select: { action: true },
  });
  for (const action of [
    "ADMIN_USER_CREATED",
    "ADMIN_PASSWORD_CHANGED",
    "SETTINGS_UPDATED",
    "PAY_PERIOD_APPROVED",
    "PAY_PERIOD_REOPENED",
    "PAY_PERIOD_APPROVAL_STALE",
  ]) {
    assert.ok(
      auditActions.some((event) => event.action === action),
      `Missing audit event ${action}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        periodStart,
        approvalVersions: 2,
        offlineOccurrencePreserved: occurredIn,
        checks: 22,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
