import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const clockCode = process.env.SEED_CLOCK_CODE ?? "731905";
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "development-only-password";
const sourceSegment = crypto.randomUUID().slice(0, 4);
const failedCodeSource = `2001:db8:${sourceSegment}::20`;
const limitedCodeSource = `2001:db8:${sourceSegment}::21`;
const limitedAdminSource = `2001:db8:${sourceSegment}::22`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

const health = await request("/api/health", { headers: { Origin: "https://localhost" } });
assert.equal(health.body.status, "ok");
assert.equal(health.response.headers.get("access-control-allow-origin"), "https://localhost");

const badAttempt = await fetch(`${baseUrl}/api/kiosk/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": failedCodeSource },
  body: JSON.stringify({ clockCode: "000000" }),
});
assert.equal(badAttempt.status, 401);
assert.equal((await badAttempt.text()).includes("000000"), false, "A failed code must not be echoed.");

for (let attempt = 0; attempt < 8; attempt += 1) {
  await fetch(`${baseUrl}/api/kiosk/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": limitedCodeSource },
    body: JSON.stringify({ clockCode: "000000" }),
  });
}
const limited = await fetch(`${baseUrl}/api/kiosk/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": limitedCodeSource },
  body: JSON.stringify({ clockCode: "000000" }),
});
assert.equal(limited.status, 429);
assert.ok(Number(limited.headers.get("retry-after")) >= 1);

const initial = await request("/api/kiosk/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({ clockCode }),
});
assert.ok(initial.body.employee.id);
assert.ok(initial.body.sessionToken);
assert.equal(JSON.stringify(initial.body).includes(clockCode), false);
let sessionToken = initial.body.sessionToken;

async function punch(type) {
  return request("/api/kiosk/punch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json", Origin: "https://localhost" },
    body: JSON.stringify({ type, idempotencyKey: crypto.randomUUID(), deviceLabel: "Automated smoke test" }),
  });
}

let workingState = initial.body.allowedPunchTypes;
if (!workingState.includes("WORK_IN")) {
  if (workingState.includes("MEAL_END")) await punch("MEAL_END");
  await punch("WORK_OUT");
}
await punch("WORK_IN");
const out = await punch("WORK_OUT");
const correctedTime = new Date(new Date(out.body.punch.occurredAt).getTime() + 60_000).toISOString();

const refreshed = await request("/api/kiosk/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({ clockCode }),
});
sessionToken = refreshed.body.sessionToken;

await request("/api/kiosk/corrections", {
  method: "POST",
  headers: { "Authorization": `Bearer ${sessionToken}`, "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({
    kind: "WRONG_TIME",
    targetPunchId: out.body.punch.id,
    requestedOccurredAt: correctedTime,
    note: "Automated verification of the auditable correction workflow.",
  }),
});

const login = await request("/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "Admin login did not set a session cookie.");

for (let attempt = 0; attempt < 6; attempt += 1) {
  const failedLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": limitedAdminSource },
    body: JSON.stringify({ email: adminEmail, password: "incorrect-development-password" }),
  });
  assert.equal(failedLogin.status, 401);
  assert.equal((await failedLogin.text()).includes("incorrect-development-password"), false);
}
const limitedLogin = await fetch(`${baseUrl}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": limitedAdminSource },
  body: JSON.stringify({ email: adminEmail, password: "incorrect-development-password" }),
});
assert.equal(limitedLogin.status, 429);
assert.ok(Number(limitedLogin.headers.get("retry-after")) >= 1);

const employees = await request("/api/admin/employees", { headers: { Cookie: cookie } });
const employee = employees.body.employees.find((item) => item.employeeNumber === "1001");
assert.ok(employee);
assert.equal(employee.employeeNumber, "1001");
assert.equal(employee.codeConfigured, true);
assert.equal("clockCodeHash" in employee, false);
assert.equal("clockCodeLookup" in employee, false);
assert.equal("legacyEmployeeCode" in employee, false);

const duplicateCode = await fetch(`${baseUrl}/api/admin/employees`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ employeeNumber: "1999", firstName: "Duplicate", lastName: "Code", clockCode }),
});
assert.equal(duplicateCode.status, 409, "Clock codes must be unique.");

const corrections = await request("/api/admin/corrections?status=PENDING", { headers: { Cookie: cookie } });
const correction = corrections.body.corrections.find((item) => item.targetPunch?.id === out.body.punch.id);
assert.ok(correction);

await request(`/api/admin/corrections/${correction.id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ decision: "APPROVE", resolutionNote: "Approved by automated end-to-end verification." }),
});

const sheet = await request(`/api/admin/timesheets/${employee.id}`, { headers: { Cookie: cookie } });
assert.equal(sheet.body.summary.weeks.length, 2);
assert.equal(sheet.body.report.approvalState, "DRAFT_REVIEW_RECORD");
assert.ok(sheet.body.summary.weeks.flatMap((week) => week.days).flatMap((day) => day.punches).some((item) => item.id === out.body.punch.id && item.revised));
assert.ok(sheet.body.summary.payableMilliseconds >= sheet.body.summary.actualMilliseconds);

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const nextPeriodStart = shiftIsoDate(sheet.body.summary.periodStart, 14);
const movedAcrossBoundary = `${shiftIsoDate(sheet.body.summary.periodStart, 19)}T20:00:00.000Z`;
const boundarySession = await request("/api/kiosk/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({ clockCode }),
});
const boundaryRequest = await request("/api/kiosk/corrections", {
  method: "POST",
  headers: { "Authorization": `Bearer ${boundarySession.body.sessionToken}`, "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({
    kind: "WRONG_TIME",
    targetPunchId: out.body.punch.id,
    requestedOccurredAt: movedAcrossBoundary,
    note: "Automated verification that an effective correction follows its reporting period.",
  }),
});
await request(`/api/admin/corrections/${boundaryRequest.body.correction.id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ decision: "APPROVE", resolutionNote: "Temporary approved move for reporting-boundary verification." }),
});
const originalPeriodAfterMove = await request(`/api/admin/timesheets/${employee.id}?periodStart=${sheet.body.summary.periodStart}`, { headers: { Cookie: cookie } });
const nextPeriodAfterMove = await request(`/api/admin/timesheets/${employee.id}?periodStart=${nextPeriodStart}`, { headers: { Cookie: cookie } });
const originalIdsAfterMove = originalPeriodAfterMove.body.summary.weeks.flatMap((week) => week.days).flatMap((day) => day.punches).map((item) => item.id);
const nextPunchesAfterMove = nextPeriodAfterMove.body.summary.weeks.flatMap((week) => week.days).flatMap((day) => day.punches);
assert.equal(originalIdsAfterMove.includes(out.body.punch.id), false, "A punch moved out of a period must not remain in that period.");
assert.ok(nextPunchesAfterMove.some((item) => item.id === out.body.punch.id && item.occurredAt === movedAcrossBoundary), "A moved punch must appear in its effective period.");

const restoreSession = await request("/api/kiosk/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({ clockCode }),
});
const restoreRequest = await request("/api/kiosk/corrections", {
  method: "POST",
  headers: { "Authorization": `Bearer ${restoreSession.body.sessionToken}`, "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({
    kind: "WRONG_TIME",
    targetPunchId: out.body.punch.id,
    requestedOccurredAt: correctedTime,
    note: "Restore the synthetic punch after reporting-boundary verification.",
  }),
});
await request(`/api/admin/corrections/${restoreRequest.body.correction.id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ decision: "APPROVE", resolutionNote: "Restored after successful reporting-boundary verification." }),
});
const restoredPeriod = await request(`/api/admin/timesheets/${employee.id}?periodStart=${sheet.body.summary.periodStart}`, { headers: { Cookie: cookie } });
assert.ok(restoredPeriod.body.summary.weeks.flatMap((week) => week.days).flatMap((day) => day.punches).some((item) => item.id === out.body.punch.id && item.occurredAt === correctedTime));

const exportResponse = await fetch(`${baseUrl}/api/admin/timesheets/${employee.id}/export?periodStart=${sheet.body.summary.periodStart}`, { headers: { Cookie: cookie } });
assert.equal(exportResponse.status, 200);
const csv = await exportResponse.text();
assert.ok(csv.includes("Draft review record"));
assert.ok(csv.includes("Correction history"));
assert.ok(csv.includes("Official employee number"));
assert.ok(csv.includes("1001"));
assert.equal(csv.includes(clockCode), false);

console.log("API smoke test passed: official employee identity, private authentication, throttling, immutable corrections (including period moves), and evidence output reconciled.");
