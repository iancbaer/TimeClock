import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const state = vi.hoisted(() => ({ token: "", findUnique: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) }));
vi.mock("./db", () => ({ prisma: { adminUser: { findUnique: state.findUnique } } }));
import { requireAdmin } from "./auth";

const account = { id: "synthetic-admin", active: true, mustChangePassword: false, sessionVersion: 0, role: "ADMIN" };
beforeEach(async () => {
  process.env.AUTH_SECRET = "synthetic-test-secret-at-least-32-characters";
  state.token = await new SignJWT({ role: "GLOBAL_ADMIN" }).setProtectedHeader({ alg: "HS256" })
    .setSubject(account.id).setIssuer("timeclock").setAudience("timeclock-admin").setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  state.findUnique.mockReset().mockResolvedValue({ ...account });
});

describe("server-authoritative administrator roles", () => {
  it("preserves existing Admin access", async () => {
    await expect(requireAdmin()).resolves.toMatchObject({ role: "ADMIN" });
  });
  it("rejects an Admin from a new Global Admin-only area despite a forged role claim", async () => {
    await expect(requireAdmin({ allowedRoles: [] })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
  it("allows Global Admin into existing and future areas", async () => {
    state.findUnique.mockResolvedValue({ ...account, role: "GLOBAL_ADMIN" });
    await expect(requireAdmin()).resolves.toMatchObject({ role: "GLOBAL_ADMIN" });
    await expect(requireAdmin({ allowedRoles: [] })).resolves.toMatchObject({ role: "GLOBAL_ADMIN" });
  });
  it("does not bypass inactive or password-change requirements", async () => {
    state.findUnique.mockResolvedValue({ ...account, role: "GLOBAL_ADMIN", active: false });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    state.findUnique.mockResolvedValue({ ...account, role: "GLOBAL_ADMIN", mustChangePassword: true });
    await expect(requireAdmin()).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    await expect(requireAdmin({ allowPasswordChangeRequired: true })).resolves.toBeDefined();
  });
  it("rejects missing sessions", async () => {
    state.token = "";
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
});

it("Global Admin cannot bypass session revocation", async () => {
 state.findUnique.mockResolvedValue({ ...account, role: "GLOBAL_ADMIN", sessionVersion: 1 });
 await expect(requireAdmin({ allowedRoles: [] })).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
});
