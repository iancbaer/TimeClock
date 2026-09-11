import type { PrismaClient } from "@prisma/client";

export async function promoteGlobalAdmin(db: PrismaClient, options: { email: string; expectedId: string; apply?: boolean }) {
  const result = await db.$transaction(async (tx) => {
    const target = await tx.adminUser.findUnique({
      where: { email: options.email }, select: { id: true, role: true, active: true },
    });
    if (!target?.active || target.id !== options.expectedId) throw new Error("Expected active administrator not found");
    if (!options.apply) return { status: "DRY_RUN", previousRole: target.role, role: "GLOBAL_ADMIN" };
    if (target.role === "GLOBAL_ADMIN") return { status: "ALREADY_GLOBAL_ADMIN", previousRole: target.role, role: target.role };
    const updated = await tx.adminUser.updateMany({
      where: { id: target.id, email: options.email, active: true, role: "ADMIN" }, data: { role: "GLOBAL_ADMIN" },
    });
    if (updated.count !== 1) throw new Error("Account changed during promotion");
    await tx.auditEvent.create({ data: {
      action: "ADMIN_ROLE_PROMOTED", actorType: "OPERATOR", entityType: "AdminUser", entityId: target.id,
      metadata: { previousRole: target.role, role: "GLOBAL_ADMIN", source: "promote-global-admin" },
    } });
    return { status: "PROMOTED", previousRole: target.role, role: "GLOBAL_ADMIN" };
  });
  if (options.apply) {
    const verified = await db.adminUser.findUnique({ where: { email: options.email }, select: { id: true, role: true, active: true } });
    if (verified?.id !== options.expectedId || !verified.active || verified.role !== "GLOBAL_ADMIN") {
      throw new Error("Promotion committed but readback verification failed; inspect before retrying");
    }
  }
  return result;
}
