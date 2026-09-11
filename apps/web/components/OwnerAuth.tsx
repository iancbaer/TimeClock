'use client';
import React, { useEffect, useState, type FormEvent } from 'react';

export async function ownerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/owner-relations${path}`, { ...init, cache: 'no-store', credentials: 'same-origin', headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || (response.status === 401 ? 'Please sign in to continue.' : 'We could not complete that request. Please try again.'));
  return data as T;
}
// Resolve only after the complete collection is available; never expose partial grants or filters.
export async function ownerRequestAll<T = Record<string, unknown>, K extends keyof T & string = keyof T & string>(path: string, key: K): Promise<T> {
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query);
  const rows: unknown[] = [];
  let offset = 0;
  let first: T | undefined;
  while (true) {
    params.set('offset', String(offset));
    params.set('limit', '100');
    const page = await ownerRequest<T & {pagination:{offset:number;limit:number;hasMore:boolean}}>(`${pathname}?${params}`);
    const pagination = page?.pagination;
    const items = page?.[key];
    if (!Array.isArray(items) || !pagination || pagination.offset !== offset ||
        !Number.isInteger(pagination.limit) || pagination.limit < 1 || pagination.limit > 100 ||
        typeof pagination.hasMore !== 'boolean' || items.length > pagination.limit ||
        (pagination.hasMore && items.length !== pagination.limit)) {
      throw new Error('Unable to load the complete list. Please try again.');
    }
    first ??= page;
    rows.push(...items);
    if (!pagination.hasMore) return {...first, [key]: rows, pagination};
    offset += pagination.limit;
  }
}
export function OwnerAuth({ mode }: { mode: 'login' | 'forgot-password' | 'set-password' }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (mode !== 'set-password') return;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    // URL fragments are an external browser input; never persist the token.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
    window.history.replaceState(null, '', window.location.pathname);
    if (!value) setError('This link is missing or no longer available. Please request a new password link.');
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (mode === 'set-password' && password !== form.get('confirm')) { setError('Your passwords do not match. Please try again.'); setBusy(false); return; }
    try {
      await ownerRequest(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(mode === 'set-password' ? { token, password } : mode === 'login' ? { email: form.get('email'), password } : { email: form.get('email') }) });
      if (mode === 'login') window.location.assign(new URL('/owner-relations', window.location.origin).href);
      else setMessage(mode === 'forgot-password' ? 'If an active account matches that email, a password link will arrive shortly. Please check your inbox and spam folder.' : 'Your password is ready. You can now sign in.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  const title = mode === 'login' ? 'Welcome back' : mode === 'forgot-password' ? 'Reset your password' : 'Choose your password';
  return <section className="or-card or-auth"><p className="or-eyebrow">Owner Relations</p><h1>{title}</h1><p>{mode === 'login' ? 'Sign in to view and download your financial statements.' : mode === 'forgot-password' ? 'Enter your email and we’ll send you a secure link.' : 'Use at least 12 characters. A few memorable words work well.'}</p>
    {error && <p role="alert" className="or-error">{error}</p>}
    {message ? <div role="status" className="or-success"><p>{message}</p><a href="/owner-relations/login">Back to sign in</a></div> : <form onSubmit={submit} aria-busy={busy}>
      {mode !== 'set-password' && <label htmlFor="owner-email">Email address<input id="owner-email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
      {mode !== 'forgot-password' && <label htmlFor="owner-password">Password<input id="owner-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'set-password' ? 12 : undefined} maxLength={128} /></label>}
      {mode === 'set-password' && <label htmlFor="owner-confirm">Confirm password<input id="owner-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>}
      <button disabled={busy || (mode === 'set-password' && !token)}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'forgot-password' ? 'Send password link' : 'Save password'}</button>
    </form>}
    {mode === 'login' ? <><a href="/owner-relations/forgot-password">Forgot your password?</a><p className="or-muted">Use your Owner Relations account, not your TimeClock sign-in. New here? Open the invitation in your email.</p></> : <a href={mode === 'set-password' ? '/owner-relations/forgot-password' : '/owner-relations/login'}>{mode === 'set-password' ? 'Request a new link' : 'Back to sign in'}</a>}
  </section>;
}
