import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { promoteGlobalAdmin } from "../lib/admin-promotion";

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: {
      email: { type: "string" }, "expected-id": { type: "string" },
      apply: { type: "boolean", default: false }, "confirm-email": { type: "string" }, help: { type: "boolean" },
    }, strict: true, allowPositionals: false }));
    if (values.help) {
      console.log("Usage: npm run admin:promote --workspace @timeclock/web -- --email EMAIL --expected-id ID [--apply --confirm-email EMAIL]\nDefaults to read-only preview. Apply changes only this existing active account's role and writes an audit event.");
      return;
    }
    if (!z.email().safeParse(values.email).success || !values["expected-id"]?.trim()
      || values.email !== values.email?.trim().toLowerCase()
      || (values.apply && values["confirm-email"] !== values.email)) throw new Error("Invalid arguments");
  } catch {
    console.error("Invalid promotion arguments. Use --help. No database access attempted.");
    process.exitCode = 1;
    return;
  }
  const db = new PrismaClient();
  try {
    const result = await promoteGlobalAdmin(db, { email: values.email!, expectedId: values["expected-id"]!, apply: values.apply });
    console.log(JSON.stringify(result));
  } catch {
    // Do not expose connection strings, account records or raw database errors.
    console.error("Promotion failed or could not be verified. Check target identity, migration and database access; inspect current role before retrying.");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
void main();
