import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const clockCode = process.env.SEED_CLOCK_CODE ?? "731905";
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "development-only-password";

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
  headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.20" },
  body: JSON.stringify({ clockCode: "000000" }),
});
assert.equal(badAttempt.status, 401);
assert.equal((await badAttempt.text()).includes("000000"), false, "A failed code must not be echoed.");

for (let attempt = 0; attempt < 8; attempt += 1) {
  await fetch(`${baseUrl}/api/kiosk/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.21" },
    body: JSON.stringify({ clockCode: "000000" }),
  });
}
const limited = await fetch(`${baseUrl}/api/kiosk/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.21" },
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

const employees = await request("/api/admin/employees", { headers: { Cookie: cookie } });
const employee = employees.body.employees.find((item) => item.firstName === "Sample" && item.lastName === "Employee");
assert.ok(employee);
assert.equal(employee.codeConfigured, true);
assert.equal("clockCodeHash" in employee, false);
assert.equal("clockCodeLookup" in employee, false);
assert.equal("legacyEmployeeCode" in employee, false);

const duplicateCode = await fetch(`${baseUrl}/api/admin/employees`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ firstName: "Duplicate", lastName: "Code", clockCode }),
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

const exportResponse = await fetch(`${baseUrl}/api/admin/timesheets/${employee.id}/export?periodStart=${sheet.body.summary.periodStart}`, { headers: { Cookie: cookie } });
assert.equal(exportResponse.status, 200);
const csv = await exportResponse.text();
assert.ok(csv.includes("Draft review record"));
assert.ok(csv.includes("Correction history"));
assert.equal(csv.includes(clockCode), false);

console.log("API smoke test passed: private clock-code auth, throttling, punches, corrections, and evidence packet reconciled.");
