"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangeAdminPassword() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not change the password.");
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="centered-page">
    <form className="panel admin-login" onSubmit={submit}>
      <div className="panel-heading">
        <p className="eyebrow">Secure your manager account</p>
        <h1>Choose your password</h1>
        <p>Replace the one-time temporary password before accessing payroll records.</p>
      </div>
      {error && <div className="notice error">{error}</div>}
      <label>Temporary password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
      <button className="button primary large" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  </main>;
}
