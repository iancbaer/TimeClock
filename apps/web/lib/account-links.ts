import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { prisma } from './db';
import { HttpError } from './http';
import { sendAccountLink } from './account-email';

export function tokenDigest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function makeAccountToken() { return randomBytes(32).toString('base64url'); }
export function validToken(value: string) { return /^[A-Za-z0-9_-]{43}$/.test(value); }
const invalid = () => new HttpError(400, 'This link is invalid, expired, or already used. Request a new link.', 'INVALID_ACCOUNT_LINK');

// Persistent atomic counters work across application processes and restarts.
export async function takeEmailLimit(namespace: string, identity: string, limit: number, milliseconds: number) {
  const key = tokenDigest(`${namespace}\0${identity}`);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AccountEmailLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + ${milliseconds} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AccountEmailLimit"."expiresAt" <= NOW() THEN 1 ELSE "AccountEmailLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "AccountEmailLimit"."expiresAt" <= NOW() THEN NOW() + ${milliseconds} * INTERVAL '1 millisecond' ELSE "AccountEmailLimit"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}

export async function issueAccountLink(adminId: string, email: string, invitation: boolean, actorId?: string) {
  const token = makeAccountToken();
  const digest = tokenDigest(token);
  const id = randomUUID();
  const purpose = invitation ? 'INVITE' : 'RESET';
  const expires = new Date(Date.now() + (invitation ? 48 * 60 : 30) * 60000);
  await prisma.$transaction(async tx => {
    const admins = await tx.$queryRaw<{ active: boolean; mustChangePassword: boolean }[]>`SELECT "active", "mustChangePassword" FROM "AdminUser" WHERE "id"=${adminId} FOR UPDATE`;
    if (!admins[0]?.active || (invitation && !admins[0].mustChangePassword)) throw invalid();
    await tx.$executeRaw`INSERT INTO "AccountLink" ("id", "adminId", "tokenHash", "purpose", "expiresAt") VALUES (${id}, ${adminId}, ${digest}, ${purpose}, ${expires})`;
  });
  await sendAccountLink(email, token, invitation, id);
  await prisma.auditEvent.create({data:{action: invitation ? 'ADMIN_INVITATION_SENT' : 'ADMIN_RESET_EMAIL_SENT', actorType:actorId ? 'ADMIN' : 'SYSTEM', actorId:actorId ?? null,entityType:'AdminUser',entityId:adminId,metadata:{}}});
}

export async function completeAccountLink(token: string, password: string) {
  if (!validToken(token)) throw invalid();
  const digest = tokenDigest(token);
  const initial = await prisma.$queryRaw<{ adminId: string }[]>`SELECT "adminId" FROM "AccountLink" WHERE "tokenHash"=${digest} AND "usedAt" IS NULL AND "expiresAt">NOW()`;
  if (!initial[0]) throw invalid();
  const passwordHash = await hash(password, 12);
  await prisma.$transaction(async tx => {
    const adminId = initial[0].adminId;
    const admins = await tx.$queryRaw<{ active: boolean; mustChangePassword: boolean }[]>`SELECT "active", "mustChangePassword" FROM "AdminUser" WHERE "id"=${adminId} FOR UPDATE`;
    if (!admins[0]?.active) throw invalid();
    const links = await tx.$queryRaw<{ purpose: string }[]>`SELECT "purpose" FROM "AccountLink" WHERE "tokenHash"=${digest} AND "usedAt" IS NULL AND "expiresAt">NOW()`;
    if (!links[0] || (links[0].purpose === 'INVITE' && !admins[0].mustChangePassword)) throw invalid();
    await tx.adminUser.update({ where:{id:adminId}, data:{passwordHash,mustChangePassword:false,sessionVersion:{increment:1}} });
    await tx.$executeRaw`UPDATE "AccountLink" SET "usedAt"=NOW() WHERE "adminId"=${adminId} AND "usedAt" IS NULL`;
    await tx.auditEvent.create({data:{action: links[0].purpose === 'INVITE' ? 'ADMIN_INVITATION_ACCEPTED' : 'ADMIN_PASSWORD_RESET',actorType:'ADMIN',actorId:adminId,entityType:'AdminUser',entityId:adminId,metadata:{sessionsRevoked:true}}});
  });
}
