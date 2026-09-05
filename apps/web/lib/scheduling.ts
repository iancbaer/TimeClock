import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { HttpError } from "./http";
import { calendarDate, decisionInput, overlaps, shiftAction, shiftBounds, shiftInput, timeOffBounds, timeOffInput } from "./scheduling-rules";

const identity = { id: true, firstName: true, lastName: true, active: true } as const;

// All scheduling writes share a transaction lock. READ COMMITTED ensures that
// checks after waiting see the previous writer's committed shift/leave changes.
function write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext('timeclock-scheduling'))) SELECT 1::int FROM acquired`;
    return fn(tx);
  }, { isolationLevel: "ReadCommitted" });
}

async function audit(tx: Prisma.TransactionClient, action: string, actorId: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}, actorType = "ADMIN") {
  await tx.auditEvent.create({ data: { action, actorId, actorType, entityType, entityId, metadata } });
}

async function checkShift(tx: Prisma.TransactionClient, employeeId: string, bounds: { startsAt: Date; endsAt: Date }, zone: string, excludeId?: string) {
  const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { active: true } });
  if (!employee?.active) throw new HttpError(400, "Choose an active employee from TimeClock.");
  const clash = await tx.shift.findFirst({ where: { employeeId, id: { not: excludeId }, status: { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } } });
  if (clash) throw new HttpError(409, "This employee already has a conflicting shift. Edit or cancel it first.", "SHIFT_CONFLICT");
  const leave = await tx.timeOffRequest.findMany({ where: { employeeId, status: "APPROVED" } });
  if (leave.some((item) => overlaps(bounds, timeOffBounds(item.startDate.toISOString().slice(0, 10), item.endDate.toISOString().slice(0, 10), zone)))) {
    throw new HttpError(409, "This shift conflicts with approved time off. Choose another employee or time.", "TIME_OFF_CONFLICT");
  }
}

export async function readSchedule(request: Request, employeeId?: string) {
  const settings = await getSettings();
  const query = new URL(request.url).searchParams;
  const start = calendarDate.parse(query.get("start") ?? DateTime.now().setZone(settings.timeZone).startOf("week").toISODate());
  const end = DateTime.fromISO(start).plus({ days: 6 }).toISODate()!;
  const bounds = timeOffBounds(start, end, settings.timeZone);
  const [employees, shifts, timeOff, requests] = await Promise.all([
    prisma.employee.findMany({ where: employeeId ? { id: employeeId } : {}, select: identity, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.shift.findMany({ where: { employeeId, status: employeeId ? "PUBLISHED" : { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } }, include: { employee: { select: identity } }, orderBy: { startsAt: "asc" } }),
    prisma.timeOffRequest.findMany({ where: { employeeId, status: "APPROVED", startDate: { lte: new Date(end) }, endDate: { gte: new Date(start) } }, include: { employee: { select: identity } }, orderBy: { startDate: "asc" } }),
    prisma.timeOffRequest.findMany({ where: employeeId ? { employeeId } : { status: "PENDING" }, include: { employee: { select: identity } }, orderBy: { submittedAt: "desc" } }),
  ]);
  return { start, end, timeZone: settings.timeZone, employees, shifts, timeOff, requests };
}

export async function createShift(adminId: string, body: unknown) {
  const input = shiftInput.parse(body);
  return write(async (tx) => {
    const settings = await getSettings(tx);
    const bounds = shiftBounds(input.startsAt, input.endsAt, settings.timeZone);
    await checkShift(tx, input.employeeId, bounds, settings.timeZone);
    const shift = await tx.shift.create({ data: { ...input, ...bounds } });
    await audit(tx, "SHIFT_CREATED", adminId, "Shift", shift.id, { employeeId: shift.employeeId, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() });
    return shift;
  });
}

export async function updateShift(adminId: string, id: string, body: unknown) {
  const input = shiftAction.parse(body);
  return write(async (tx) => {
    const current = await tx.shift.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Shift not found.");
    if (current.version !== input.version || current.status === "CANCELLED") throw new HttpError(409, "This shift has changed. Refresh the schedule before trying again.");
    const settings = await getSettings(tx);
    const bounds = input.action === "SAVE" ? shiftBounds(input.startsAt, input.endsAt, settings.timeZone) : current;
    const employeeId = input.action === "SAVE" ? input.employeeId : current.employeeId;
    if (input.action !== "CANCEL") await checkShift(tx, employeeId, bounds, settings.timeZone, id);
    const shift = await tx.shift.update({ where: { id }, data: {
      employeeId, startsAt: bounds.startsAt, endsAt: bounds.endsAt,
      ...(input.action === "SAVE" ? { note: input.note } : {}),
      status: input.action === "CANCEL" ? "CANCELLED" : input.action === "PUBLISH" ? "PUBLISHED" : current.status,
      publishedAt: input.action === "PUBLISH" ? new Date() : current.publishedAt,
      version: { increment: 1 },
    } });
    await audit(tx, `SHIFT_${input.action}`, adminId, "Shift", id, { previousVersion: current.version, employeeId, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), status: shift.status });
    return shift;
  });
}

export async function requestTimeOff(employeeId: string, body: unknown) {
  const input = timeOffInput.parse(body);
  return write(async (tx) => {
    const settings = await getSettings(tx);
    if (input.startDate < DateTime.now().setZone(settings.timeZone).toISODate()!) throw new HttpError(400, "Time off must start today or later.");
    const startDate = new Date(input.startDate), endDate = new Date(input.endDate);
    const existing = await tx.timeOffRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: endDate }, endDate: { gte: startDate } } });
    if (existing) throw new HttpError(409, "You already have a pending or approved request for these dates.");
    const item = await tx.timeOffRequest.create({ data: { employeeId, startDate, endDate, note: input.note } });
    await audit(tx, "TIME_OFF_REQUESTED", employeeId, "TimeOffRequest", item.id, { startDate: input.startDate, endDate: input.endDate }, "EMPLOYEE");
    return item;
  });
}

export async function decideTimeOff(adminId: string, id: string, body: unknown) {
  const { decision } = decisionInput.parse(body);
  return write(async (tx) => {
    const item = await tx.timeOffRequest.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Time-off request not found.");
    if (item.status !== "PENDING") throw new HttpError(409, "This request has already been reviewed. Refresh the schedule.");
    if (decision === "APPROVED") {
      const settings = await getSettings(tx);
      const bounds = timeOffBounds(item.startDate.toISOString().slice(0, 10), item.endDate.toISOString().slice(0, 10), settings.timeZone);
      const conflict = await tx.shift.findFirst({ where: { employeeId: item.employeeId, status: { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } } });
      if (conflict) throw new HttpError(409, `Edit or cancel the conflicting shift (${DateTime.fromJSDate(conflict.startsAt).setZone(settings.timeZone).toFormat("MMM d, yyyy h:mm a")}) before approving this request.`, "SHIFT_CONFLICT");
    }
    const resolved = await tx.timeOffRequest.update({ where: { id }, data: { status: decision, resolvedAt: new Date(), resolvedById: adminId } });
    await audit(tx, `TIME_OFF_${decision}`, adminId, "TimeOffRequest", id);
    return resolved;
  });
}
