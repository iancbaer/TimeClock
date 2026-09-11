import { DateTime } from "luxon";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { HttpError } from "./http";
import { attendanceInput, attendanceVoidInput, calendarDate, decisionInput, expandRecurringShift, overlaps, recurringShiftInput, shiftAction, shiftBounds, timeOffBounds, timeOffInput } from "./scheduling-rules";

const identity = { id: true, firstName: true, lastName: true, active: true } as const;

// All scheduling writes share a transaction lock. READ COMMITTED ensures that
// checks after waiting see the previous writer's committed shift/leave changes.
function write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`WITH acquired AS (SELECT pg_advisory_xact_lock(hashtext('timeclock-scheduling'))) SELECT 1::int FROM acquired`;
    return fn(tx);
  }, { isolationLevel: "ReadCommitted", timeout: 30000, maxWait: 10000 });
}

async function audit(tx: Prisma.TransactionClient, action: string, actorId: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}, actorType = "ADMIN") {
  await tx.auditEvent.create({ data: { action, actorId, actorType, entityType, entityId, metadata } });
}

async function checkShift(tx: Prisma.TransactionClient, employeeId: string, bounds: { startsAt: Date; endsAt: Date }, zone: string, excludeIds: string[] = []) {
  const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { active: true } });
  if (!employee?.active) throw new HttpError(400, "Choose an active employee from TimeClock.");
  const clash = await tx.shift.findFirst({ where: { employeeId, id: { notIn: excludeIds }, status: { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } } });
  if (clash) throw new HttpError(409, "This employee already has a conflicting shift. Edit or cancel it first.", "SHIFT_CONFLICT");
  const leave = await tx.timeOffRequest.findMany({ where: { employeeId, status: "APPROVED" } });
  if (leave.some((item) => overlaps(bounds, timeOffBounds(item.startDate.toISOString().slice(0, 10), item.endDate.toISOString().slice(0, 10), zone)))) {
    throw new HttpError(409, "This shift conflicts with approved time off. Choose another employee or time.", "TIME_OFF_CONFLICT");
  }
}

async function checkRuleConflicts(tx:Prisma.TransactionClient, input:ReturnType<typeof recurringShiftInput.parse>, zone:string, fromDate:string, excludeSeriesId?:string) {
  if(!input.recurrence) return;
  const futureShifts=await tx.shift.findMany({where:{employeeId:input.employeeId,status:{not:"CANCELLED"},endsAt:{gt:new Date(fromDate)},...(excludeSeriesId?{OR:[{seriesId:null},{seriesId:{not:excludeSeriesId}}]}:{})}});
  for(const shift of futureShifts) {
    const day=DateTime.fromJSDate(shift.startsAt).setZone(zone).minus({days:1}).toISODate()!;
    const to=DateTime.fromJSDate(shift.endsAt).setZone(zone).toISODate()!;
    if(expandRecurringShift(input,zone,{from:day>fromDate?day:fromDate,to}).some(o=>overlaps(o,shift))) throw new HttpError(409,"This repeating schedule conflicts with an existing future shift.","SHIFT_CONFLICT");
  }
  const rules=await tx.shiftSeries.findMany({where:{template:{not:Prisma.DbNull},id:excludeSeriesId?{not:excludeSeriesId}:undefined}});
  for(const rule of rules) {
    const template=rule.template as {employeeId:string;startsAt:string;endsAt:string;note:string;publish:boolean;fromDate:string};
    if(template.employeeId!==input.employeeId) continue;
    const other=recurringShiftInput.parse({...template,recurrence:{intervalWeeks:rule.intervalWeeks,weekdays:rule.weekdays,untilDate:null}});
    const first=DateTime.fromISO(fromDate>template.fromDate?fromDate:template.fromDate,{zone:"UTC"});
    const last=rule.untilDate?DateTime.fromJSDate(rule.untilDate,{zone:"UTC"}):first.plus({weeks:input.recurrence.intervalWeeks*rule.intervalWeeks+1});
    // The weekday pattern repeats within the product of both weekly intervals.
    for(let day=first;day<=last && day<=first.plus({weeks:input.recurrence.intervalWeeks*rule.intervalWeeks+1});day=day.plus({days:7})) {
      const to=DateTime.min(day.plus({days:7}),last).toISODate()!;
      const a=expandRecurringShift(input,zone,{from:day.toISODate()!,to});
      const b=expandRecurringShift(other,rule.timeZone,{from:day.minus({days:1}).toISODate()!<template.fromDate?template.fromDate:day.minus({days:1}).toISODate()!,to});
      if(a.some(x=>b.some(y=>overlaps(x,y)))) throw new HttpError(409,"This schedule conflicts with another continuing schedule for this employee.","SHIFT_CONFLICT");
    }
  }
}
// Persist occurrences only for the requested calendar window. The durable rule has no end date.
async function materializeSeries(tx: Prisma.TransactionClient, from: string, to: string, excludeSeriesId?: string) {
  if(DateTime.fromISO(to).diff(DateTime.fromISO(from),"days").days>84) {
    for(let day=DateTime.fromISO(from);day.toISODate()!<=to;day=day.plus({days:84})) await materializeSeries(tx,day.toISODate()!,day.plus({days:83}).toISODate()!<to?day.plus({days:83}).toISODate()!:to,excludeSeriesId);
    return;
  }
  const series=await tx.shiftSeries.findMany({where:{template:{not:Prisma.DbNull},id:excludeSeriesId?{not:excludeSeriesId}:undefined},orderBy:{createdAt:"asc"}});
  for(const item of series) {
    const template=item.template as {employeeId:string;startsAt:string;endsAt:string;note:string;publish:boolean;fromDate:string};
    const employee=await tx.employee.findUnique({where:{id:template.employeeId}});
    if(!employee?.active) continue;
    const start=from>template.fromDate?from:template.fromDate;
    const end=item.untilDate && item.untilDate.toISOString().slice(0,10)<to?item.untilDate.toISOString().slice(0,10):to;
    if(end<start) continue;
    const input=recurringShiftInput.parse({...template,recurrence:{intervalWeeks:item.intervalWeeks,weekdays:item.weekdays,untilDate:null}});
    const occurrences=expandRecurringShift(input,item.timeZone,{from:start,to:end});
    for(const bounds of occurrences) {
      const occurrenceDate=new Date(DateTime.fromJSDate(bounds.startsAt).setZone(item.timeZone).toISODate()!);
      if(await tx.shift.findUnique({where:{seriesId_occurrenceDate:{seriesId:item.id,occurrenceDate}}})) continue;
      let status: "DRAFT"|"PUBLISHED"|"CANCELLED"=template.publish?"PUBLISHED":"DRAFT";
      try {await checkShift(tx,template.employeeId,bounds,item.timeZone);}
      catch(error) {
        if(error instanceof HttpError && error.code==="TIME_OFF_CONFLICT") status="CANCELLED";
        else throw error;
      }
      const shift=await tx.shift.create({data:{...bounds,employeeId:template.employeeId,note:template.note,seriesId:item.id,occurrenceDate,status,publishedAt:status==="PUBLISHED"?new Date():null}});
      if(status==="CANCELLED") await audit(tx,"RECURRING_SHIFT_SKIPPED_FOR_TIME_OFF",item.id,"Shift",shift.id,{},"SYSTEM");
    }
  }
}
export async function readSchedule(request: Request, employeeId?: string) {
  const settings = await getSettings();
  const query = new URL(request.url).searchParams;
  const start = calendarDate.parse(query.get("start") ?? DateTime.now().setZone(settings.timeZone).startOf("week").toISODate());
  const end = DateTime.fromISO(start).plus({ days: 6 }).toISODate()!;
  const bounds = timeOffBounds(start, end, settings.timeZone);
  await write(tx => materializeSeries(tx, DateTime.fromISO(start).minus({days:1}).toISODate()!, DateTime.fromISO(end).plus({weeks:12}).toISODate()!));
  const [employees, shifts, timeOff, requests] = await Promise.all([
    prisma.employee.findMany({ where: employeeId ? { id: employeeId } : {}, select: identity, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.shift.findMany({ where: { employeeId, status: employeeId ? "PUBLISHED" : { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } }, include: { employee: { select: identity }, series: true }, orderBy: { startsAt: "asc" } }),
    prisma.timeOffRequest.findMany({ where: { employeeId, status: "APPROVED", startDate: { lte: new Date(end) }, endDate: { gte: new Date(start) } }, include: { employee: { select: identity } }, orderBy: { startDate: "asc" } }),
    prisma.timeOffRequest.findMany({ where: employeeId ? { employeeId } : { status: "PENDING" }, include: { employee: { select: identity } }, orderBy: { submittedAt: "desc" } }),
  ]);
  const attendance = employeeId ? [] : await prisma.attendanceRecord.findMany({where:{voided:false,date:{gte:new Date(start),lte:new Date(end)}},include:{employee:{select:identity}},orderBy:{date:"asc"}});
  // Older tablet builds assume a dated series. Keep their shift display compatible.
  const visibleShifts=shifts.map(shift=>({...shift,series:shift.series && !(employeeId && !shift.series.untilDate)?{version:shift.series.version,intervalWeeks:shift.series.intervalWeeks,untilDate:shift.series.untilDate}:null}));
  return { start, end, timeZone: settings.timeZone, employees, shifts:visibleShifts, timeOff, requests, attendance };
}

export async function createShift(adminId: string, body: unknown) {
  const input = recurringShiftInput.parse(body);
  return write(async (tx) => {
    const settings = await getSettings(tx);
    const occurrences = expandRecurringShift(input, settings.timeZone);
    await materializeSeries(tx,DateTime.fromISO(input.startsAt.slice(0,10)).minus({days:1}).toISODate()!,DateTime.fromJSDate(occurrences.at(-1)!.endsAt).setZone(settings.timeZone).toISODate()!);
    for(const bounds of occurrences) await checkShift(tx,input.employeeId,bounds,settings.timeZone);
    if(input.recurrence?.untilDate===null) {
      await checkRuleConflicts(tx,input,settings.timeZone,input.startsAt.slice(0,10));
      const future=await tx.shift.findMany({where:{employeeId:input.employeeId,status:{not:"CANCELLED"},endsAt:{gt:occurrences.at(-1)!.endsAt}}});
      for(const shift of future) {
        const from=DateTime.fromJSDate(shift.startsAt).setZone(settings.timeZone).minus({days:1}).toISODate()!;
        const to=DateTime.fromJSDate(shift.endsAt).setZone(settings.timeZone).toISODate()!;
        if(expandRecurringShift(input,settings.timeZone,{from,to}).some(o=>overlaps(o,shift))) throw new HttpError(409,"This repeating schedule conflicts with an existing future shift.","SHIFT_CONFLICT");
      }
    }
    const series = input.recurrence ? await tx.shiftSeries.create({data:{...input.recurrence,weekdays:[...new Set(input.recurrence.weekdays)],untilDate:input.recurrence.untilDate?new Date(input.recurrence.untilDate):null,timeZone:settings.timeZone,...(input.recurrence.untilDate===null?{template:{employeeId:input.employeeId,startsAt:input.startsAt,endsAt:input.endsAt,note:input.note,publish:input.publish,fromDate:input.startsAt.slice(0,10)}}:{})}}) : null;
    const shifts=[];
    for(const bounds of occurrences) shifts.push(await tx.shift.create({data:{employeeId:input.employeeId,note:input.note,...bounds,seriesId:series?.id,occurrenceDate:series?new Date(DateTime.fromJSDate(bounds.startsAt).setZone(settings.timeZone).toISODate()!):null,status:input.publish?"PUBLISHED":"DRAFT",publishedAt:input.publish?new Date():null}}));
    await audit(tx,"SHIFT_CREATED",adminId,series?"ShiftSeries":"Shift",series?.id??shifts[0].id,{employeeId:input.employeeId,count:shifts.length,published:input.publish,shiftIds:shifts.map(s=>s.id)});
    return {...shifts[0],createdCount:shifts.length};
  });
}

export async function updateShift(adminId: string, id: string, body: unknown) {
  const input = shiftAction.parse(body);
  return write(async (tx) => {
    const current = await tx.shift.findUnique({ where: { id }, include:{series:true} });
    if (!current) throw new HttpError(404, "Shift not found.");
    if (current.version !== input.version || current.status === "CANCELLED") throw new HttpError(409, "This shift has changed. Refresh the schedule before trying again.");
    if(input.scope === "FOLLOWING" && (!current.series || current.series.version !== input.seriesVersion)) throw new HttpError(409,"This series has changed. Refresh the schedule before trying again.");
    const settings = await getSettings(tx);
    const zone=current.series?.timeZone ?? settings.timeZone;
    const targets=input.scope === "FOLLOWING" ? await tx.shift.findMany({where:{seriesId:current.seriesId,startsAt:{gte:current.startsAt},status:{not:"CANCELLED"}},orderBy:{startsAt:"asc"}}) : [current];
    const originalDay=DateTime.fromJSDate(current.startsAt).setZone(zone).toISODate()!;
    const dateOffset=input.action === "SAVE" ? DateTime.fromISO(input.startsAt.slice(0,10),{zone:"UTC"}).diff(DateTime.fromISO(originalDay,{zone:"UTC"}),"days").days : 0;
    const durationDays=input.action === "SAVE" ? DateTime.fromISO(input.endsAt.slice(0,10),{zone:"UTC"}).diff(DateTime.fromISO(input.startsAt.slice(0,10),{zone:"UTC"}),"days").days : 0;
    if(input.scope === "FOLLOWING" && input.action === "SAVE" && dateOffset !== 0) throw new HttpError(400,"Keep the selected occurrence date when editing this and following shifts. To move one date, select This shift only.");
    const proposed=targets.map(target=>{
      if(input.action !== "SAVE") return {...target};
      const day=DateTime.fromISO(DateTime.fromJSDate(target.startsAt).setZone(zone).toISODate()!,{zone:"UTC"}).plus({days:dateOffset});
      const bounds=shiftBounds(`${day.toISODate()}T${input.startsAt.slice(11)}`,`${day.plus({days:durationDays}).toISODate()}T${input.endsAt.slice(11)}`,zone);
      return {...target,...bounds,employeeId:input.employeeId,note:input.note};
    });
    if(input.action !== "CANCEL") {
      for(const target of proposed) await materializeSeries(tx,DateTime.fromJSDate(target.startsAt).setZone(zone).minus({days:1}).toISODate()!,DateTime.fromJSDate(target.endsAt).setZone(zone).toISODate()!,current.seriesId??undefined);
      for(const target of proposed) await checkShift(tx,target.employeeId,target,zone,targets.map(s=>s.id));
      for(let i=0;i<proposed.length;i++) for(let j=i+1;j<proposed.length;j++) if(proposed[i].employeeId===proposed[j].employeeId && overlaps(proposed[i],proposed[j])) throw new HttpError(409,"The updated shifts would overlap each other.");
    }
    for(const target of proposed) await tx.shift.update({where:{id:target.id},data:{employeeId:target.employeeId,startsAt:target.startsAt,endsAt:target.endsAt,note:target.note,status:input.action === "CANCEL"?"CANCELLED":input.action === "PUBLISH"?"PUBLISHED":target.status,publishedAt:input.action === "PUBLISH"?new Date():target.publishedAt,version:{increment:1}}});
    if(current.series?.template && input.scope === "FOLLOWING") {
      const template=current.series.template as {employeeId:string;startsAt:string;endsAt:string;note:string;publish:boolean;fromDate:string};
      const cutoff=current.occurrenceDate?.toISOString().slice(0,10) ?? originalDay;
      await tx.shiftSeries.update({where:{id:current.series.id},data:{untilDate:new Date(DateTime.fromISO(cutoff).minus({days:1}).toISODate()!)}});
      if(input.action !== "CANCEL") {
        const nextTemplate={...template,fromDate:cutoff,...(input.action==="PUBLISH"?{publish:true}:{})};
        if(input.action==="SAVE") {
          nextTemplate.employeeId=input.employeeId;nextTemplate.note=input.note;
          nextTemplate.startsAt=template.startsAt.slice(0,11)+input.startsAt.slice(11);
          nextTemplate.endsAt=DateTime.fromISO(template.startsAt.slice(0,10)).plus({days:durationDays}).toISODate()+"T"+input.endsAt.slice(11);
        }
        await checkRuleConflicts(tx,recurringShiftInput.parse({...nextTemplate,recurrence:{intervalWeeks:current.series.intervalWeeks,weekdays:current.series.weekdays,untilDate:null}}),zone,cutoff,current.series.id);
        const next=await tx.shiftSeries.create({data:{intervalWeeks:current.series.intervalWeeks,weekdays:current.series.weekdays,timeZone:zone,untilDate:current.series.untilDate,template:nextTemplate}});
        await tx.shift.updateMany({where:{id:{in:targets.map(t=>t.id)}},data:{seriesId:next.id}});
        // Move cancelled exceptions too, so refreshing never recreates them.
        await tx.shift.updateMany({where:{seriesId:current.series.id,occurrenceDate:{gte:new Date(cutoff)}},data:{seriesId:next.id}});
      }
    }
    if(current.seriesId) await tx.shiftSeries.update({where:{id:current.seriesId},data:{version:{increment:1}}});
    await audit(tx,`SHIFT_${input.action}`,adminId,"Shift",id,{scope:input.scope,count:targets.length,shiftIds:targets.map(s=>s.id),previousVersion:current.version});
    return {...await tx.shift.findUniqueOrThrow({where:{id}}),updatedCount:targets.length};
  });
}
export async function requestTimeOff(employeeId: string, body: unknown, adminId?: string) {
  const input = timeOffInput.parse(body);
  return write(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee?.active) throw new HttpError(400, "Choose an active employee record for this request.");
    const settings = await getSettings(tx);
    if (input.startDate < DateTime.now().setZone(settings.timeZone).toISODate()!) throw new HttpError(400, "Time off must start today or later.");
    const startDate = new Date(input.startDate), endDate = new Date(input.endDate);
    const existing = await tx.timeOffRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: endDate }, endDate: { gte: startDate } } });
    if (existing) throw new HttpError(409, "You already have a pending or approved request for these dates.");
    const item = await tx.timeOffRequest.create({ data: { employeeId, startDate, endDate, note: input.note } });
    await audit(tx, "TIME_OFF_REQUESTED", adminId ?? employeeId, "TimeOffRequest", item.id, { employeeId, startDate: input.startDate, endDate: input.endDate }, adminId ? "ADMIN" : "EMPLOYEE");
    return item;
  });
}

export async function decideTimeOff(adminId: string, id: string, body: unknown) {
  const { decision, cancelConflictingShifts } = decisionInput.parse(body);
  return write(async (tx) => {
    const item = await tx.timeOffRequest.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Time-off request not found.");
    if (item.status !== "PENDING") throw new HttpError(409, "This request has already been reviewed. Refresh the schedule.");
    if (decision === "APPROVED") {
      await materializeSeries(tx,DateTime.fromJSDate(item.startDate,{zone:"UTC"}).minus({days:1}).toISODate()!,item.endDate.toISOString().slice(0,10));
      const settings = await getSettings(tx);
      const bounds = timeOffBounds(item.startDate.toISOString().slice(0, 10), item.endDate.toISOString().slice(0, 10), settings.timeZone);
      const conflict = await tx.shift.findFirst({ where: { employeeId: item.employeeId, status: { not: "CANCELLED" }, startsAt: { lt: bounds.endsAt }, endsAt: { gt: bounds.startsAt } } });
      if (conflict && !cancelConflictingShifts) throw new HttpError(409, `Edit or cancel the conflicting shift (${DateTime.fromJSDate(conflict.startsAt).setZone(settings.timeZone).toFormat("MMM d, yyyy h:mm a")}) before approving this request.`, "SHIFT_CONFLICT");
    }
    if(decision === "APPROVED" && cancelConflictingShifts) {
      const settings=await getSettings(tx);
      const bounds=timeOffBounds(item.startDate.toISOString().slice(0,10),item.endDate.toISOString().slice(0,10),settings.timeZone);
      const conflicts=await tx.shift.findMany({where:{employeeId:item.employeeId,status:{not:"CANCELLED"},startsAt:{lt:bounds.endsAt},endsAt:{gt:bounds.startsAt}}});
      await tx.shift.updateMany({where:{id:{in:conflicts.map(s=>s.id)}},data:{status:"CANCELLED",version:{increment:1}}});
      await tx.shiftSeries.updateMany({where:{id:{in:conflicts.flatMap(s=>s.seriesId?[s.seriesId]:[])}},data:{version:{increment:1}}});
      if(conflicts.length) await audit(tx,"TIME_OFF_SHIFTS_CANCELLED",adminId,"TimeOffRequest",id,{shiftIds:conflicts.map(s=>s.id)});
    }
    const resolved = await tx.timeOffRequest.update({ where: { id }, data: { status: decision, resolvedAt: new Date(), resolvedById: adminId } });
    await audit(tx, `TIME_OFF_${decision}`, adminId, "TimeOffRequest", id);
    return resolved;
  });
}


export async function recordAttendance(adminId:string,body:unknown) {
  const input=attendanceInput.parse(body);
  return write(async tx=>{
    const settings=await getSettings(tx);
    if(input.date>DateTime.now().setZone(settings.timeZone).toISODate()!) throw new HttpError(400,"Record attendance for today or a past day. Use time-off requests for future absences.");
    const employee=await tx.employee.findUnique({where:{id:input.employeeId}});
    if(!employee) throw new HttpError(400,"Choose an existing employee.");
    const date=new Date(input.date);
    if(await tx.attendanceRecord.findFirst({where:{employeeId:input.employeeId,date,voided:false}})) throw new HttpError(409,"An attendance record already exists for this employee and day. Remove the incorrect record before replacing it.");
    const item=await tx.attendanceRecord.create({data:{...input,date,recordedById:adminId}});
    await audit(tx,"ATTENDANCE_RECORDED",adminId,"AttendanceRecord",item.id,{employeeId:input.employeeId,date:input.date,kind:input.kind});
    return item;
  });
}
export async function voidAttendance(adminId:string,body:unknown) {
  const input=attendanceVoidInput.parse(body);
  return write(async tx=>{
    const item=await tx.attendanceRecord.findUnique({where:{id:input.id}});
    if(!item || item.voided || item.version!==input.version) throw new HttpError(409,"This attendance record has changed. Refresh the schedule.");
    const result=await tx.attendanceRecord.update({where:{id:item.id},data:{voided:true,version:{increment:1}}});
    await audit(tx,"ATTENDANCE_VOIDED",adminId,"AttendanceRecord",item.id,{reason:input.reason});
    return result;
  });
}



