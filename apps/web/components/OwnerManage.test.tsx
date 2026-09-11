import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OwnerContactCard } from './OwnerManage';
it.each([
  {active:true,activated:false,label:'Send invitation',disabled:false},
  {active:false,activated:false,label:'Send invitation',disabled:true},
  {active:true,activated:true,label:'Already activated',disabled:true},
  {active:false,activated:true,label:'Already activated',disabled:true},
])('shows the appropriate invitation action for $active / $activated',({active,activated,label,disabled})=>{
  const html=renderToStaticMarkup(createElement(OwnerContactCard,{contact:{id:'c',name:'Example',email:'owner@example.test',active,activated,scopeIds:[]},scopes:[],onChange:async()=>{}}));
  const button=html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
  expect(button).toBeDefined();
  expect(button!.includes('disabled=""')).toBe(disabled);
});
it('requires explicit scope checkbox grants and distinguishes inactive contacts', async () => {
  const modules = import.meta.glob('./OwnerManage.tsx') as Record<string, () => Promise<{OwnerContactCard: (props: Record<string,unknown>) => ReturnType<typeof createElement>}>>;
  const component = (await modules['./OwnerManage.tsx']?.())?.OwnerContactCard;
  expect(component,'OwnerContactCard exists').toBeDefined();
  const html = renderToStaticMarkup(createElement(component!, {contact:{id:'c',name:'Sample Owner',email:'owner@example.test',active:false,activated:false,scopeIds:['one']},scopes:[{id:'one',name:'Entity A',kind:'ENTITY'},{id:'two',name:'Property B',kind:'PROPERTY'}],onChange:()=>{}}));
  expect(html).toContain('Inactive');
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('Entity A');
  expect(html).toContain('Property B');
  expect(html).toContain('Save access');
  expect(html).toContain('Send invitation');
  expect(html).toContain('checked=""');
});
