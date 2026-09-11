import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const row = { id: "synthetic-target", email: "target@example.invalid", role: "ADMIN", active: true };
const tx = { adminUser: { findUnique: vi.fn(), updateMany: vi.fn() }, auditEvent: { create: vi.fn() }, $queryRaw: vi.fn() };
const db = { $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx), adminUser: tx.adminUser } as unknown as PrismaClient;
const options = { email: row.email, expectedId: row.id, apply: false };
const modules = import.meta.glob("./admin-promotion.ts") as Record<string, () => Promise<{ promoteGlobalAdmin: (db: PrismaClient, input: typeof options) => Promise<unknown> }>>;
async function promote(overrides = {}) {
  const fn = (await modules["./admin-promotion.ts"]?.())?.promoteGlobalAdmin;
  expect(fn, "explicit promotion tooling must exist").toBeDefined();
  return fn!(db, { ...options, ...overrides });
}
beforeEach(() => {
  vi.resetAllMocks();
  tx.adminUser.findUnique.mockResolvedValue({ ...row });
  tx.adminUser.updateMany.mockResolvedValue({ count: 1 });
});
it.each([null, { ...row, active: false }, { ...row, id: "another-account" }])("fails closed for missing, inactive or mismatched identity", async (target) => {
  tx.adminUser.findUnique.mockResolvedValue(target);
  await expect(promote({ apply: true })).rejects.toThrow("Expected active administrator not found");
  expect(tx.adminUser.updateMany).not.toHaveBeenCalled();
});
it("applies only the role to the exact target, audits atomically and reads back after commit", async () => {
  tx.adminUser.findUnique.mockResolvedValueOnce({ ...row }).mockResolvedValueOnce({ ...row, role: "GLOBAL_ADMIN" });
  await expect(promote({ apply: true })).resolves.toMatchObject({ status: "PROMOTED", role: "GLOBAL_ADMIN" });
  expect(tx.adminUser.updateMany).toHaveBeenCalledExactlyOnceWith({
    where: { id: row.id, email: row.email, active: true, role: "ADMIN" }, data: { role: "GLOBAL_ADMIN" },
  });
  expect(tx.auditEvent.create).toHaveBeenCalledExactlyOnceWith({ data: {
    action: "ADMIN_ROLE_PROMOTED", actorType: "OPERATOR", entityType: "AdminUser", entityId: row.id,
    metadata: { previousRole: "ADMIN", role: "GLOBAL_ADMIN", source: "promote-global-admin" },
  } });
  expect(tx.adminUser.findUnique).toHaveBeenCalledTimes(2);
});
it("is idempotent for an already promoted account without writing another audit", async () => {
  tx.adminUser.findUnique.mockResolvedValue({ ...row, role: "GLOBAL_ADMIN" });
  await expect(promote({ apply: true })).resolves.toMatchObject({ status: "ALREADY_GLOBAL_ADMIN" });
  expect(tx.adminUser.updateMany).not.toHaveBeenCalled();
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
});
it("fails on a concurrent account change before auditing", async () => {
  tx.adminUser.updateMany.mockResolvedValue({ count: 0 });
  await expect(promote({ apply: true })).rejects.toThrow("Account changed during promotion");
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
});
it("reports failed post-commit readback rather than claiming success", async () => {
  await expect(promote({ apply: true })).rejects.toThrow("readback verification failed");
});
it("defaults to a read-only preview of one explicitly identified existing account", async () => {
  await expect(promote()).resolves.toEqual({ status: "DRY_RUN", previousRole: "ADMIN", role: "GLOBAL_ADMIN" });
  expect(tx.adminUser.updateMany).not.toHaveBeenCalled();
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
});
