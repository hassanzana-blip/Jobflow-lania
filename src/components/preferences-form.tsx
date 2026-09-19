"use client";
import { useState } from "react";
import { Button } from "./ui";
import { sv } from "@/i18n/sv";
export function PreferencesForm({
  initial,
}: {
  initial: { roles?: string[]; locations?: string[]; work_style?: string };
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const d = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: String(d.get("roles"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          locations: String(d.get("locations"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          workStyle: d.get("workStyle"),
        }),
      });
      setMessage(r.ok ? sv.app.savedMessage : sv.auth.error);
    } catch {
      setMessage(sv.auth.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={save}>
      <label>
        {sv.app.role}
        <input
          name="roles"
          defaultValue={initial.roles?.join(", ")}
          required
          maxLength={500}
        />
      </label>
      <label>
        {sv.app.location}
        <input
          name="locations"
          defaultValue={initial.locations?.join(", ")}
          maxLength={500}
        />
      </label>
      <label>
        {sv.app.workStyle}
        <select name="workStyle" defaultValue={initial.work_style ?? "any"}>
          <option value="any">{sv.app.any}</option>
          <option value="remote">{sv.app.remote}</option>
          <option value="hybrid">{sv.app.hybrid}</option>
          <option value="onsite">{sv.app.onsite}</option>
        </select>
      </label>
      <Button disabled={busy}>{busy ? sv.auth.busy : sv.app.save}</Button>
      <p role="status">{message}</p>
    </form>
  );
}
