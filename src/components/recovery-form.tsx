"use client";
import { useState } from "react";
import { Button } from "./ui";
import { sv } from "@/i18n/sv";

export function RecoveryForm({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: email ? "update-password" : "recovery",
          email: email ?? form.get("email"),
          password: email ? form.get("password") : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || sv.auth.error);
      if (body.redirect) window.location.assign(body.redirect);
      else setMessage(sv.auth.recoverySent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : sv.auth.error);
    } finally {
      setBusy(false);
    }
  }
  return <form className="form-stack" onSubmit={submit}>
    {email ? <label>{sv.auth.password}<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="form-hint">{sv.auth.passwordHint}</span></label>
      : <label>{sv.auth.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
    <Button disabled={busy}>{busy ? sv.auth.busy : email ? sv.auth.resetButton : sv.auth.recoveryButton}</Button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
