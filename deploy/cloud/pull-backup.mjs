import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = 'C:\\ProgramData\\TimeClockCloudBackup';
const destination = path.join(root, 'archives');
mkdirSync(destination, { recursive: true });
const token = readFileSync(path.join(root, 'download-token.txt'), 'utf8').trim();
const response = await fetch('https://timeclock.whichmore.com/_timeclock-backup', {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`Backup retrieval failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const magic = Buffer.from('age-encryption.org/v1\n');
if (!bytes.subarray(0, magic.length).equals(magic)) throw new Error('Received data is not an age encrypted backup.');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const filename = path.join(destination, `timeclock-${stamp}.dump.age`);
writeFileSync(filename, bytes, { flag: 'wx' });
const sha256 = createHash('sha256').update(bytes).digest('hex');
writeFileSync(path.join(root, 'last-success.txt'), `UTC=${stamp}\nFile=${filename}\nSHA256=${sha256}\n`);
console.log(`Encrypted cloud backup received: ${filename}; ${bytes.length} bytes; SHA256=${sha256}`);
