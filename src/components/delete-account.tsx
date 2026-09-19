"use client";
import { useState } from "react";
import { sv } from "@/i18n/sv";
export function DeleteAccount() {
  const [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setMessage(r.ok ? sv.app.deletionRequested : sv.auth.error);
    } catch {
      setMessage(sv.auth.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        {sv.app.confirmDelete}
      </label>
      <button
        className="button danger"
        disabled={!confirm || busy}
        onClick={request}
      >
        {sv.app.delete}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
