import {expect,it,vi} from 'vitest';
vi.mock('./auth',()=>({requireAdmin:vi.fn().mockRejectedValue(new Error('no auth'))}));vi.mock('./db',()=>({prisma:{}}));
it('exposes all fixed API methods without server initialization side effects',async()=>{
 const routes=[['manage/contacts',['GET','POST']],['manage/contacts/[id]',['PATCH']],['manage/contacts/[id]/grants',['PUT']],['manage/contacts/[id]/invite',['POST']],['manage/scopes',['GET','POST']],['manage/statements',['GET','POST']],['statements',['GET']],['statements/[id]/download',['GET']],...['login','logout','forgot-password','set-password'].map(a=>['auth/'+a,['POST']])];
 for(const [path,methods] of routes){const route=await import('../app/api/owner-relations/'+path+'/route');for(const method of methods)expect(typeof route[method]).toBe('function');}
});
