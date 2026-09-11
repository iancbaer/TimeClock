import {beforeEach,expect,it,vi} from 'vitest';
import {SignJWT} from 'jose';
const s=vi.hoisted(()=>({token:'',findUnique:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=> name==='owner-relations' && s.token?{value:s.token}:undefined})}));
vi.mock('./db',()=>({prisma:{ownerContact:{findUnique:s.findUnique}}}));
import {requireOwner} from './owner-auth';
beforeEach(()=>{process.env.AUTH_SECRET='synthetic-secret-over-thirty-two-characters';s.findUnique.mockResolvedValue({id:'one',name:'Owner',active:true,passwordHash:'hash',sessionVersion:2});});
async function token(audience='owner-relations',version=2){s.token=await new SignJWT({sessionVersion:version}).setProtectedHeader({alg:'HS256'}).setSubject('one').setIssuer('owner-relations').setAudience(audience).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));}
it('authorizes only active current owner sessions with separate audience',async()=>{await token();await expect(requireOwner()).resolves.toMatchObject({id:'one'});await token('timeclock-admin');await expect(requireOwner()).rejects.toMatchObject({status:401});await token('owner-relations',1);await expect(requireOwner()).rejects.toMatchObject({status:401});await token();s.findUnique.mockResolvedValue({active:false,sessionVersion:2});await expect(requireOwner()).rejects.toMatchObject({status:401});});
