import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("defaults existing and new accounts to Admin without changing latest session and recurrence schema", () => {
 const schema = readFileSync("prisma/schema.prisma", "utf8");
 expect(schema).toMatch(/role\s+AdminRole\s+@default\(ADMIN\)/);
 expect(schema).toContain("sessionVersion");
 const migration = readFileSync("prisma/migrations/20260910000000_admin_roles/migration.sql", "utf8");
 expect(migration).toContain("DEFAULT 'ADMIN'");
 expect(migration).not.toMatch(/UPDATE|DELETE|DROP/);
});
it("wires role labels into the latest account dashboard", () => {
 const dashboard = readFileSync("components/AdminDashboard.tsx", "utf8");
 expect(dashboard).toContain('<AdminRoleLabel role={user.role} />');
});
