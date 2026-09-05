import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(pathToFileURL(`${process.cwd()}/apps/web/package.json`));
const { PrismaClient } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL);
if (process.argv.includes('--restore-check')) url.pathname = '/timeclock_restore_check_20260905';
const db = new PrismaClient({ datasourceUrl: url.toString() });
const tables = ['CompanySettings', 'Employee', 'AdminUser', 'Punch', 'PunchRevision', 'CorrectionRequest', 'PayPeriodApproval', 'KioskRelease', 'KioskDevice', 'AuditEvent', 'Shift', 'TimeOffRequest'];
try {
  const result = {};
  for (const table of tables) {
    // Names are a fixed allowlist. Only aggregate counts and digests leave SQL.
    const [row] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(COALESCE(jsonb_agg(t ORDER BY t.id)::text, '[]')) AS digest FROM "${table}" t`);
    result[table] = row;
  }
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
