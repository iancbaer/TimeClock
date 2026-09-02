"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sign-in failed.");
      router.push(data.admin.mustChangePassword ? "/admin/change-password" : "/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered-page">
      <form className="panel admin-login" onSubmit={submit}>
        <Link className="back-link" href="/">← Return to TimeClock</Link>
        <div className="panel-heading">
          <p className="eyebrow">Manager sign-in</p>
          <h1>TimeClock</h1>
          <p>Review worker records, resolve corrections, and prepare accurate pay-period sheets.</p>
        </div>
        {error && <div className="notice error">{error}</div>}
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="button primary large" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
