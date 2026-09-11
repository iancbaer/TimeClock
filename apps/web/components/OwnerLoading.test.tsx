import { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { OwnerManage } from './OwnerManage';
import { OwnerStatements } from './OwnerStatements';

// A hook harness exercises the page effects in the existing Node-only test environment.
const hooks = vi.hoisted(() => ({active:false,index:0,states:[] as unknown[],effects:[] as (()=>unknown)[]}));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {...actual,useEffect:(effect:()=>unknown,deps:unknown[])=>hooks.active ? hooks.effects.push(effect) : actual.useEffect(effect as ()=>void,deps),useState:(initial:unknown)=>{
    if (!hooks.active) return actual.useState(initial);
    const i=hooks.index++;
    if (!(i in hooks.states)) hooks.states[i]=initial;
    return [hooks.states[i],(value:unknown)=>{hooks.states[i]=value;}];
  }};
});
function render(Page:()=>ReactElement) {
  hooks.index=0;hooks.active=true;
  let tree:ReactElement;
  try {tree=Page();} finally {hooks.active=false;}
  return renderToStaticMarkup(tree);
}
function mount(Page:()=>ReactElement) {
  const html=render(Page);
  hooks.effects.splice(0).forEach(effect=>effect());
  return html;
}
afterEach(()=>{vi.unstubAllGlobals();hooks.states=[];hooks.effects=[];hooks.active=false;});
const scope=(id:string)=>({id,name:`Property ${id}`,kind:'PROPERTY'});
const statement=(id:string)=>({id,scopeId:id,scope:scope(id),title:`Report ${id}`,period:id==='100'?'2020-01':'2026-01',filename:'report.pdf',byteSize:100,createdAt:'2026-01-01'});
const contact=(id:string)=>({id,name:`Contact ${id}`,email:`owner${id}@example.test`,active:true,activated:false,scopeIds:['0','100']});
function fixtureFetch(pending?:Promise<Response>,fail=false) {
  return vi.fn(async (input:string)=>{
    const url=new URL(input,'https://example.test');
    const key=url.pathname.split('/').pop()!;
    const offset=Number(url.searchParams.get('offset')||0);
    if(offset===100 && pending) return pending;
    if(offset===100 && fail) return Response.json({error:'Second page failed'},{status:503});
    const factory=key==='contacts'?contact:key==='scopes'?scope:statement;
    return Response.json({[key]:offset===0?Array.from({length:100},(_,i)=>factory(String(i))):[factory('100')],owner:{name:'Example'},pagination:{offset,limit:100,hasMore:offset===0}});
  });
}
it('limits contact names, scope names and statement titles to the backend 160 characters',()=>{
  hooks.states=[{contacts:[],scopes:[],statements:[]}];
  const html=render(OwnerManage);
  const inputs=html.match(/<input[^>]*name="(?:name|title)"[^>]*>/g);
  expect(inputs).toHaveLength(3);
  for(const input of inputs!) expect(input).toContain('maxLength="160"');
});
it('loads all contacts, scopes and published statements before grant editing',async()=>{
  const fetcher=fixtureFetch();vi.stubGlobal('fetch',fetcher);
  expect(mount(OwnerManage)).not.toContain('Save access');
  await vi.waitFor(()=>expect(hooks.states[0]).toMatchObject({contacts:expect.any(Array)}));
  const html=render(OwnerManage);
  expect(html).toContain('Contact 100');expect(html).toContain('Report 100');
  expect(html).toContain('Property 100');
  const data=hooks.states[0] as {contacts:{scopeIds:string[]}[];scopes:unknown[];statements:unknown[]};
  expect([data.contacts.length,data.scopes.length,data.statements.length]).toEqual([101,101,101]);
  expect(data.contacts[0].scopeIds).toEqual(['0','100']);
  expect(html.match(/checked=""/g)).toHaveLength(202);
});
it('does not display complete-list filters until the final owner statement page arrives',async()=>{
  let resolve!:(response:Response)=>void;
  const pending=new Promise<Response>(done=>{resolve=done;});
  const fetcher=fixtureFetch(pending);vi.stubGlobal('fetch',fetcher);
  mount(OwnerStatements);
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  expect(render(OwnerStatements)).not.toContain('All years');
  resolve(Response.json({statements:[statement('100')],owner:{name:'Example'},pagination:{offset:100,limit:100,hasMore:false}}));
  await vi.waitFor(()=>expect(hooks.states[0]).not.toBeNull());
  const html=render(OwnerStatements);
  expect(html).toContain('101 statements');expect(html).toContain('2020');expect(html).toContain('Report 100');
});
it.each([{name:'management',Page:OwnerManage},{name:'owner library',Page:OwnerStatements}])('fails closed on a later page error for $name',async ({Page})=>{
  vi.stubGlobal('fetch',fixtureFetch(undefined,true));mount(Page);
  await vi.waitFor(()=>expect(hooks.states[1]).toBe('Second page failed'));
  const html=render(Page);
  expect(html).toContain('Try again');expect(html).not.toContain('Save access');expect(html).not.toContain('All years');
  expect(hooks.states[0]).toBeNull();
});
