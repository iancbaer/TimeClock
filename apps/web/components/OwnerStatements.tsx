'use client';
import React, { useEffect, useState } from 'react';
import { ownerRequest, ownerRequestAll } from './OwnerAuth';
const errorText = (failure:unknown) => failure instanceof Error ? failure.message : 'Unable to load statements.';
export type OwnerScope = { id: string; name: string; kind: 'ENTITY' | 'PROPERTY' };
export type OwnerStatement = {id:string;scopeId:string;title:string;period:string;filename:string;byteSize:number;createdAt:string;scope:OwnerScope};
export function OwnerStatementList({statements}: {statements:OwnerStatement[]}) {
  const [scope, setScope] = useState('');
  const [year, setYear] = useState('');
  const scopes = Array.from(new Map(statements.map(item => [item.scopeId,item.scope])).values()).sort((a,b) => a.name.localeCompare(b.name));
  const years = Array.from(new Set(statements.map(item => item.period.slice(0,4)))).sort().reverse();
  const visible = statements.filter(item => (!scope || item.scopeId === scope) && (!year || item.period.startsWith(year))).sort((a,b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
  return <><div className="or-filters or-card"><label>Entity or property<select value={scope} onChange={event => setScope(event.target.value)}><option value="">All entities and properties</option>{scopes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Year<select value={year} onChange={event => setYear(event.target.value)}><option value="">All years</option>{years.map(value => <option key={value}>{value}</option>)}</select></label></div>
    <p role="status" className="or-muted">{visible.length} {visible.length === 1 ? 'statement' : 'statements'} · Newest first</p>
    {!visible.length && <div className="or-card"><h2>{statements.length ? 'No matching statements' : 'Your statements will appear here'}</h2><p>{statements.length ? 'Choose another year or property to see more statements.' : 'There are no statements shared with you yet. Please check back later or contact your property manager.'}</p></div>}
    <ul className="or-statements">{visible.map(item => <li className="or-card or-statement" key={item.id}><div><p className="or-eyebrow">{item.scope.name}</p><h2>{item.title}</h2><p className="or-muted"><time dateTime={item.period}>{new Date(`${item.period}-01T12:00:00Z`).toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</time> · PDF · {Math.max(1,Math.ceil(item.byteSize/1024))} KB</p></div><a className="or-button" href={`/api/owner-relations/statements/${encodeURIComponent(item.id)}/download`} download aria-label={`Download PDF: ${item.title}, ${item.scope.name}, ${item.period}`}>Download PDF <span aria-hidden="true">↓</span></a></li>)}</ul>
  </>;
}
export function OwnerStatements() {
  const [data,setData] = useState<{statements:OwnerStatement[];owner:{name:string}} | null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function load() { setError(''); try { setData(await ownerRequestAll<{statements:OwnerStatement[];owner:{name:string}}>('/statements','statements')); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load statements.'); } }
  useEffect(() => { let mounted = true; ownerRequestAll<{statements:OwnerStatement[];owner:{name:string}}>('/statements','statements').then(value => { if (mounted) setData(value); }).catch(failure => { if (mounted) setError(errorText(failure)); }); return () => { mounted = false; }; }, []);
  async function logout() { setBusy(true); try { await ownerRequest('/auth/logout',{method:'POST'}); window.location.assign(new URL('/owner-relations/login', window.location.origin).href); } catch {setError('Could not sign out. Please try again.');setBusy(false);} }
  return <><div className="or-heading"><div><p className="or-eyebrow">Your private document library</p><h1>Financial statements</h1><p>{data ? `Welcome, ${data.owner.name}. Your statements, all in one place.` : 'View and download the statements shared with you.'}</p></div><button className="or-secondary" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button></div>
    {error ? <div className="or-error" role="alert"><p>{error}</p><div className="or-actions"><button onClick={load}>Try again</button><a href="/owner-relations/login">Sign in</a></div></div> : !data ? <p role="status">Loading your statements…</p> : <OwnerStatementList statements={data.statements} />}
  </>;
}
