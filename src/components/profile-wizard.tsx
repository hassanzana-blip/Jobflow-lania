"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { mobileSv as t } from "@/i18n/mobile-sv";
import type { WorkspaceProfile } from "@/core/workspace";
const list = (s: string) => [
  ...new Set(
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
export function ProfileWizard({
  profile,
  mode,
  onSave,
  onSearch,
}: {
  profile: WorkspaceProfile;
  mode: "live" | "demo" | "guest";
  onSave: (p: WorkspaceProfile) => Promise<void>;
  onSearch: () => void;
}) {
  const [occupationIds, setOccupationIds] = useState(
    profile.preferences.occupationIds,
  );
  const [occupations, setOccupations] = useState<
    { id: string; label: string }[]
  >([]);
  const [occupationBusy, setOccupationBusy] = useState(false);
  async function lookupOccupation() {
    setOccupationBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/taxonomy?q=${encodeURIComponent(roles.split(",")[0].trim())}`,
      );
      if (!r.ok) throw new Error(t.error);
      const d = await r.json();
      setOccupations(d.concepts);
      if (!d.concepts.length) setError(t.occupationEmpty);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setOccupationBusy(false);
    }
  }
  const [step, setStep] = useState(0),
    [name, setName] = useState(profile.displayName),
    [city, setCity] = useState(profile.location),
    [facts, setFacts] = useState(profile.facts.map((f) => f.text).join("\n"));
  const [roles, setRoles] = useState(profile.preferences.roles.join(", ")),
    [locations, setLocations] = useState(
      profile.preferences.locations.join(", "),
    ),
    [workStyle, setWorkStyle] = useState(profile.preferences.workStyle),
    [salary, setSalary] = useState(
      profile.preferences.minimumSalary?.toString() ?? "",
    );
  const [excluded, setExcluded] = useState(
      profile.preferences.excludedTitles.join(", "),
    ),
    [excludedCompanies, setExcludedCompanies] = useState(
      profile.preferences.excludedCompanies.join(", "),
    ),
    [languages, setLanguages] = useState(
      profile.preferences.languages.join(", "),
    ),
    [relocate, setRelocate] = useState(profile.preferences.willingToRelocate),
    [employment, setEmployment] = useState(
      profile.preferences.employment[0] ?? "",
    );
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  function move(next: number) {
    setError("");
    if (next > 0 && (!name.trim() || !facts.trim())) {
      setError(t.profileRequired);
      return;
    }
    if (next > 1 && !roles.trim()) {
      setError(t.preferencesRequired);
      return;
    }
    setStep(next);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 2) {
      move(step + 1);
      return;
    }
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...profile,
        displayName: name.trim(),
        location: city.trim(),
        confirmed: true,
        facts: facts
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text, i) => ({
            id: `manual-${i}`,
            kind: "experience",
            text,
            sourceQuote: text,
            confirmed: true,
          })),
        preferences: {
          ...profile.preferences,
          roles: list(roles),
          occupationIds,
          locations: list(locations),
          workStyle,
          minimumSalary: salary ? Number(salary) : null,
          excludedTitles: list(excluded),
          excludedCompanies: list(excludedCompanies),
          languages: list(languages),
          willingToRelocate: relocate,
          employment: employment ? [employment] : [],
        },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="jf-profile-grid">
      <aside className="jf-profile-aside">
        <div className="jf-upload-card">
          <FileText size={30} strokeWidth={1.4} />
          <h2>{t.uploadTitle}</h2>
          <p>{t.uploadBody}</p>
          <span>{t.uploadUnavailable}</span>
          <p>{t.manualEntry}</p>
        </div>
        <div className="jf-profile-trust">
          <ShieldCheck size={24} />
          <p>{t.privacyBody}</p>
        </div>
      </aside>
      <section className="jf-profile-form">
        <ol className="jf-steps" aria-label={t.yourProfile}>
          {t.stepTitles.map((title, index) => (
            <li key={title} aria-current={step === index ? "step" : undefined}>
              <span>{index < step ? <Check size={16} /> : index + 1}</span>
              {title}
            </li>
          ))}
        </ol>
        {saved ? (
          <div className="jf-profile-done">
            <span>
              <Check size={34} />
            </span>
            <h2>{t.profileSaved}</h2>
            <p>{t.confirmed}</p>
            <button className="jf-primary" onClick={onSearch}>
              {t.refresh}
              <ArrowRight size={18} />
            </button>
            <button
              className="jf-text-link"
              onClick={() => {
                setSaved(false);
                setStep(0);
              }}
            >
              {t.edit}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="jf-form">
            {error && (
              <p className="jf-notice jf-error" role="alert">
                {error}
              </p>
            )}
            {step === 0 && (
              <>
                <label className="jf-field">
                  {t.name}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete={mode === "demo" ? "off" : "name"}
                    required
                    maxLength={150}
                  />
                </label>
                <label className="jf-field">
                  {t.city}
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete={mode === "demo" ? "off" : "address-level2"}
                    maxLength={150}
                  />
                </label>
                <label className="jf-field">
                  {t.facts}
                  <textarea
                    rows={7}
                    value={facts}
                    onChange={(e) => setFacts(e.target.value)}
                    required
                    maxLength={15000}
                    placeholder={t.factsPlaceholder}
                  />
                  <small>{t.factsHint}</small>
                </label>
              </>
            )}
            {step === 1 && (
              <>
                <label className="jf-field">
                  {t.roles}
                  <input
                    required
                    value={roles}
                    onChange={(e) => setRoles(e.target.value)}
                    maxLength={800}
                  />
                  <small>{t.rolesHint}</small>
                </label>
                {mode === "live" && (
                  <div className="jf-field">
                    <span>{t.occupationGroup}</span>
                    <small>{t.occupationHint}</small>
                    <button
                      className="jf-secondary"
                      type="button"
                      onClick={() => void lookupOccupation()}
                      disabled={occupationBusy}
                    >
                      {occupationBusy ? t.searching : t.lookupOccupation}
                    </button>
                    {occupations.length > 0 && (
                      <select
                        aria-label={t.occupationGroup}
                        value={occupationIds[0] ?? ""}
                        onChange={(e) =>
                          setOccupationIds(
                            e.target.value ? [e.target.value] : [],
                          )
                        }
                      >
                        <option value="">{t.noOccupation}</option>
                        {occupations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <label className="jf-field">
                  {t.locations}
                  <input
                    value={locations}
                    onChange={(e) => setLocations(e.target.value)}
                    maxLength={800}
                  />
                </label>
                <div className="jf-field-grid">
                  <label className="jf-field">
                    {t.workStyle}
                    <select
                      value={workStyle}
                      onChange={(e) =>
                        setWorkStyle(e.target.value as typeof workStyle)
                      }
                    >
                      {(["any", "hybrid", "remote", "onsite"] as const).map(
                        (s) => (
                          <option value={s} key={s}>
                            {t.workStyles[s]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="jf-field">
                    {t.employment}
                    <select
                      value={employment}
                      onChange={(e) => setEmployment(e.target.value)}
                    >
                      <option value="">{t.employmentOptions.any}</option>
                      <option>{t.employmentOptions.full}</option>
                      <option>{t.employmentOptions.part}</option>
                    </select>
                  </label>
                </div>
                <label className="jf-field">
                  {t.minimumSalary}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000000}
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder={t.salaryPlaceholder}
                  />
                </label>
                <label className="jf-field">
                  {t.languages}
                  <input
                    value={languages}
                    onChange={(e) => setLanguages(e.target.value)}
                    maxLength={800}
                  />
                </label>
                <details className="jf-more-preferences">
                  <summary>{t.excluded}</summary>
                  <label className="jf-field">
                    {t.excluded}
                    <input
                      value={excluded}
                      onChange={(e) => setExcluded(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                  <label className="jf-field">
                    {t.excludedCompanies}
                    <input
                      value={excludedCompanies}
                      onChange={(e) => setExcludedCompanies(e.target.value)}
                      maxLength={1000}
                    />
                  </label>
                </details>
                <label className="jf-checkbox">
                  <input
                    type="checkbox"
                    checked={relocate}
                    onChange={(e) => setRelocate(e.target.checked)}
                  />
                  {t.relocate}
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <div className="jf-review-profile">
                  <h2>{name}</h2>
                  <p>{city}</p>
                  <h3>{t.yourProfile}</h3>
                  {facts
                    .split("\n")
                    .filter(Boolean)
                    .map((f, i) => (
                      <p key={i}>{f}</p>
                    ))}
                  <h3>{t.yourPreferences}</h3>
                  <p>{roles}</p>
                  <p>
                    {locations} · {t.workStyles[workStyle]}
                  </p>
                  {salary && <p>{salary} SEK</p>}
                  <p>{languages}</p>
                </div>
                <label className="jf-checkbox">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {t.confirmCheck}
                </label>
              </>
            )}
            <div className="jf-wizard-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="jf-icon"
                  aria-label={t.previous}
                  onClick={() => move(step - 1)}
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <button
                className="jf-primary"
                disabled={busy || (step === 2 && !confirmed)}
              >
                {busy ? t.busy : step === 2 ? t.confirmProfile : t.next}
                {step === 2 ? <Check size={19} /> : <ArrowRight size={19} />}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
