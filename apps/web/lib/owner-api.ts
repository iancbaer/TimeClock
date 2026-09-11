import {z,ZodError} from 'zod';
import {compare} from 'bcryptjs';
import {SignJWT} from 'jose';
import {cookies} from 'next/headers';
import {prisma} from './db';
import {HttpError} from './http';
import {sameOrigin} from './owner-security';
import {OWNER_COOKIE,ownerSecret} from './owner-auth';
import {completeOwnerLink,issueOwnerLink,ownerPassword} from './owner-links';
import {takeEmailLimit} from './account-links';
import {requireAdmin} from './auth';
const email=z.email().max(254).transform(s=>s.toLowerCase());
export async function ownerResult(fn:()=>Promise<unknown>) {
 try {const value=await fn();return value instanceof Response?value:Response.json(value,{headers:{'Cache-Control':'private, no-store'}});}
 catch(error){let status=500,message='The server could not complete that request.';
  if(error instanceof HttpError){status=error.status;message=error.message;}
  else if(error instanceof ZodError||error instanceof SyntaxError){status=400;message='Invalid request.';}
  else if(error&&typeof error==='object'&&'code' in error){if(error.code==='P2002'){status=409;message='Record already exists.';}if(error.code==='P2025'){status=404;message='Record not found.';}}
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
export async function inviteOwner(request:Request,id:string){await requireAdmin({allowedRoles:[]});sameOrigin(request);await issueOwnerLink(id,true);return {ok:true};}
export async function ownerAuthAction(request:Request,action:string) {
 sameOrigin(request);
 const options={httpOnly:true,sameSite:'strict' as const,secure:process.env.NODE_ENV==='production',path:'/'};
 if(action==='logout'){(await cookies()).set(OWNER_COOKIE,'',{...options,maxAge:0});return {ok:true};}
 const body=await request.json();
 if(action==='set-password'){const data=z.object({token:z.string().max(100),password:ownerPassword}).strict().parse(body);if(!await takeEmailLimit('owner-redemption',data.token,10,1800000))throw new HttpError(429,'Please wait before trying again.');await completeOwnerLink(data.token,data.password);(await cookies()).set(OWNER_COOKIE,'',{...options,maxAge:0});return {ok:true};}
 if(action==='forgot-password'){
  const data=z.object({email}).strict().parse(body);
  if(await takeEmailLimit('owner-forgot',data.email,3,3600000)){
   const owner=await prisma.ownerContact.findUnique({where:{email:data.email}});
   if(owner?.active) {try {await issueOwnerLink(owner.id,!owner.passwordHash);}catch{/* Enumeration-safe; provider data is never logged. */}}
  }return {ok:true};
 }
 if(action==='login'){
  const data=z.object({email,password:z.string().min(1).max(72).refine(s=>Buffer.byteLength(s)<=72,'Password is too long.')}).strict().parse(body);
  if(!await takeEmailLimit('owner-login',data.email,12,300000))throw new HttpError(429,'Please wait before trying again.');
  const owner=await prisma.ownerContact.findUnique({where:{email:data.email}});
  const valid=await compare(data.password,owner?.passwordHash??'$2b$12$1qmj8y1xzSrZKJpjeSaAluuPrKSGIxQCqChM6QF4Y.cwcV9P.KK8e');
  if(!owner?.active||!owner.passwordHash||!valid)throw new HttpError(401,'Email or password is incorrect.');
  const token=await new SignJWT({sessionVersion:owner.sessionVersion}).setProtectedHeader({alg:'HS256'}).setSubject(owner.id).setIssuer('owner-relations').setAudience('owner-relations').setIssuedAt().setExpirationTime('12h').sign(ownerSecret());
  (await cookies()).set(OWNER_COOKIE,token,{...options,maxAge:43200});return {ok:true};
 }
 throw new HttpError(404,'Not found.');
}
