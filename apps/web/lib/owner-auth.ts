import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { HttpError } from './http';
export const OWNER_COOKIE='owner-relations';
export function ownerSecret() {
 const secret=process.env.AUTH_SECRET;
 if (!secret || secret.length<32) throw new Error('AUTH_SECRET must contain at least 32 characters.');
 return new TextEncoder().encode(secret);
}
export async function requireOwner() {
 try {
  const token=(await cookies()).get(OWNER_COOKIE)?.value;
  if (!token) throw new Error('Missing session');
  const {payload}=await jwtVerify(token,ownerSecret(),{issuer:'owner-relations',audience:'owner-relations',algorithms:['HS256']});
  if (!payload.sub) throw new Error('Missing subject');
  const owner=await prisma.ownerContact.findUnique({where:{id:payload.sub}});
  if (!owner?.active || !owner.passwordHash || payload.sessionVersion!==owner.sessionVersion) throw new Error('Revoked');
  return owner;
 } catch { throw new HttpError(401,'Owner sign-in is required.'); }
}
