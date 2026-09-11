import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/promote-global-admin.ts", ...args], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/never-connect" },
  });
}
it("prints safe help without connecting to a database", () => {
  const result = run(["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("--expected-id");
  expect(result.stdout).toContain("--confirm-email");
});
it.each([[], ["--email", "invalid", "--expected-id", "synthetic"],
  ["--email", "target@example.invalid", "--expected-id", "synthetic", "--apply"],
  ["--email", "target@example.invalid", "--expected-id", "synthetic", "--apply", "--confirm-email", "other@example.invalid"],
  ["--unknown"],
].map((args) => ({ args })))("rejects unsafe or incomplete arguments before database access", ({ args }) => {
  const result = run(args);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Invalid promotion arguments");
  expect(result.stderr).not.toContain("Prisma");
});
