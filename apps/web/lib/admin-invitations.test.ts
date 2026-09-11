import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn().mockResolvedValue({ id: "synthetic", email: "synthetic@example.invalid", active: true, mustChangePassword: true }) }));
vi.mock("@/lib/auth", () => ({ requireAdmin: async () => ({ id: "synthetic-actor", role: "ADMIN" }) }));
vi.mock("@/lib/db", () => ({ prisma: { adminUser: { upsert: mocks.upsert } } }));
vi.mock("@/lib/account-email", () => ({ emailConfiguration: () => ({}) }));
vi.mock("@/lib/account-links", () => ({ takeEmailLimit: async () => true, issueAccountLink: async () => {} }));
import { POST } from "../app/api/admin/invitations/route";
it("invitations explicitly create Admin and never overwrite existing roles", async () => {
 const response = await POST(new Request("http://localhost/api/admin/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Synthetic Admin", email: "synthetic@example.invalid", role: "GLOBAL_ADMIN" }) }));
 expect(response.status).toBe(201);
 expect(mocks.upsert.mock.calls[0][0].create.role).toBe("ADMIN");
 expect(mocks.upsert.mock.calls[0][0].update).toEqual({});
});
