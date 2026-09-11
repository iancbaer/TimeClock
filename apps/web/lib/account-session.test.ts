import { beforeEach, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { requireAdmin } from './auth';
const state=vi.hoisted(()=>({token:'',version:0,active:true}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:state.token})})}));
vi.mock('./db',()=>({prisma:{adminUser:{findUnique:async()=>({id:'test',role:'ADMIN',active:state.active,mustChangePassword:false,sessionVersion:state.version})}}}));
const secret='a-test-secret-at-least-thirty-two-characters-long';
beforeEach(()=>{process.env.AUTH_SECRET=secret;state.version=0;state.active=true;});
async function token(version?:number){state.token=await new SignJWT(version===undefined?{}:{sessionVersion:version}).setProtectedHeader({alg:'HS256'}).setSubject('test').setIssuer('timeclock').setAudience('timeclock-admin').setExpirationTime('1h').sign(new TextEncoder().encode(secret));}
it('preserves existing sessions until their account changes password',async()=>{
 await token();expect((await requireAdmin()).id).toBe('test');state.version=1;await expect(requireAdmin()).rejects.toThrow('expired');
});
it('rejects a session from before reset and accepts a newly issued session',async()=>{
 await token(1);state.version=2;await expect(requireAdmin()).rejects.toThrow('expired');await token(2);expect((await requireAdmin()).id).toBe('test');
});
it('still rejects disabled accounts with a current session version',async()=>{
 await token(0);state.active=false;await expect(requireAdmin()).rejects.toThrow('expired');
});
