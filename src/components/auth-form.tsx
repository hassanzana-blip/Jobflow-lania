"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui";
import { sv } from "@/i18n/sv";
import { mobileSv } from "@/i18n/mobile-sv";
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: mode === "login" && method === "magic" ? "magic" : mode,
          email: data.get("email"),
          password: data.get("password") || undefined,
          acceptedPrivacy: data.get("privacy") === "on",
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(typeof body.error === "string" ? body.error : sv.auth.error);
      if (body.redirect) window.location.assign(body.redirect);
      else setMessage(sv.auth.checkEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : sv.auth.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {mode === "login" && (
        <div className="jf-filter-row">
          <button
            type="button"
            aria-pressed={method === "password"}
            onClick={() => setMethod("password")}
          >
            {sv.auth.password}
          </button>
          <button
            type="button"
            aria-pressed={method === "magic"}
            onClick={() => setMethod("magic")}
          >
            {mobileSv.emailLink}
          </button>
        </div>
      )}
      <label>
        {sv.auth.email}
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      {(mode === "signup" || method === "password") && (
        <label>
          {sv.auth.password}
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "signup" ? 12 : 1}
            maxLength={128}
          />
          {mode === "signup" && <span className="form-hint">{sv.auth.passwordHint}</span>}
        </label>
      )}
      {mode === "signup" && (
        <label className="checkbox">
          <input name="privacy" type="checkbox" required />
          {sv.auth.consent}
        </label>
      )}
      <Button disabled={busy}>
        {busy
          ? sv.auth.busy
          : mode === "signup"
            ? sv.auth.submit
            : sv.auth.login}
      </Button>
      {mode === "login" && <Link href="/glomt-losenord">{sv.auth.forgot}</Link>}
      <p role="status" className="form-status">
        {message}
      </p>
    </form>
  );
}
