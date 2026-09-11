import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {compare} from 'bcryptjs';
const s=vi.hoisted(()=>({fetch:vi.fn(),tx:vi.fn(),findUnique:vi.fn(),limit:vi.fn(),contact:vi.fn(),link:vi.fn(),create:vi.fn(),update:vi.fn(),consume:vi.fn(),raw:vi.fn()}));
vi.mock('./db',()=>({prisma:{$transaction:s.tx,ownerLink:{findUnique:s.findUnique}}}));
vi.mock('./account-links',()=>({takeEmailLimit:s.limit}));
import {sendOwnerLink,completeOwnerLink,issueOwnerLink,ownerPassword} from './owner-links';
beforeEach(()=>{
 vi.resetAllMocks();s.limit.mockResolvedValue(true);
 vi.stubEnv('TIMECLOCK_EMAIL_RELAY_KEY','synthetic-key-with-at-least-32-characters');
 vi.stubGlobal('fetch',s.fetch);
 s.tx.mockImplementation(async fn=>fn({$queryRaw:s.raw,ownerContact:{findUnique:s.contact,update:s.update},ownerLink:{findUnique:s.link,create:s.create,updateMany:s.consume}}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses only fixed owner relay payload and never returns tokens',async()=>{s.fetch.mockResolvedValue({ok:true});expect(await sendOwnerLink('a@example.test','token',true,'id')).toBeUndefined();expect(s.fetch.mock.calls[0][0]).toBe('https://sdsoperations.com/_account-email');expect(JSON.parse(s.fetch.mock.calls[0][1].body)).toEqual({email:'a@example.test',token:'token',invitation:true,id:'id',application:'owner-relations'});});
it('rejects invalid or previously consumed password links before mutation',async()=>{await expect(completeOwnerLink('bad','valid-password-123')).rejects.toMatchObject({status:400});s.findUnique.mockResolvedValue({usedAt:new Date()});await expect(completeOwnerLink('a'.repeat(43),'valid-password-123')).rejects.toMatchObject({status:400});expect(s.tx).not.toHaveBeenCalled();});
it('retries failed delivery with a fresh hashed token without consuming older links',async()=>{
 s.contact.mockResolvedValue({id:'c',email:'a@example.test',active:true,passwordHash:null});s.fetch.mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true});
 await expect(issueOwnerLink('c',true)).rejects.toMatchObject({status:502});expect(await issueOwnerLink('c',true)).toBeUndefined();
 expect(s.create).toHaveBeenCalledTimes(2);expect(s.consume).not.toHaveBeenCalled();
 const payloads=s.fetch.mock.calls.map(call=>JSON.parse(call[1].body));expect(payloads[0].token).not.toBe(payloads[1].token);
 for(let i=0;i<2;i++){const data=s.create.mock.calls[i][0].data;expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(data)).not.toContain(payloads[i].token);expect(payloads[i].id).toBe(data.id);}
});
it('enforces password length in bytes before hashing',()=>{expect(ownerPassword.safeParse('short').success).toBe(false);expect(ownerPassword.safeParse('é'.repeat(37)).success).toBe(false);expect(ownerPassword.safeParse('a'.repeat(72)).success).toBe(true);});
it('hashes password and consumes every outstanding link while revoking existing sessions',async()=>{
 const link={contactId:'c',usedAt:null,purpose:'RESET',expiresAt:new Date(Date.now()+60000)};s.findUnique.mockResolvedValue(link);s.link.mockResolvedValue(link);s.contact.mockResolvedValue({id:'c',active:true,passwordHash:'old'});
 await completeOwnerLink('a'.repeat(43),'valid-password-123');
 const data=s.update.mock.calls[0][0].data;expect(await compare('valid-password-123',data.passwordHash)).toBe(true);expect(data.sessionVersion).toEqual({increment:1});
 expect(s.consume).toHaveBeenCalledWith({where:{contactId:'c',usedAt:null},data:{usedAt:expect.any(Date)}});
 s.link.mockResolvedValue({...link,usedAt:new Date()});s.update.mockClear();await expect(completeOwnerLink('a'.repeat(43),'valid-password-123')).rejects.toMatchObject({status:400});expect(s.update).not.toHaveBeenCalled();
});
it('rechecks inactive contacts and expiry under the row lock',async()=>{
 const link={contactId:'c',usedAt:null,purpose:'INVITE',expiresAt:new Date(Date.now()+60000)};s.findUnique.mockResolvedValue(link);s.link.mockResolvedValue(link);s.contact.mockResolvedValue({id:'c',active:false,passwordHash:null});
 await expect(completeOwnerLink('a'.repeat(43),'valid-password-123')).rejects.toMatchObject({status:400});expect(s.update).not.toHaveBeenCalled();
 s.contact.mockResolvedValue({id:'c',active:true,passwordHash:null});s.link.mockResolvedValue({...link,expiresAt:new Date(0)});await expect(completeOwnerLink('a'.repeat(43),'valid-password-123')).rejects.toMatchObject({status:400});expect(s.update).not.toHaveBeenCalled();
});
