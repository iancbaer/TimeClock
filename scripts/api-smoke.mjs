import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const employeeCode = process.env.SEED_EMPLOYEE_CODE ?? "1001";
const pin = process.env.SEED_EMPLOYEE_PIN ?? "2468";
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

const credentials = { employeeCode, pin };
const initial = await request("/api/kiosk/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify(credentials),
});
assert.ok(initial.body.employee.id);

async function punch(type) {
  return request("/api/kiosk/punch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://localhost" },
    body: JSON.stringify({ ...credentials, type, idempotencyKey: crypto.randomUUID(), deviceLabel: "Automated smoke test" }),
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

await request("/api/kiosk/corrections", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://localhost" },
  body: JSON.stringify({
    ...credentials,
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
const employee = employees.body.employees.find((item) => item.employeeCode === employeeCode);
assert.ok(employee);
const corrections = await request("/api/admin/corrections?status=PENDING", { headers: { Cookie: cookie } });
const correction = corrections.body.corrections.find((item) => item.targetPunch?.id === out.body.punch.id);
assert.ok(correction);

await request(`/api/admin/corrections/${correction.id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ decision: "APPROVE", resolutionNote: "Approved by automated end-to-end verification." }),
});

const sheet = await request(`/api/admin/timesheets/${employee.id}`, { headers: { Cookie: cookie } });
assert.equal(sheet.body.employee.employeeCode, employeeCode);
assert.equal(sheet.body.summary.weeks.length, 2);
assert.ok(sheet.body.summary.weeks.flatMap((week) => week.days).flatMap((day) => day.punches).some((item) => item.id === out.body.punch.id && item.revised));
assert.ok(sheet.body.summary.payableMilliseconds >= sheet.body.summary.actualMilliseconds);
console.log("API smoke test passed: kiosk punches, correction approval, and two-week sheet reconciled.");
