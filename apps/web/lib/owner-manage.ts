import {z} from 'zod';
import {prisma} from './db';
import {requireAdmin} from './auth';
import {HttpError} from './http';
import {sameOrigin,publicContact,validatePdf,MAX_PDF_BYTES,TOTAL_PDF_BYTES} from './owner-security';
import {ownerPage} from './owner-statements';
const name=z.string().trim().min(1).max(160);
export async function manageScopes(request:Request) {
 const admin=await requireAdmin({allowedRoles:[]});
 if(request.method==='GET'){const {offset,limit}=ownerPage(request);const rows=await prisma.ownerScope.findMany({orderBy:{id:'asc'},skip:offset,take:limit+1});return {scopes:rows.slice(0,limit),pagination:{offset,limit,hasMore:rows.length>limit}};}
 sameOrigin(request);const data=z.object({name,kind:z.enum(['ENTITY','PROPERTY'])}).strict().parse(await request.json());
 return prisma.$transaction(async tx=>{const scope=await tx.ownerScope.create({data});await tx.auditEvent.create({data:{action:'OWNER_SCOPE_CREATED',actorType:'ADMIN',actorId:admin.id,entityType:'OwnerScope',entityId:scope.id,metadata:{kind:scope.kind}}});return {scope};});
}
export async function patchContact(request:Request,id:string) {
 const admin=await requireAdmin({allowedRoles:[]});sameOrigin(request);
 const {active}=z.object({active:z.boolean()}).strict().parse(await request.json());
 return prisma.$transaction(async tx=>{const contact=await tx.ownerContact.update({where:{id},data:{active,sessionVersion:{increment:1}},include:{grants:true}});await tx.auditEvent.create({data:{action:'OWNER_CONTACT_ACTIVE_CHANGED',actorType:'ADMIN',actorId:admin.id,entityType:'OwnerContact',entityId:id,metadata:{active,sessionsRevoked:true}}});return {contact:publicContact(contact)};});
}
export async function replaceGrants(request:Request,id:string) {
 const admin=await requireAdmin({allowedRoles:[]});sameOrigin(request);
 const {scopeIds}=z.object({scopeIds:z.array(z.string().min(1).max(100)).max(1000)}).strict().parse(await request.json());
 const ids=[...new Set(scopeIds)];
 return prisma.$transaction(async tx=>{
  const contacts=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "OwnerContact" WHERE "id"=${id} FOR UPDATE`;
  if(!contacts.length)throw new HttpError(404,'Contact not found.');
  if(await tx.ownerScope.count({where:{id:{in:ids}}})!==ids.length)throw new HttpError(400,'Unknown scope.');
  await tx.ownerGrant.deleteMany({where:{contactId:id}});
  if(ids.length)await tx.ownerGrant.createMany({data:ids.map(scopeId=>({contactId:id,scopeId}))});
  await tx.auditEvent.create({data:{action:'OWNER_GRANTS_REPLACED',actorType:'ADMIN',actorId:admin.id,entityType:'OwnerContact',entityId:id,metadata:{scopeIds:ids}}});
  return {scopeIds:ids};
 });
}
export async function listManagedStatements(request:Request) {
 await requireAdmin({allowedRoles:[]});const {offset,limit}=ownerPage(request);
 const rows=await prisma.ownerStatement.findMany({include:{scope:{select:{id:true,name:true,kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:offset,take:limit+1});
 return {statements:rows.slice(0,limit),pagination:{offset,limit,hasMore:rows.length>limit}};
}
export async function manageContacts(request:Request) {
 const admin=await requireAdmin({allowedRoles:[]});
 if(request.method==='GET'){
  const {offset,limit}=ownerPage(request);const rows=await prisma.ownerContact.findMany({include:{grants:true},orderBy:{id:'asc'},skip:offset,take:limit+1});
  return {contacts:rows.slice(0,limit).map(publicContact),pagination:{offset,limit,hasMore:rows.length>limit}};
 }
 sameOrigin(request);const data=z.object({name,email:z.email().max(254).transform(s=>s.toLowerCase())}).strict().parse(await request.json());
 return prisma.$transaction(async tx=>{const contact=await tx.ownerContact.create({data:{...data,active:true,passwordHash:null,sessionVersion:0}});await tx.auditEvent.create({data:{action:'OWNER_CONTACT_CREATED',actorType:'ADMIN',actorId:admin.id,entityType:'OwnerContact',entityId:contact.id,metadata:{}}});return {contact:publicContact(contact)};});
}
export async function uploadStatement(request:Request) {
 const admin=await requireAdmin({allowedRoles:[]});sameOrigin(request);
 // Stream the envelope with a hard cap; do not trust Content-Length.
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Upload required.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PDF_BYTES+65536){await reader.cancel();throw new HttpError(413,'Upload is too large.');}chunks.push(value);}
 let form:FormData;
 try {form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();}catch {throw new HttpError(400,'Invalid multipart upload.');}
 const data=z.object({scopeId:z.string().min(1).max(100),title:name,period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).parse({scopeId:form.get('scopeId'),title:form.get('title'),period:form.get('period')});
 const file=form.get('file');if(!(file instanceof File)||file.type!=='application/pdf')throw new HttpError(400,'PDF with application/pdf content type is required.');
 const bytes=Buffer.from(await file.arrayBuffer());const metadata=validatePdf(bytes,file.name);
 const statement=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(728314901)`;
  if(!await tx.ownerScope.findUnique({where:{id:data.scopeId}}))throw new HttpError(400,'Scope does not exist.');
  const total=await tx.ownerStatement.aggregate({_sum:{byteSize:true}});
  if((total._sum.byteSize??0)+bytes.length>TOTAL_PDF_BYTES)throw new HttpError(413,'Owner statement storage quota reached.');
  const statement=await tx.ownerStatement.create({data:{...data,...metadata,document:{create:{bytes}}}});
  await tx.auditEvent.create({data:{action:'OWNER_STATEMENT_UPLOADED',actorType:'ADMIN',actorId:admin.id,entityType:'OwnerStatement',entityId:statement.id,metadata:{scopeId:data.scopeId,byteSize:metadata.byteSize,sha256:metadata.sha256}}});
  return statement;
 });return {statement};
}
