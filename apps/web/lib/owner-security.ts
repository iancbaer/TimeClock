import { createHash } from 'node:crypto';
import { HttpError } from './http';
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const TOTAL_PDF_BYTES = 1024 * 1024 * 1024;
export function validatePdf(bytes: Buffer, filename: string) {
 if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new HttpError(413,'PDF must be at most 10 MiB.');
 if (!/^[^/\\\r\n\x00-\x1f]{1,180}\.pdf$/i.test(filename) || !bytes.subarray(0,8).toString().match(/^%PDF-\d\.\d/) || !bytes.subarray(-1024).toString().includes('%%EOF')) throw new HttpError(400,'A valid PDF filename and PDF document are required.');
 return {filename,byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function sameOrigin(request: Request) {
 const origin=request.headers.get('origin');
 // The SDS worker proxies to timeclock.whichmore.com. Never derive trust
 // from Host or forwarded headers supplied on the upstream request.
 const url=new URL(request.url);
 const local=process.env.NODE_ENV!=='production' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && ['http:','https:'].includes(url.protocol) && origin===url.origin;
 if (request.headers.get('sec-fetch-site')==='cross-site' || (!local && origin!=='https://sdsoperations.com')) throw new HttpError(403,'Same-origin request required.');
}
export function publicContact(contact: {id:string;name:string;email:string;active:boolean;passwordHash:string|null;grants?:{scopeId:string}[];sessionVersion?:number}) {
 return {id:contact.id,name:contact.name,email:contact.email,active:contact.active,activated:!!contact.passwordHash,scopeIds:contact.grants?.map(g=>g.scopeId)??[]};
}
