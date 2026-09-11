import { expect, it, vi } from 'vitest';
import { validatePdf, sameOrigin, publicContact } from './owner-security';
it('accepts a bounded PDF and rejects forged or oversized documents', () => {
 const pdf=Buffer.from('%PDF-1.7\nbody\n%%EOF');
 expect(validatePdf(pdf,'report.pdf')).toMatchObject({byteSize:pdf.length,filename:'report.pdf'});
 expect(()=>validatePdf(Buffer.from('not pdf'),'x.pdf')).toThrow();
 expect(()=>validatePdf(Buffer.alloc(10*1024*1024+1),'x.pdf')).toThrow();
 expect(()=>validatePdf(pdf,'../x.pdf')).toThrow();
});
it('requires explicit same-origin mutations',()=>{
 expect(()=>sameOrigin(new Request('https://sdsoperations.com/api',{headers:{origin:'https://evil.example'}}))).toThrow();
 expect(()=>sameOrigin(new Request('https://sdsoperations.com/api'))).toThrow();
 expect(()=>sameOrigin(new Request('https://sdsoperations.com/api',{headers:{origin:'https://sdsoperations.com'}}))).not.toThrow();
});
it('accepts only canonical public origin behind the proxy, and same-origin loopback in development',()=>{
 vi.stubEnv('NODE_ENV','production');
 const request=(url:string,origin:string)=>new Request(url,{headers:{origin,'x-forwarded-host':'evil.example','x-forwarded-proto':'https'}});
 try {
 expect(()=>sameOrigin(request('https://timeclock.whichmore.com/api','https://sdsoperations.com'))).not.toThrow();
 expect(()=>sameOrigin(request('https://evil.example/api','https://evil.example'))).toThrow();
 expect(()=>sameOrigin(request('http://localhost:3000/api','http://localhost:3000'))).toThrow();
 vi.stubEnv('NODE_ENV','development');
 expect(()=>sameOrigin(request('http://localhost:3000/api','http://localhost:3000'))).not.toThrow();
 expect(()=>sameOrigin(request('http://localhost:3000/api','http://localhost:4000'))).toThrow();
 } finally {vi.unstubAllEnvs();}
});
it('redacts contact secrets and exposes only explicit grants',()=>{
 expect(publicContact({id:'a',name:'A',email:'a@example.test',active:true,passwordHash:'SECRET',sessionVersion:3,grants:[{scopeId:'s'}]})).toEqual({id:'a',name:'A',email:'a@example.test',active:true,activated:true,scopeIds:['s']});
});
