import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {hash} from 'bcryptjs';
import {jwtVerify} from 'jose';
const s=vi.hoisted(()=>({owner:vi.fn(),set:vi.fn(),limit:vi.fn()}));
vi.mock('./db',()=>({prisma:{ownerContact:{findUnique:s.owner}}}));
vi.mock('next/headers',()=>({cookies:async()=>({set:s.set})}));
vi.mock('./account-links',()=>({takeEmailLimit:s.limit}));
import {ownerAuthAction} from './owner-api';
import {OWNER_COOKIE,ownerSecret} from './owner-auth';
const req=(body:unknown)=>new Request('https://timeclock.whichmore.com/api/owner-relations/auth/login',{method:'POST',headers:{origin:'https://sdsoperations.com'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NODE_ENV','production');vi.stubEnv('AUTH_SECRET','synthetic-secret-over-thirty-two-characters');s.limit.mockResolvedValue(true);});
afterEach(()=>vi.unstubAllEnvs());
it('real password login sets only a secure owner cookie and owner JWT audience',async()=>{
 s.owner.mockResolvedValue({id:'c',active:true,passwordHash:await hash('owner-password-123',4),sessionVersion:7});
 expect(await ownerAuthAction(req({email:'A@example.test',password:'owner-password-123'}),'login')).toEqual({ok:true});
 expect(s.owner).toHaveBeenCalledWith({where:{email:'a@example.test'}});expect(s.set).toHaveBeenCalledOnce();
 const [name,token,options]=s.set.mock.calls[0];expect(name).toBe(OWNER_COOKIE);expect(options).toEqual({httpOnly:true,sameSite:'strict',secure:true,path:'/',maxAge:43200});
 const {payload}=await jwtVerify(token,ownerSecret(),{issuer:'owner-relations',audience:'owner-relations'});expect(payload).toMatchObject({sub:'c',sessionVersion:7});
 await expect(jwtVerify(token,ownerSecret(),{audience:'timeclock-admin'})).rejects.toBeDefined();
 s.set.mockClear();await ownerAuthAction(req({}),'logout');expect(s.set).toHaveBeenCalledExactlyOnceWith(OWNER_COOKIE,'',{...options,maxAge:0});
});
it('inactive, incorrect-password and rate-limited logins never issue cookies',async()=>{
 const owner={id:'c',active:true,passwordHash:await hash('owner-password-123',4),sessionVersion:0};s.owner.mockResolvedValue(owner);
 await expect(ownerAuthAction(req({email:'a@example.test',password:'incorrect'}),'login')).rejects.toMatchObject({status:401});
 s.owner.mockResolvedValue({...owner,active:false});await expect(ownerAuthAction(req({email:'a@example.test',password:'owner-password-123'}),'login')).rejects.toMatchObject({status:401});
 s.limit.mockResolvedValue(false);await expect(ownerAuthAction(req({email:'a@example.test',password:'owner-password-123'}),'login')).rejects.toMatchObject({status:429});expect(s.set).not.toHaveBeenCalled();
});
