import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {z} from 'zod';
import {prisma} from './db';
import {HttpError} from './http';
import {takeEmailLimit} from './account-links';
const invalid=()=>new HttpError(400,'This link is invalid, expired, or already used.');
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export const ownerPassword=z.string().min(12).max(72).refine(s=>Buffer.byteLength(s)<=72,'Password is too long.');
export async function sendOwnerLink(email:string,token:string,invitation:boolean,id:string) {
 const key=process.env.TIMECLOCK_EMAIL_RELAY_KEY;if(!key||key.length<32)throw new HttpError(503,'Owner account email is not configured.');
 try {const response=await fetch('https://sdsoperations.com/_account-email',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`owner-account-${id}`},body:JSON.stringify({email,token,invitation,id,application:'owner-relations'}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Relay failure');}
 catch {throw new HttpError(502,'Email was not confirmed. Retry to send a new link.');}
}
export async function completeOwnerLink(token:string,password:string) {
 ownerPassword.parse(password);if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw invalid();
 const tokenHash=digest(token);const initial=await prisma.ownerLink.findUnique({where:{tokenHash}});
 if(!initial||initial.usedAt||initial.expiresAt<=new Date())throw invalid();
 const passwordHash=await hash(password,12);
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "OwnerContact" WHERE "id"=${initial.contactId} FOR UPDATE`;
  const contact=await tx.ownerContact.findUnique({where:{id:initial.contactId}});
  const link=await tx.ownerLink.findUnique({where:{tokenHash}});
  if(!contact?.active||!link||link.usedAt||link.expiresAt<=new Date()||(link.purpose==='INVITE'&&contact.passwordHash))throw invalid();
  await tx.ownerContact.update({where:{id:contact.id},data:{passwordHash,sessionVersion:{increment:1}}});
  await tx.ownerLink.updateMany({where:{contactId:contact.id,usedAt:null},data:{usedAt:new Date()}});
 });
}
export async function issueOwnerLink(id:string,invitation:boolean) {
 if(!await takeEmailLimit('owner-link',id,3,3600000))throw new HttpError(429,'Please wait before requesting another email.');
 const token=randomBytes(32).toString('base64url');const linkId=randomUUID();
 const contact=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "OwnerContact" WHERE "id"=${id} FOR UPDATE`;
  const contact=await tx.ownerContact.findUnique({where:{id}});
  if(!contact?.active||(invitation&&contact.passwordHash))throw invalid();
  // Retry issues a fresh link. Earlier delivered links remain usable until any one is redeemed.
  await tx.ownerLink.create({data:{id:linkId,contactId:id,tokenHash:digest(token),purpose:invitation?'INVITE':'RESET',expiresAt:new Date(Date.now()+(invitation?48*60:30)*60000)}});
  return contact;
 });
 await sendOwnerLink(contact.email,token,invitation,linkId);
}
