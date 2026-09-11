"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export function AccountRecovery({setPassword=false}:{setPassword?:boolean}) {
  const [email,setEmail]=useState('');
  const token=useRef('');
  const [password,updatePassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(setPassword){
      token.current ||= new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
      window.history.replaceState(null,'',window.location.pathname);
    }
  },[setPassword]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setError('');
    if(setPassword && !token.current){setError('Open the complete link in your invitation or reset email.');return;}
    if(setPassword && password!==confirmation){setError('The passwords do not match.');return;}
    setBusy(true);
    try {
      const response=await fetch(setPassword?'/api/admin/set-password':'/api/admin/forgot-password',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(setPassword?{token:token.current,password}:{email})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Unable to complete this request.');
      setMessage(setPassword?'Your password is saved. Sign in with your email and new password.':data.message);
      updatePassword('');setConfirmation('');token.current='';
    } catch(e){setError(e instanceof Error?e.message:'Unable to complete this request.');}
    finally{setBusy(false);}
  }
  return <main className="centered-page"><form className="panel admin-login" onSubmit={submit}>
    <div className="panel-heading"><p className="eyebrow">SDS Operations</p><h1>{setPassword?'Choose your password':'Forgot your password?'}</h1>
      <p>{setPassword?'Use at least 12 characters. This link works once.':'Enter the email address you use to sign in.'}</p></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {message?<div className="notice" role="status">{message}</div>:<>
      {setPassword?<>
        <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={password} onChange={e=>updatePassword(e.target.value)}/></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      </>:<label>Email<input type="email" autoComplete="username" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      <button className="button primary large" disabled={busy}>{busy?'Please wait…':setPassword?'Save password':'Send reset link'}</button>
    </>}
    <Link href="/admin/login">Back to sign in</Link>
  </form></main>;
}
