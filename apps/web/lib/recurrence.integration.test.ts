import {beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {prisma} from './db';
import {createShift,updateShift,readSchedule,requestTimeOff,decideTimeOff,recordAttendance,voidAttendance} from './scheduling';
if(!process.env.DATABASE_URL?.split('/').pop()?.startsWith('timeclock_email_test_')) throw new Error('Requires isolated test database');
let employeeId:string,adminId:string;
beforeEach(async()=>{
 const n=randomUUID();
 employeeId=(await prisma.employee.create({data:{employeeNumber:String(1001+await prisma.employee.count()),firstName:'Test',lastName:n}})).id;
 adminId=(await prisma.adminUser.create({data:{email:`${n}@example.invalid`,name:'Test admin',passwordHash:'unused'}})).id;
 await prisma.companySettings.upsert({where:{id:'default'},create:{id:'default',timeZone:'America/Los_Angeles',payPeriodAnchor:new Date('2026-01-05')},update:{timeZone:'America/Los_Angeles'}});
});
afterAll(()=>prisma.$disconnect());
const input=()=>({employeeId,startsAt:'2030-01-07T09:00',endsAt:'2030-01-07T17:00',publish:true,recurrence:{intervalWeeks:1,weekdays:[1,3],untilDate:'2030-01-16'}});
it('creates selected weekdays and keeps earlier shifts when cancelling following',async()=>{
 const first=await createShift(adminId,input());expect(first.createdCount).toBe(4);
 const shifts=await prisma.shift.findMany({where:{seriesId:first.seriesId},orderBy:{startsAt:'asc'},include:{series:true}});
 await updateShift(adminId,shifts[1].id,{action:'CANCEL',version:1,scope:'FOLLOWING',seriesVersion:1});
 expect((await prisma.shift.findUniqueOrThrow({where:{id:first.id}})).status).toBe('PUBLISHED');
 expect(await prisma.shift.count({where:{seriesId:first.seriesId,status:'CANCELLED'}})).toBe(3);
});
it('rolls back an entire series when one future occurrence conflicts',async()=>{
 await createShift(adminId,{employeeId,startsAt:'2030-01-16T10:00',endsAt:'2030-01-16T11:00'});
 await expect(createShift(adminId,input())).rejects.toMatchObject({code:'SHIFT_CONFLICT'});
 expect(await prisma.shift.count({where:{employeeId}})).toBe(1);
});
it('edits following occurrences, checks stale series versions, and preserves a single exception',async()=>{
 const first=await createShift(adminId,input());
 const shifts=await prisma.shift.findMany({where:{seriesId:first.seriesId},orderBy:{startsAt:'asc'}});
 await updateShift(adminId,shifts[1].id,{action:'SAVE',version:1,employeeId,startsAt:'2030-01-09T10:00',endsAt:'2030-01-09T18:00'});
 await expect(updateShift(adminId,first.id,{action:'CANCEL',version:1,scope:'FOLLOWING',seriesVersion:1})).rejects.toMatchObject({status:409});
 expect((await prisma.shift.findUniqueOrThrow({where:{id:first.id}})).startsAt.toISOString()).toBe('2030-01-07T17:00:00.000Z');
 await updateShift(adminId,shifts[2].id,{action:'SAVE',version:1,scope:'FOLLOWING',seriesVersion:2,employeeId,startsAt:'2030-01-14T08:00',endsAt:'2030-01-14T16:00'});
 expect((await prisma.shift.findUniqueOrThrow({where:{id:shifts[3].id}})).startsAt.toISOString()).toBe('2030-01-16T16:00:00.000Z');
});
it('approves time off and cancels only conflicting occurrences with an audit trail',async()=>{
 const first=await createShift(adminId,input());
 const leave=await requestTimeOff(employeeId,{startDate:'2030-01-09',endDate:'2030-01-09'});
 await expect(decideTimeOff(adminId,leave.id,{decision:'APPROVED'})).rejects.toMatchObject({code:'SHIFT_CONFLICT'});
 await decideTimeOff(adminId,leave.id,{decision:'APPROVED',cancelConflictingShifts:true});
 expect(await prisma.shift.count({where:{seriesId:first.seriesId,status:'PUBLISHED'}})).toBe(3);
 expect(await prisma.auditEvent.count({where:{entityId:leave.id,action:'TIME_OFF_SHIFTS_CANCELLED'}})).toBe(1);
 await expect(decideTimeOff(adminId,leave.id,{decision:'DENIED'})).rejects.toMatchObject({status:409});
});
it('records attendance privately without modifying shifts or punches and supports audited corrections',async()=>{
 const shift=await createShift(adminId,{employeeId,startsAt:'2026-09-08T09:00',endsAt:'2026-09-08T17:00',publish:true});
 const item=await recordAttendance(adminId,{employeeId,date:'2026-09-08',kind:'NO_CALL_NO_SHOW',note:'Admin-only note'});
 await expect(recordAttendance(adminId,{employeeId,date:'2026-09-08',kind:'SICK'})).rejects.toMatchObject({status:409});
 const query=new Request('https://example.invalid/?start=2026-09-07');
 expect((await readSchedule(query,employeeId)).attendance).toEqual([]);
 expect((await readSchedule(query)).attendance.some(a=>a.id===item.id)).toBe(true);
 expect((await prisma.shift.findUniqueOrThrow({where:{id:shift.id}})).status).toBe('PUBLISHED');
 expect(await prisma.punch.count({where:{employeeId}})).toBe(0);
 await voidAttendance(adminId,{id:item.id,version:1,reason:'Incorrect absence category'});
 expect((await recordAttendance(adminId,{employeeId,date:'2026-09-08',kind:'SICK'})).kind).toBe('SICK');
 await expect(recordAttendance(adminId,{employeeId,date:'2099-01-01',kind:'NO_CALL_NO_SHOW'})).rejects.toMatchObject({status:400});
});
it('serializes concurrent recurring schedules to prevent overlaps',async()=>{
 const results=await Promise.allSettled([createShift(adminId,input()),createShift(adminId,input())]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await prisma.shift.count({where:{employeeId}})).toBe(4);
});


it('accepts manager time-off requests as pending and attributes the admin actor',async()=>{
 await prisma.employee.update({where:{id:employeeId},data:{manager:true}});
 const leave=await requestTimeOff(employeeId,{startDate:'2030-02-04',endDate:'2030-02-05'},adminId);
 expect(leave.status).toBe('PENDING');
 expect(leave.resolvedById).toBeNull();
 expect(await prisma.auditEvent.findFirst({where:{entityId:leave.id,action:'TIME_OFF_REQUESTED'}})).toMatchObject({actorType:'ADMIN',actorId:adminId});
 await expect(requestTimeOff(employeeId,{startDate:'2030-02-05',endDate:'2030-02-06'},adminId)).rejects.toMatchObject({status:409});
 await prisma.employee.update({where:{id:employeeId},data:{active:false}});
 await expect(requestTimeOff(employeeId,{startDate:'2030-03-01',endDate:'2030-03-01'},adminId)).rejects.toMatchObject({status:400});
});
async function readOwn(query:Request){const result=await readSchedule(query);return {...result,shifts:result.shifts.filter(s=>s.employeeId===employeeId)};}
it('continues indefinitely, keeps cancelled exceptions, and stops after cancellation',async()=>{
 const first=await createShift(adminId,{...input(),recurrence:{intervalWeeks:1,weekdays:[1,3],untilDate:null}});
 const query=new Request('https://example.invalid/?start=2040-01-02');
 const future=(await readOwn(query)).shifts;
 expect(future.length).toBe(2);
 expect(future[0].series?.untilDate).toBeNull();
 await updateShift(adminId,future[0].id,{action:'CANCEL',version:future[0].version});
 expect((await readOwn(query)).shifts.length).toBe(1);
 const next=(await readOwn(query)).shifts[0];
 await updateShift(adminId,next.id,{action:'CANCEL',version:next.version,scope:'FOLLOWING',seriesVersion:next.series!.version});
 expect((await readOwn(new Request('https://example.invalid/?start=2045-01-02'))).shifts).toHaveLength(0);
 expect(await prisma.shift.count({where:{seriesId:first.seriesId,startsAt:{lt:next.startsAt},status:'PUBLISHED'}})).toBeGreaterThan(0);
});
it('following edits apply to ungenerated future shifts while earlier weeks keep their times',async()=>{
 const first=await createShift(adminId,{...input(),recurrence:{intervalWeeks:1,weekdays:[1],untilDate:null}});
 const future=(await readOwn(new Request('https://example.invalid/?start=2040-01-02'))).shifts[0];
 const day=future.startsAt.toISOString().slice(0,10);
 await updateShift(adminId,future.id,{action:'SAVE',version:future.version,scope:'FOLLOWING',seriesVersion:future.series!.version,employeeId,startsAt:day+'T10:00',endsAt:day+'T18:00'});
 const later=(await readOwn(new Request('https://example.invalid/?start=2045-01-02'))).shifts;
 expect(later).toHaveLength(1);
 expect(later[0].startsAt.toISOString().slice(11,16)).toBe('18:00');
 const earlier=(await readOwn(new Request('https://example.invalid/?start=2035-01-01'))).shifts;
 expect(earlier[0].startsAt.toISOString().slice(11,16)).toBe('17:00');
 expect((await prisma.shift.findUniqueOrThrow({where:{id:first.id}})).status).toBe('PUBLISHED');
});
it('protects infinite future shifts from manual conflicts and respects approved leave',async()=>{
 await createShift(adminId,{...input(),recurrence:{intervalWeeks:1,weekdays:[1],untilDate:null}});
 await expect(createShift(adminId,{employeeId,startsAt:'2040-01-02T10:00',endsAt:'2040-01-02T11:00'})).rejects.toMatchObject({code:'SHIFT_CONFLICT'});
 const leave=await requestTimeOff(employeeId,{startDate:'2040-01-02',endDate:'2040-01-02'});
 await expect(decideTimeOff(adminId,leave.id,{decision:'APPROVED'})).rejects.toMatchObject({code:'SHIFT_CONFLICT'});
 await decideTimeOff(adminId,leave.id,{decision:'APPROVED',cancelConflictingShifts:true});
 expect((await readOwn(new Request('https://example.invalid/?start=2040-01-02'))).shifts).toHaveLength(0);
});

it('rejects collisions between rules even when the first collision is beyond the initial window',async()=>{
 await createShift(adminId,{employeeId,startsAt:'2030-01-07T09:00',endsAt:'2030-01-07T17:00',recurrence:{intervalWeeks:11,weekdays:[1],untilDate:null}});
 await expect(createShift(adminId,{employeeId,startsAt:'2030-01-14T09:00',endsAt:'2030-01-14T17:00',recurrence:{intervalWeeks:12,weekdays:[1],untilDate:null}})).rejects.toMatchObject({code:'SHIFT_CONFLICT'});
});
