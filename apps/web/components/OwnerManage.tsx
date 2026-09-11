'use client';
import React, { useEffect, useState, type FormEvent } from 'react';
import { ownerRequest, ownerRequestAll } from './OwnerAuth';
import { type OwnerScope, type OwnerStatement, OwnerStatementList } from './OwnerStatements';
type Contact = {id:string;name:string;email:string;active:boolean;activated:boolean;scopeIds:string[]};
const errorText = (error:unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export function OwnerContactCard({contact,scopes,onChange}: {contact:Contact;scopes:OwnerScope[];onChange:()=>Promise<void>}) {
  const [selected,setSelected] = useState(contact.scopeIds);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  async function change(path:string,method:string,body:unknown,success:string) {
    setBusy(true);setError('');setMessage('');
    try {await ownerRequest(`/manage/contacts/${encodeURIComponent(contact.id)}${path}`,{method,body:JSON.stringify(body)});await onChange();setMessage(success);} catch (failure) {setError(errorText(failure));} finally {setBusy(false);}
  }
  return <article className="or-card"><h3>{contact.name}</h3><p className="or-contact-email">{contact.email}</p><p className="or-badge">{!contact.active ? 'Inactive' : contact.activated ? 'Active · Password set' : 'Active · Awaiting password'}</p>
    <fieldset disabled={busy}><legend>Statement access</legend><p className="or-muted">Only checked entities and properties are shared. No access is granted automatically.</p><div className="or-checkboxes">{scopes.map(scope => <label key={scope.id}><input type="checkbox" checked={selected.includes(scope.id)} onChange={event => setSelected(event.target.checked ? [...selected,scope.id] : selected.filter(id => id !== scope.id))} /><span>{scope.name}<small>{scope.kind === 'ENTITY' ? 'Entity' : 'Property'}</small></span></label>)}</div>{!scopes.length && <p>Add an entity or property first.</p>}
    <div className="or-actions"><button type="button" onClick={()=>change('/grants','PUT',{scopeIds:selected},'Statement access saved.')}>Save access</button><button type="button" className="or-secondary" onClick={()=>change('','PATCH',{active:!contact.active},contact.active ? 'Contact deactivated.' : 'Contact activated.')}>{contact.active ? 'Deactivate contact' : 'Activate contact'}</button><button type="button" className="or-secondary" disabled={!contact.active || contact.activated} onClick={()=>change('/invite','POST',{},'Invitation sent.')}>{contact.activated ? 'Already activated' : 'Send invitation'}</button></div></fieldset>
    {error && <p role="alert" className="or-error">{error}</p>}{message && <p role="status" className="or-success">{message}</p>}
  </article>;
}
export function OwnerManage() {
  const [data,setData] = useState<{contacts:Contact[];scopes:OwnerScope[];statements:OwnerStatement[]}|null>(null);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function load() {
    const [contacts,scopes,statements] = await Promise.all([ownerRequestAll<{contacts:Contact[]}>('/manage/contacts','contacts'),ownerRequestAll<{scopes:OwnerScope[]}>('/manage/scopes','scopes'),ownerRequestAll<{statements:OwnerStatement[]}>('/manage/statements','statements')]);
    setData({...contacts,...scopes,...statements});
  }
  useEffect(()=>{ let mounted = true; Promise.all([ownerRequestAll<{contacts:Contact[]}>('/manage/contacts','contacts'),ownerRequestAll<{scopes:OwnerScope[]}>('/manage/scopes','scopes'),ownerRequestAll<{statements:OwnerStatement[]}>('/manage/statements','statements')]).then(([contacts,scopes,statements])=>{if(mounted)setData({...contacts,...scopes,...statements});}).catch(failure=>{if(mounted)setError(errorText(failure));}); return ()=>{mounted=false;}; },[]);
  async function submit(event:FormEvent<HTMLFormElement>,kind:'contacts'|'scopes'|'statements') {
    event.preventDefault();const form = event.currentTarget;const fields = new FormData(form);setError('');setMessage('');
    if (kind === 'statements') {const file = fields.get('file');if (!(file instanceof File) || !file.size || file.size > 10*1024*1024 || !file.name.toLowerCase().endsWith('.pdf')) {setError('Choose a PDF file no larger than 10 MiB.');return;}}
    setBusy(true);
    try {await ownerRequest(`/manage/${kind}`,{method:'POST',body:kind === 'statements' ? fields : JSON.stringify(Object.fromEntries(fields))});form.reset();await load();setMessage(kind === 'contacts' ? 'Contact added. Assign statement access below, then send an invitation.' : kind === 'scopes' ? 'Entity or property added. Access is not granted automatically.' : 'Statement uploaded and available to contacts with access.');} catch(failure) {setError(errorText(failure));} finally {setBusy(false);}
  }
  return <><div className="or-heading"><div><p className="or-eyebrow">Global Admin</p><h1>Manage Owner Relations</h1><p>Share the right financial statements with the right people.</p></div><a href="/admin" className="or-button or-secondary">Back to TimeClock</a></div>
    {error && <div className="or-error" role="alert"><p>{error}</p>{!data && <><a href="/admin/login">Administrator sign in</a><p>A Global Admin account is required. Owner credentials cannot manage this portal.</p><button onClick={()=>{setError('');load().catch(failure=>setError(errorText(failure)));}}>Try again</button></>}</div>}{message && <p role="status" className="or-success">{message}</p>}
    {!data ? !error && <p role="status">Loading contacts and statements…</p> : <>
      <div className="or-admin-grid"><section className="or-card"><h2>1. Add a contact</h2><p>Each owner signs in with their own email address.</p><form onSubmit={event=>submit(event,'contacts')}><label>Name<input name="name" required maxLength={160} autoComplete="name" /></label><label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" /></label><button disabled={busy}>Add contact</button></form></section>
      <section className="or-card"><h2>2. Add an entity or property</h2><p>Use a name your owners will recognize.</p><form onSubmit={event=>submit(event,'scopes')}><label>Name<input name="name" required maxLength={160} /></label><label>Type<select name="kind"><option value="ENTITY">Entity</option><option value="PROPERTY">Property</option></select></label><button disabled={busy}>Add entity or property</button></form></section></div>
      <section aria-labelledby="or-contacts"><h2 id="or-contacts">3. Choose each contact’s access</h2><p>One contact can have access to multiple entities or properties. Each can be shared with multiple contacts.</p><div className="or-admin-grid">{data.contacts.map(contact=><OwnerContactCard key={`${contact.id}:${contact.scopeIds.slice().sort().join(',')}:${contact.active}`} contact={contact} scopes={data.scopes} onChange={load}/>)}</div>{!data.contacts.length && <p className="or-card">No contacts yet. Add your first contact above.</p>}</section>
      <section className="or-card"><h2>4. Upload a financial statement</h2><p>PDF only, up to 10 MiB. All contacts with access to the selected entity or property can download it.</p><form onSubmit={event=>submit(event,'statements')}><div className="or-admin-grid"><label>Entity or property<select name="scopeId" required defaultValue=""><option value="" disabled>Choose an entity or property</option>{data.scopes.map(scope=><option key={scope.id} value={scope.id}>{scope.name} ({scope.kind === 'ENTITY' ? 'Entity' : 'Property'})</option>)}</select></label><label>Statement title<input name="title" required maxLength={160} placeholder="Monthly financial statement" /></label><label>Statement month<input type="month" name="period" required /></label><label>PDF file<input type="file" name="file" accept="application/pdf,.pdf" required /></label></div><button disabled={busy || !data.scopes.length}>{busy ? 'Saving…' : 'Upload statement'}</button></form></section>
      <section><h2>Published statements</h2><OwnerStatementList statements={data.statements}/></section>
    </>}
  </>;
}
