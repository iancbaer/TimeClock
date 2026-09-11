import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
it('provides accessible owner sign-in with separate credentials and password recovery', async () => {
  const modules = import.meta.glob('./OwnerAuth.tsx') as Record<string, () => Promise<{OwnerAuth: (props:{mode:'login'}) => ReturnType<typeof createElement>}>>;
  const component = (await modules['./OwnerAuth.tsx']?.())?.OwnerAuth;
  expect(component, 'OwnerAuth exists').toBeDefined();
  const html = renderToStaticMarkup(createElement(component!, {mode:'login'}));
  expect(html).toContain('Owner Relations');
  expect(html).toContain('autoComplete="email"');
  expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain('/owner-relations/forgot-password');
  expect(html).toContain('for="owner-email"');
});
it('shows newest statements first with explicit PDF downloads and filters', async () => {
  const modules = import.meta.glob('./OwnerStatements.tsx') as Record<string, () => Promise<{OwnerStatementList: (props: {statements: unknown[]}) => ReturnType<typeof createElement>}>>;
  const component = (await modules['./OwnerStatements.tsx']?.())?.OwnerStatementList;
  expect(component, 'OwnerStatementList exists').toBeDefined();
  const statement = {scopeId:'scope-a',scope:{id:'scope-a',name:'Example property',kind:'PROPERTY'},filename:'report.pdf',byteSize:2048,createdAt:'2026-09-01'};
  const html = renderToStaticMarkup(createElement(component!, {statements:[{...statement,id:'old',title:'Older report',period:'2025-01'},{...statement,id:'new',title:'Newest report',period:'2026-08'}]}));
  expect(html.indexOf('Newest report')).toBeLessThan(html.indexOf('Older report'));
  expect(html).toContain('/api/owner-relations/statements/new/download');
  expect(html).toContain('Entity or property');
  expect(html).toContain('Year');
  expect(html).toContain('Download PDF');
});
