import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

it('shows Owner Relations management only to Global Admin', async () => {
  const modules = import.meta.glob('./OwnerRelationsAdminLink.tsx', { eager: true }) as Record<string, { OwnerRelationsAdminLink: (props: { role?: string }) => ReturnType<typeof createElement> | null }>;
  const Component = modules['./OwnerRelationsAdminLink.tsx']?.OwnerRelationsAdminLink;
  expect(Component).toBeDefined();
  expect(renderToStaticMarkup(createElement(Component!, { role: 'GLOBAL_ADMIN' }))).toContain('/owner-relations/manage');
  expect(renderToStaticMarkup(createElement(Component!, { role: 'ADMIN' }))).toBe('');
  expect(renderToStaticMarkup(createElement(Component!, {}))).toBe('');
});
