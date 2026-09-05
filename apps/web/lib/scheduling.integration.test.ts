import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { prisma } from "./db";
import { createShift, decideTimeOff, readSchedule, requestTimeOff, updateShift } from "./scheduling";

// Opt-in verification against existing TimeClock identities. All scheduling
// writes and audit events run inside ONE transaction that always rolls back.
// No employees, credentials, punches, or separate employee database are created.
describe.skipIf(process.env.TIMECLOCK_SCHEDULING_DB_TEST !== "1")("scheduling with existing employee records", () => {
  it("enforces the draft/publish/edit, review, privacy and conflict workflows", async () => {
    const rollback = new Error("INTENTIONAL_SCHEDULING_TEST_ROLLBACK");
    const ids: string[] = [];
    const transaction = prisma.$transaction.bind(prisma);
    await expect(transaction(async (tx) => {
      const employee = await tx.employee.findFirstOrThrow({ where: { active: true }, select: { id: true } });
      const admin = await tx.adminUser.findFirstOrThrow({ where: { active: true }, select: { id: true } });
      const settings = await tx.companySettings.findUniqueOrThrow({ where: { id: "default" } });
      const day = DateTime.now().setZone(settings.timeZone).plus({ years: 10 }).startOf("week").toISODate()!;
      const nextDay = DateTime.fromISO(day).plus({ days: 1 }).toISODate()!;
      const input = { employeeId: employee.id, startsAt: `${day}T09:00`, endsAt: `${day}T17:00` };
      // Delegate to real SQL in the outer rollback transaction, including reads.
      vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: unknown) => {
        if (typeof fn !== "function") throw new Error("Expected interactive transaction.");
        return fn(tx);
      }) as typeof prisma.$transaction);
      vi.spyOn(prisma.companySettings, "findUnique").mockImplementation(tx.companySettings.findUnique.bind(tx.companySettings));
      vi.spyOn(prisma.employee, "findMany").mockImplementation(tx.employee.findMany.bind(tx.employee));
      vi.spyOn(prisma.shift, "findMany").mockImplementation(tx.shift.findMany.bind(tx.shift));
      vi.spyOn(prisma.timeOffRequest, "findMany").mockImplementation(tx.timeOffRequest.findMany.bind(tx.timeOffRequest));
      try {
        const draft = await createShift(admin.id, input); ids.push(draft.id);
        expect(draft.status).toBe("DRAFT");
        const query = new Request(`http://localhost/api/kiosk/schedule?start=${day}&employeeId=ignored`);
        expect((await readSchedule(query, employee.id)).shifts.some((item) => item.id === draft.id)).toBe(false);
        expect((await readSchedule(query)).shifts.some((item) => item.id === draft.id)).toBe(true);
        await expect(createShift(admin.id, input)).rejects.toMatchObject({ status: 409, code: "SHIFT_CONFLICT" });
        await expect(createShift(admin.id, { ...input, employeeId: "nonexistent-identity" })).rejects.toMatchObject({ status: 400 });
        const published = await updateShift(admin.id, draft.id, { action: "PUBLISH", version: draft.version });
        expect(published.status).toBe("PUBLISHED");
        expect((await readSchedule(query, employee.id)).shifts.map((item) => item.id)).toContain(draft.id);
        await expect(updateShift(admin.id, draft.id, { action: "CANCEL", version: draft.version })).rejects.toMatchObject({ status: 409 });
        const edited = await updateShift(admin.id, draft.id, { ...input, endsAt: `${day}T16:00`, action: "SAVE", version: published.version });
        expect(edited.status).toBe("PUBLISHED");
        const request = await requestTimeOff(employee.id, { startDate: day, endDate: day }); ids.push(request.id);
        expect(request.note).toBe("");
        await expect(requestTimeOff(employee.id, { startDate: day, endDate: nextDay })).rejects.toMatchObject({ status: 409 });
        await expect(decideTimeOff(admin.id, request.id, { decision: "APPROVED" })).rejects.toMatchObject({ status: 409, code: "SHIFT_CONFLICT" });
        const cancelled = await updateShift(admin.id, draft.id, { action: "CANCEL", version: edited.version });
        expect(cancelled.status).toBe("CANCELLED");
        expect((await decideTimeOff(admin.id, request.id, { decision: "APPROVED" })).status).toBe("APPROVED");
        expect((await readSchedule(query, employee.id)).timeOff.map((item) => item.id)).toContain(request.id);
        await expect(createShift(admin.id, input)).rejects.toMatchObject({ status: 409, code: "TIME_OFF_CONFLICT" });
        await expect(createShift(admin.id, { ...input, startsAt: `${DateTime.fromISO(day).minus({ days: 1 }).toISODate()}T22:00`, endsAt: `${day}T02:00` })).rejects.toMatchObject({ status: 409 });
        await expect(decideTimeOff(admin.id, request.id, { decision: "DENIED" })).rejects.toMatchObject({ status: 409 });
        const adjacent = await createShift(admin.id, { ...input, startsAt: `${nextDay}T00:00`, endsAt: `${nextDay}T08:00` }); ids.push(adjacent.id);
        await expect(updateShift(admin.id, adjacent.id, { ...input, action: "SAVE", version: adjacent.version })).rejects.toMatchObject({ status: 409, code: "TIME_OFF_CONFLICT" });
        const denied = await requestTimeOff(employee.id, { startDate: nextDay, endDate: nextDay, note: "Temporary transaction verification" }); ids.push(denied.id);
        expect((await decideTimeOff(admin.id, denied.id, { decision: "DENIED" })).status).toBe("DENIED");
        const view = await readSchedule(query, employee.id);
        expect(view.requests.every((item) => item.employeeId === employee.id)).toBe(true);
        expect(view.employees.map((item) => item.id)).toEqual([employee.id]);
        expect(view.shifts.every((item) => item.status === "PUBLISHED" && item.employeeId === employee.id)).toBe(true);
        expect(await tx.auditEvent.count({ where: { entityId: { in: ids } } })).toBeGreaterThanOrEqual(9);
      } finally { vi.restoreAllMocks(); }
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
    expect(await prisma.shift.count({ where: { id: { in: ids } } })).toBe(0);
    expect(await prisma.timeOffRequest.count({ where: { id: { in: ids } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityId: { in: ids } } })).toBe(0);
  }, 40000);
});
