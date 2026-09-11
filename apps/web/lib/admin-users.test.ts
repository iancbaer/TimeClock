import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: "synthetic-current", role: "ADMIN" }) }));
vi.mock("@/lib/db", () => ({ prisma: {
  adminUser: { findMany: mocks.findMany },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ adminUser: { create: mocks.create }, auditEvent: { create: mocks.audit } }),
} }));
import { GET, POST } from "../app/api/admin/users/route";

beforeEach(() => {
  mocks.findMany.mockImplementation(async ({ select }) => {
    const user = { id: "synthetic-current", name: "Synthetic Admin", role: "GLOBAL_ADMIN" };
    return [Object.fromEntries(Object.entries(user).filter(([key]) => select[key]))];
  });
  mocks.create.mockImplementation(async ({ data }) => ({ id: "synthetic-new", ...data }));
});
it("exposes authoritative roles for account labels without exposing credential fields", async () => {
  const body = await (await GET()).json();
  expect(body.users[0].role).toBe("GLOBAL_ADMIN");
  expect(mocks.findMany.mock.calls[0][0].select.passwordHash).toBeUndefined();
});
it("ordinary account creation explicitly remains Admin even with a submitted Global Admin role", async () => {
  const response = await POST(new Request("http://localhost/api/admin/users", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Synthetic Admin", email: "synthetic@example.invalid", role: "GLOBAL_ADMIN" }),
  }));
  expect(response.status).toBe(201);
  expect(mocks.create.mock.calls.at(-1)![0].data.role).toBe("ADMIN");
});
