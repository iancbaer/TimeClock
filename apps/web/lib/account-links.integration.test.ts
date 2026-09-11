import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { compare } from 'bcryptjs';
import { prisma } from './db';
import { completeAccountLink, issueAccountLink, makeAccountToken, takeEmailLimit, tokenDigest } from './account-links';
import { sendAccountLink } from './account-email';
vi.mock('./account-email',()=>({sendAccountLink:vi.fn().mockResolvedValue(undefined)}));
const password='A-test-password-with-24-chars';
beforeAll(()=>{if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/timeclock_email_test_'))throw new Error('Disposable database required');});
afterAll(async()=>{await prisma.$disconnect();});
async function account(){return prisma.adminUser.create({data:{email:`${makeAccountToken()}@example.test`,name:'Synthetic account',passwordHash:'unusable',mustChangePassword:true}});}
async function link(id:string,purpose='RESET',expired=false){const token=makeAccountToken();await prisma.$executeRaw`INSERT INTO "AccountLink" ("id","adminId","tokenHash","purpose","expiresAt") VALUES (${makeAccountToken()},${id},${tokenDigest(token)},${purpose},${new Date(Date.now()+(expired?-60000:60000))})`;return token;}
it('uses single-use invitations, saves a hash, and revokes all older links and sessions',async()=>{
 const user=await account();const token=await link(user.id,'INVITE');const other=await link(user.id);
 await completeAccountLink(token,password);
 const updated=await prisma.adminUser.findUniqueOrThrow({where:{id:user.id}});
 expect(updated.mustChangePassword).toBe(false);expect(updated.sessionVersion).toBe(1);expect(await compare(password,updated.passwordHash)).toBe(true);
 await expect(completeAccountLink(token,password)).rejects.toThrow('invalid');await expect(completeAccountLink(other,password)).rejects.toThrow('invalid');
});
it('rejects expired tokens and disabled accounts without modifying their passwords',async()=>{
 const user=await account();await expect(completeAccountLink(await link(user.id,'RESET',true),password)).rejects.toThrow('invalid');
 const token=await link(user.id);await prisma.adminUser.update({where:{id:user.id},data:{active:false}});
 await expect(completeAccountLink(token,password)).rejects.toThrow('invalid');
 expect((await prisma.adminUser.findUniqueOrThrow({where:{id:user.id}})).passwordHash).toBe('unusable');
});
it('allows only one of two concurrent redemptions, including different links for one account',async()=>{
 const user=await account();const a=await link(user.id);const b=await link(user.id);
 const results=await Promise.allSettled([completeAccountLink(a,password),completeAccountLink(b,'Another-strong-test-password')]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
});
it('does not allow an invitation to reset an already activated account',async()=>{
 const user=await account();const token=await link(user.id,'INVITE');await prisma.adminUser.update({where:{id:user.id},data:{mustChangePassword:false}});
 await expect(completeAccountLink(token,password)).rejects.toThrow('invalid');
});
it('stores only the hash of the emailed token',async()=>{
 const user=await account();await issueAccountLink(user.id,user.email,true);
 const args=vi.mocked(sendAccountLink).mock.calls.at(-1)!;
 const rows=await prisma.$queryRaw<{tokenHash:string}[]>`SELECT "tokenHash" FROM "AccountLink" WHERE "adminId"=${user.id}`;
 expect(rows[0].tokenHash).toBe(tokenDigest(args[1]));expect(rows[0].tokenHash).not.toBe(args[1]);
});
it('enforces the rate limit atomically across concurrent requests',async()=>{
 const results=await Promise.all(Array.from({length:12},()=>takeEmailLimit('test',makeIdentity,3,60000)));
 expect(results.filter(Boolean)).toHaveLength(3);
});
const makeIdentity=makeAccountToken();
