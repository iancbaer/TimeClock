import { createElement } from 'react';

export function OwnerRelationsAdminLink({ role }: { role?: string }) {
  if (role !== 'GLOBAL_ADMIN') return null;
  return createElement('a', { href: '/owner-relations/manage', className: 'button secondary' }, 'Owner Relations');
}
