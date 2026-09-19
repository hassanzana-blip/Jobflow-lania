"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { sv } from "@/i18n/sv";
import { mobileSv } from "@/i18n/mobile-sv";
type Feedback = {
  kind: "error" | "info";
  text: string;
  field: "email" | "password" | null;
};
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [method, setMethod] = useState<"password" | "magic">("password");
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<Feedback | null>(null);
  const banner = useRef<HTMLParagraphElement>(null);
  // On a phone the submit button sits at the bottom of the viewport, so a
  // message rendered below it is invisible: the form appears to do nothing.
  // The banner sits above the button and is scrolled into view on every answer.
  useEffect(() => {
    if (!feedback || !banner.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    banner.current.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [feedback]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
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
      if (!r.ok) {
        setFeedback({
          kind: "error",
          text: typeof body.error === "string" ? body.error : sv.auth.error,
          field: body.field === "email" || body.field === "password" ? body.field : null,
        });
        return;
      }
      if (body.redirect) window.location.assign(body.redirect);
      else setFeedback({ kind: "info", text: sv.auth.checkEmail, field: null });
    } catch {
      setFeedback({ kind: "error", text: sv.auth.error, field: null });
    } finally {
      setBusy(false);
    }
  }
  const invalid = feedback?.kind === "error" ? feedback.field : null;
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
          aria-invalid={invalid === "email" || undefined}
          aria-describedby={invalid ? "auth-feedback" : undefined}
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
            aria-invalid={invalid === "password" || undefined}
            aria-describedby={invalid ? "auth-feedback" : undefined}
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
      {/* Two regions that are always in the DOM: swapping a live region's
          role after render is unreliable, and assistive technology only
          announces changes inside a region it has been watching. */}
      <p
        id="auth-feedback"
        ref={banner}
        className="form-status form-status-error"
        role="alert"
        aria-live="assertive"
      >
        {feedback?.kind === "error" ? feedback.text : ""}
      </p>
      <p id="auth-status" className="form-status" role="status" aria-live="polite">
        {feedback?.kind === "info" ? feedback.text : ""}
      </p>
      <Button disabled={busy}>
        {busy
          ? sv.auth.busy
          : mode === "signup"
            ? sv.auth.submit
            : sv.auth.login}
      </Button>
      {mode === "login" && <Link href="/glomt-losenord">{sv.auth.forgot}</Link>}
    </form>
  );
}
