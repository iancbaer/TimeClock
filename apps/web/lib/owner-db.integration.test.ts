import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compare } from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

// No Prisma mocks, seeded identities, production data, or email delivery.
vi.mock('./auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('./owner-auth', () => ({ requireOwner: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('./account-email', () => ({ sendAccountLink: vi.fn() }));
import { requireAdmin } from './auth';
import { requireOwner } from './owner-auth';
import { HttpError } from './http';

const enabled = process.env.OWNER_DB_TEST === '1';
function disposableDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.pathname.startsWith('/timeclock_email_test_')) {
    throw new Error('OWNER_DB_TEST requires a disposable /timeclock_email_test_ database');
  }
}
// Fail before importing/connecting Prisma, and repeat immediately before migration.
if (enabled) disposableDatabase();

const run = `owner-db-${randomUUID()}`;
const contactIds: string[] = [];
const scopeIds: string[] = [];
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const password = 'Synthetic-owner-password-42';
let prisma: PrismaClient;
let manage: typeof import('./owner-manage');
let statements: typeof import('./owner-statements');
let links: typeof import('./owner-links');
const request = (body?: unknown, method = body === undefined ? 'GET' : 'POST') => new Request('https://sdsoperations.com/api/owner-test', {
  method, headers: { Origin: 'https://sdsoperations.com', 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
function upload(scopeId: string, title = `${run}-statement`) {
  const form = new FormData();
  form.set('scopeId', scopeId); form.set('title', title); form.set('period', '2026-09');
  form.set('file', new File([pdf], 'synthetic.pdf', { type: 'application/pdf' }));
  return new Request('https://sdsoperations.com/api/owner-test', { method: 'POST', headers: { Origin: 'https://sdsoperations.com' }, body: form });
}
function admin(invalidAuditActor = false) {
  // Invalid actor type deliberately makes the REAL audit insert fail after writes.
  vi.mocked(requireAdmin).mockResolvedValue({ id: invalidAuditActor ? 123 : run } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
}
async function owner(id: string) {
  vi.mocked(requireAdmin).mockRejectedValue(new HttpError(401, 'No admin session'));
  vi.mocked(requireOwner).mockResolvedValue(await prisma.ownerContact.findUniqueOrThrow({ where: { id } }));
}
async function contact() {
  const result = await manage.manageContacts(request({ name: `${run}-contact`, email: `${randomUUID()}@example.test` }));
  if (!('contact' in result)) throw new Error('Expected contact creation');
  contactIds.push(result.contact.id); return result.contact;
}
async function scope() {
  const result = await manage.manageScopes(request({ name: `${run}-scope`, kind: 'PROPERTY' }));
  if (!('scope' in result)) throw new Error('Expected scope creation');
  scopeIds.push(result.scope.id); return result.scope;
}
async function token(contactId: string, purpose = 'INVITE', expired = false) {
  const raw = randomBytes(32).toString('base64url');
  await prisma.ownerLink.create({ data: { id: randomUUID(), contactId, tokenHash: digest(raw), purpose, expiresAt: new Date(Date.now() + (expired ? -60000 : 60000)) } });
  return raw;
}
async function audits(entityId: string, action: string) {
  return prisma.auditEvent.findMany({ where: { actorId: run, entityId, action } });
}

describe.skipIf(!enabled)('Owner Relations disposable PostgreSQL integration', () => {
  beforeAll(async () => {
    disposableDatabase();
    // Actually deploy checked-in migrations, not db push or a fabricated schema.
    execFileSync(process.execPath, [createRequire(import.meta.url).resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: process.env, stdio: 'pipe', timeout: 60000,
    });
    prisma = (await import('./db')).prisma;
    manage = await import('./owner-manage'); statements = await import('./owner-statements'); links = await import('./owner-links');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No real network/email in owner DB tests')));
    const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.every(m => m.finished_at !== null)).toBe(true);
  }, 70000);
  beforeEach(() => { admin(); vi.mocked(requireOwner).mockReset(); });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!prisma) return;
    // Only this run's identities/scopes/audits; FK cascades remove bytes and links.
    await prisma.ownerStatement.deleteMany({ where: { scopeId: { in: scopeIds } } });
    await prisma.ownerContact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.ownerScope.deleteMany({ where: { id: { in: scopeIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: run } });
    await prisma.$disconnect();
  });

  it('persists audited CRUD, shared many-to-many scopes, bytes, isolation and immediate grant revocation', async () => {
    const a = await contact(), b = await contact(), isolated = await contact();
    const shared = await scope(), privateScope = await scope();
    expect(a).not.toHaveProperty('passwordHash'); expect(a).not.toHaveProperty('sessionVersion');
    expect(await audits(a.id, 'OWNER_CONTACT_CREATED')).toHaveLength(1);
    expect(await audits(shared.id, 'OWNER_SCOPE_CREATED')).toHaveLength(1);
    await manage.replaceGrants(request({ scopeIds: [shared.id, privateScope.id, shared.id] }), a.id);
    await manage.replaceGrants(request({ scopeIds: [shared.id] }), b.id);
    expect(await prisma.ownerGrant.count({ where: { contactId: a.id } })).toBe(2);
    const first = (await manage.uploadStatement(upload(shared.id))).statement;
    const second = (await manage.uploadStatement(upload(privateScope.id))).statement;
    expect(first).toMatchObject({ byteSize: pdf.length, sha256: digest(pdf), period: '2026-09' });
    expect((await prisma.ownerStatementBytes.findUniqueOrThrow({ where: { statementId: first.id } })).bytes).toEqual(new Uint8Array(pdf));
    expect(await audits(first.id, 'OWNER_STATEMENT_UPLOADED')).toMatchObject([{ metadata: { scopeId: shared.id, byteSize: pdf.length, sha256: digest(pdf) } }]);
    expect((await manage.listManagedStatements(request())).statements.map(s => s.id)).toContain(first.id);
    expect((await manage.manageContacts(request()) as { contacts: { id: string }[] }).contacts.map(c => c.id)).toContain(a.id);
    await owner(a.id);
    expect((await statements.listOwnerStatements(request())).statements.map(s => s.id).sort()).toEqual([first.id, second.id].sort());
    await owner(b.id);
    expect((await statements.listOwnerStatements(request())).statements.map(s => s.id)).toEqual([first.id]);
    const download = await statements.downloadOwnerStatement(first.id);
    expect(download.headers.get('Content-Type')).toBe('application/pdf');
    expect(download.headers.get('Cache-Control')).toBe('private, no-store');
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);
    await expect(statements.downloadOwnerStatement(second.id)).rejects.toMatchObject({ status: 404 });
    await owner(isolated.id);
    expect((await statements.listOwnerStatements(request())).statements).toEqual([]);
    await expect(statements.downloadOwnerStatement(first.id)).rejects.toMatchObject({ status: 404 });
    admin(); await manage.replaceGrants(request({ scopeIds: [] }), b.id);
    expect(await audits(b.id, 'OWNER_GRANTS_REPLACED')).toHaveLength(2);
    await owner(b.id);
    await expect(statements.downloadOwnerStatement(first.id)).rejects.toMatchObject({ status: 404 });
    expect((await statements.listOwnerStatements(request())).statements).toEqual([]);
    admin(); await manage.patchContact(request({ active: false }, 'PATCH'), a.id);
    expect(await prisma.ownerContact.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ active: false, sessionVersion: 1 });
    expect(await audits(a.id, 'OWNER_CONTACT_ACTIVE_CHANGED')).toHaveLength(1);
  });

  it('rolls back contact, scope, grant, state and byte writes when the audit insert fails', async () => {
    const c = await contact(), s = await scope();
    await manage.replaceGrants(request({ scopeIds: [s.id] }), c.id);
    const before = await prisma.auditEvent.count({ where: { actorId: run } });
    admin(true);
    const email = `${randomUUID()}@example.test`, name = `${run}-rollback-scope`;
    await expect(manage.manageContacts(request({ name: run, email }))).rejects.toThrow();
    await expect(manage.manageScopes(request({ name, kind: 'ENTITY' }))).rejects.toThrow();
    await expect(manage.replaceGrants(request({ scopeIds: [] }), c.id)).rejects.toThrow();
    await expect(manage.patchContact(request({ active: false }, 'PATCH'), c.id)).rejects.toThrow();
    await expect(manage.uploadStatement(upload(s.id))).rejects.toThrow();
    expect(await prisma.ownerContact.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.ownerScope.count({ where: { name } })).toBe(0);
    expect(await prisma.ownerContact.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ active: true, sessionVersion: 0 });
    expect(await prisma.ownerGrant.findMany({ where: { contactId: c.id } })).toEqual([{ contactId: c.id, scopeId: s.id }]);
    expect(await prisma.ownerStatement.count({ where: { scopeId: s.id } })).toBe(0);
    expect(await prisma.ownerStatementBytes.count({ where: { statement: { scopeId: s.id } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorId: run } })).toBe(before);
  });

  it('waits on the real PostgreSQL upload advisory lock before committing metadata, bytes and audit', async () => {
    const s = await scope();
    let release!: () => void, locked!: () => void;
    const held = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const holder = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728314901)`;
      locked(); await gate;
    }, { timeout: 15000 });
    // Observe holder failure rather than hanging if PostgreSQL cannot acquire it.
    await Promise.race([held, holder]);
    const pending = manage.uploadStatement(upload(s.id));
    const settled = pending.then(() => true, () => true);
    try {
      await vi.waitFor(async () => {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=728314901 AND NOT granted) AS waiting`;
        expect(rows[0].waiting).toBe(true);
      }, { timeout: 3000, interval: 25 });
      expect(await Promise.race([settled, Promise.resolve(false)])).toBe(false);
      expect(await prisma.ownerStatement.count({ where: { scopeId: s.id } })).toBe(0);
    } finally { release(); await holder; await settled; }
    const result = await pending;
    expect(await audits(result.statement.id, 'OWNER_STATEMENT_UPLOADED')).toHaveLength(1);
    expect(await prisma.ownerStatementBytes.count({ where: { statementId: result.statement.id } })).toBe(1);
  }, 20000);

  it.each(['same token', 'different tokens'])('redeems concurrent invitations exactly once: %s', async mode => {
    const c = await contact(), a = await token(c.id), b = mode === 'same token' ? a : await token(c.id);
    const sibling = await token(c.id, 'RESET');
    const passwords = [password, 'Different-synthetic-password-43'];
    const results = await Promise.allSettled([links.completeOwnerLink(a, passwords[0]), links.completeOwnerLink(b, passwords[1])]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find(r => r.status === 'rejected');
    expect(loser).toMatchObject({ status: 'rejected', reason: { status: 400 } });
    const saved = await prisma.ownerContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.sessionVersion).toBe(1); expect(saved.passwordHash).not.toBe(password);
    expect(await compare(passwords[results.findIndex(r => r.status === 'fulfilled')], saved.passwordHash!)).toBe(true);
    expect(await prisma.ownerLink.count({ where: { contactId: c.id, usedAt: null } })).toBe(0);
    await expect(links.completeOwnerLink(sibling, password)).rejects.toMatchObject({ status: 400 });
    await expect(links.completeOwnerLink(a, password)).rejects.toMatchObject({ status: 400 });
    const invitation = await token(c.id);
    await expect(links.completeOwnerLink(invitation, password)).rejects.toMatchObject({ status: 400 });
    expect((await prisma.ownerContact.findUniqueOrThrow({ where: { id: c.id } })).passwordHash).toBe(saved.passwordHash);
  }, 20000);

  it('rejects invalid passwords, expired and disabled invitations without consuming tokens or changing credentials', async () => {
    const c = await contact(), valid = await token(c.id), expired = await token(c.id, 'INVITE', true);
    for (const weak of ['short', 'a'.repeat(73), 'é'.repeat(40)]) await expect(links.completeOwnerLink(valid, weak)).rejects.toThrow();
    await expect(links.completeOwnerLink(expired, password)).rejects.toMatchObject({ status: 400 });
    await manage.patchContact(request({ active: false }, 'PATCH'), c.id);
    await expect(links.completeOwnerLink(valid, password)).rejects.toMatchObject({ status: 400 });
    expect(await prisma.ownerContact.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ passwordHash: null, sessionVersion: 1 });
    expect(await prisma.ownerLink.count({ where: { contactId: c.id, usedAt: { not: null } } })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  }, 10000);
});
