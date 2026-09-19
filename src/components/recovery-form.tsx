"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { sv } from "@/i18n/sv";

type Feedback = { kind: "error" | "info"; text: string };

export function RecoveryForm({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const banner = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!feedback || !banner.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    banner.current.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [feedback]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
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
      if (!response.ok) {
        setFeedback({
          kind: "error",
          text: typeof body.error === "string" ? body.error : sv.auth.error,
        });
        return;
      }
      if (body.redirect) window.location.assign(body.redirect);
      else setFeedback({ kind: "info", text: sv.auth.recoverySent });
    } catch {
      setFeedback({ kind: "error", text: sv.auth.error });
    } finally {
      setBusy(false);
    }
  }
  const failed = feedback?.kind === "error";
  return <form className="form-stack" onSubmit={submit}>
    {email ? <label>{sv.auth.password}<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={failed || undefined} aria-describedby={failed ? "recovery-feedback" : undefined} /><span className="form-hint">{sv.auth.passwordHint}</span></label>
      : <label>{sv.auth.email}<input name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={failed || undefined} aria-describedby={failed ? "recovery-feedback" : undefined} /></label>}
    {/* Above the button, so the answer is visible without scrolling on a phone. */}
    <p id="recovery-feedback" ref={banner} className="form-status form-status-error" role="alert" aria-live="assertive">{failed ? feedback.text : ""}</p>
    <p className="form-status" role="status" aria-live="polite">{feedback?.kind === "info" ? feedback.text : ""}</p>
    <Button disabled={busy}>{busy ? sv.auth.busy : email ? sv.auth.resetButton : sv.auth.recoveryButton}</Button>
  </form>;
}
