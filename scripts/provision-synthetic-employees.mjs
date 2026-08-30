import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";

const baseUrl = process.env.NANSHE_BASE_URL ?? "http://127.0.0.1:3000";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const outputPath = process.env.PROVISION_OUTPUT;

if (!adminEmail || !adminPassword || !outputPath) {
  throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, and PROVISION_OUTPUT are required.");
}

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { response, body };
}

const login = await jsonRequest("/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
if (!login.response.ok) throw new Error(`Steward sign-in failed with status ${login.response.status}.`);
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Steward sign-in did not return a session cookie.");

const listing = await jsonRequest("/api/admin/employees", { headers: { Cookie: cookie } });
if (!listing.response.ok) throw new Error(`Employee listing failed with status ${listing.response.status}.`);
const byNumber = new Map(listing.body.employees.map((employee) => [employee.employeeNumber, employee]));
const roster = [];

for (let number = 1001; number <= 1010; number += 1) {
  const employeeNumber = String(number);
  const existing = byNumber.get(employeeNumber);
  let created = false;
  let assignedCode = "";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assignedCode = String(randomInt(100_000, 1_000_000));
    const employee = {
      employeeNumber,
      firstName: "Demo",
      lastName: `Worker ${employeeNumber}`,
      clockCode: assignedCode,
      active: true,
    };
    const result = existing
      ? await jsonRequest(`/api/admin/employees/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(employee),
      })
      : await jsonRequest("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(employee),
      });

    if (result.response.ok) {
      created = !existing;
      break;
    }
    if (result.response.status !== 409 || attempt === 19) {
      throw new Error(`Could not provision employee ${employeeNumber}; server returned ${result.response.status}.`);
    }
  }

  roster.push({ employeeNumber, displayName: `Demo Worker ${employeeNumber}`, clockCode: assignedCode, created });
}

for (const entry of roster) {
  const verification = await jsonRequest("/api/kiosk/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clockCode: entry.clockCode }),
  });
  if (!verification.response.ok || verification.body.employee?.employeeNumber !== entry.employeeNumber) {
    throw new Error(`Authentication verification failed for employee ${entry.employeeNumber}.`);
  }
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const generatedAt = new Date().toISOString();
const lines = [
  ["Nanshe local synthetic access roster"],
  ["Generated at", generatedAt],
  ["Warning", "Private demo credentials. Store securely, replace with real employee names in Steward, and do not commit."],
  [],
  ["Official employee number", "Display name", "Private clock code", "Action"],
  ...roster.map((item) => [item.employeeNumber, item.displayName, item.clockCode, item.created ? "created" : "updated"]),
];
await writeFile(outputPath, `${lines.map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`, { mode: 0o600 });
console.log(`Provisioned and authenticated ${roster.length} synthetic employees. Private roster written to ${outputPath}.`);
