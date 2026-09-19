"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileText,
  Home,
  MapPin,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { mobileSv as t } from "@/i18n/mobile-sv";
import { demoWorkspace } from "@/core/demo-workspace";
import {
  filterWorkspaceJobs,
  initials,
  isExpired,
  type Application,
  type ApplicationStatus,
  type WorkspaceData,
  type WorkspaceJob,
  type WorkspaceProfile,
} from "@/core/workspace";
import { searchUrlQuery, type WorkStyle } from "@/core/search-params";
import { ProfileWizard } from "./profile-wizard";
import { DeleteAccount } from "./delete-account";

type View = "home" | "saved" | "applications" | "profile";
type Mode = "live" | "demo" | "guest";
const navigation = [
  { id: "home", label: t.forYou, icon: Home },
  { id: "saved", label: t.saved, icon: Bookmark },
  { id: "applications", label: t.applications, icon: BriefcaseBusiness },
  { id: "profile", label: t.profile, icon: UserRound },
] as const;
export async function api<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(typeof data.error === "string" ? data.error : t.error);
  return data;
}
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="jf-overlay" />
        <Dialog.Content
          className={`jf-sheet ${wide ? "jf-sheet-wide" : ""}`}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            else document.querySelector<HTMLElement>("#main h1")?.focus();
          }}
        >
          <div className="jf-sheet-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="jf-icon" aria-label={t.close}>
              <X size={22} />
            </Dialog.Close>
          </div>
          <div className="jf-sheet-content">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function MobileWorkspace({
  initial,
  mode = "live",
  initialView = "home",
  initialQuery = "",
  initialWorkStyle = "any",
  urlSync = false,
}: {
  initial: WorkspaceData;
  mode?: Mode;
  initialView?: View;
  /** Search state the page read out of the URL; see `core/search-params`. */
  initialQuery?: string;
  initialWorkStyle?: WorkStyle;
  /** Write the search state back into the URL (public job search only). */
  urlSync?: boolean;
}) {
  const router = useRouter(),
    pathname = usePathname();
  const [data, setData] = useState(initial),
    [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState(initialQuery),
    [workStyle, setWorkStyle] = useState<string>(initialWorkStyle),
    [searched, setSearched] = useState(initialQuery),
    [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [application, setApplication] = useState<string | null>(null),
    [settings, setSettings] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [undoId, setUndoId] = useState<string | null>(null),
    [statusFilter, setStatusFilter] = useState("all");
  const heading = useRef<HTMLHeadingElement>(null),
    actionLock = useRef(false);
  const selectedJob = data.jobs.find((j) => j.id === selected),
    selectedApplication = data.applications.find((a) => a.id === application);
  const filtered = filterWorkspaceJobs(data.jobs, {
    savedOnly: view === "saved",
    saved: data.saved,
    dismissed: data.dismissed,
    query: mode === "guest" ? "" : query,
    workStyle,
  });
  // The URL follows the *committed* search, not every keystroke, and uses
  // replace so the back button still leaves the page instead of stepping
  // through a history entry per search.
  useEffect(() => {
    if (!urlSync) return;
    const search = searchUrlQuery(searched, workStyle);
    const next = search ? `${pathname}?${search}` : pathname;
    if (next !== window.location.pathname + window.location.search)
      router.replace(next, { scroll: false });
  }, [urlSync, searched, workStyle, pathname, router]);
  async function run(key: string, action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }
  function changeView(next: View) {
    setView(next);
    setMessage("");
    setError("");
    setUndoId(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  }
  async function jobAction(
    job: WorkspaceJob,
    action: "save" | "unsave" | "dismiss" | "restore",
  ) {
    if (mode === "guest") {
      setError(t.accountRequired);
      return;
    }
    await run(job.id, async () => {
      if (mode === "live")
        await api("/api/jobs/actions", "POST", { jobId: job.id, action });
      setData((d) => ({
        ...d,
        saved:
          action === "save"
            ? [...new Set([...d.saved, job.id])]
            : action === "unsave"
              ? d.saved.filter((id) => id !== job.id)
              : d.saved,
        dismissed:
          action === "dismiss"
            ? [...new Set([...d.dismissed, job.id])]
            : action === "restore"
              ? d.dismissed.filter((id) => id !== job.id)
              : d.dismissed,
      }));
      setMessage(
        action === "save"
          ? t.savedToast
          : action === "unsave"
            ? t.unsavedToast
            : action === "dismiss"
              ? t.dismissedToast
              : t.restored,
      );
      setUndoId(action === "dismiss" ? job.id : null);
      if (action === "dismiss") setSelected(null);
    });
  }
  async function searchJobs() {
    if (mode === "demo") {
      setWorkStyle("any");
      setMessage(t.demoHint);
      return;
    }
    setSearched(query.trim());
    await run("search", async () => {
      const result =
        mode === "guest"
          ? await api<{
              jobs: WorkspaceJob[];
              sources: WorkspaceData["sources"];
              lastSearchAt: string;
            }>(`/api/discover?q=${encodeURIComponent(query)}`, "GET")
          : await api<{
              jobs: WorkspaceJob[];
              sources: WorkspaceData["sources"];
              lastSearchAt: string;
              analysis?: WorkspaceData["analysis"];
            }>("/api/search", "POST", { query });
      setData((d) => ({
        ...d,
        ...result,
        jobs: [
          ...result.jobs,
          ...d.jobs.filter(
            (j) =>
              !result.jobs.some((n) => n.id === j.id) &&
              (d.saved.includes(j.id) ||
                d.applications.some((a) => a.jobId === j.id)),
          ),
        ],
      }));
      setMessage(t.searchDone);
    });
  }
  async function prepare(job: WorkspaceJob) {
    if (mode === "guest") {
      setError(t.accountRequired);
      return;
    }
    if (!data.profile.confirmed) {
      setSelected(null);
      changeView("profile");
      setError(t.profileNeeded);
      return;
    }
    const existing = data.applications.find((a) => a.jobId === job.id);
    if (existing) {
      setSelected(null);
      setApplication(existing.id);
      return;
    }
    await run("prepare", async () => {
      const next =
        mode === "demo"
          ? {
              id: `example-app-${job.id}`,
              jobId: job.id,
              status: "preparing" as const,
              notes: "",
              interviewAt: null,
              followUpAt: null,
              updatedAt: new Date().toISOString(),
              documentId: null,
              draftText: data.profile.facts.map((f) => f.text).join("\n\n"),
              reviewed: false,
            }
          : await api<Application>("/api/applications", "POST", {
              jobId: job.id,
            });
      setData((d) => ({ ...d, applications: [next, ...d.applications] }));
      setSelected(null);
      setApplication(next.id);
    });
  }
  async function saveProfile(profile: WorkspaceProfile, extractionId?: string) {
    if (mode === "guest") throw new Error(t.accountRequired);
    let version = profile.version;
    if (mode === "live") {
      const result = await api<{ version: number }>("/api/profile", "PUT", {
        displayName: profile.displayName,
        location: profile.location,
        expectedVersion: profile.version,
        confirmed: true,
        facts: profile.facts,
        preferences: profile.preferences,
        // Present only when these facts came from reviewing a CV; the server
        // uses it to recover each quote it verified against that document.
        ...(extractionId ? { extractionId } : {}),
      });
      version = result.version;
    }
    setData((d) => ({
      ...d,
      profile: { ...profile, version, confirmed: true },
    }));
    setMessage(mode === "demo" ? t.demoProfileSaved : t.profileSaved);
  }
  const title =
    view === "home"
      ? mode === "guest"
        ? t.homeGuest
        : t.homeTitle
      : view === "saved"
        ? t.savedTitle
        : view === "applications"
          ? t.trackerTitle
          : t.profileTitle;
  const body =
    view === "home"
      ? mode === "guest"
        ? t.homeGuestBody
        : t.homeBody
      : view === "saved"
        ? t.savedBody
        : view === "applications"
          ? t.trackerBody
          : t.profileBody;
  return (
    <div className="jf-app">
      {mode === "demo" && (
        <div className="jf-demo">
          <span>
            <strong>{t.demo}</strong>
            <span>{t.demoHint}</span>
          </span>
          <Link href="/" aria-label={t.leaveDemo}>
            <ArrowUpRight size={20} />
          </Link>
        </div>
      )}
      <aside className="jf-desktop-nav">
        <Link className="jf-wordmark" href="/">
          {t.brand}
          <span>↗</span>
        </Link>
        <nav aria-label={t.brand}>
          {navigation.map((n) => (
            <button
              key={n.id}
              onClick={() => changeView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={21} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="jf-sidebar-bottom">
          <ShieldCheck size={22} />
          <p>{t.privacyLine}</p>
          <span>{t.privacyBody}</span>
          <button onClick={() => setSettings(true)}>
            <Settings2 size={19} />
            {t.settings}
          </button>
        </div>
      </aside>
      <div className="jf-body">
        <header className="jf-topbar">
          <Link className="jf-wordmark" href="/">
            {t.brand}
            <span>↗</span>
          </Link>
          <div className="jf-topbar-right">
            <span>
              {data.profile.displayName
                ? `${t.hello}, ${data.profile.displayName.split(" ")[0]}`
                : t.brand}
            </span>
            <button
              className="jf-avatar"
              aria-label={t.settings}
              onClick={() => setSettings(true)}
            >
              {initials(data.profile.displayName)}
            </button>
          </div>
        </header>
        <main id="main" className="jf-main">
          <div className="jf-page-heading">
            <div>
              <p className="jf-eyebrow">
                {view === "home"
                  ? t.forYou
                  : navigation.find((n) => n.id === view)?.label}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              <p className="jf-intro">{body}</p>
            </div>
            {view === "home" && (
              <div className="jf-heading-note">
                <span className="jf-step-dot">
                  <ArrowUpRight size={28} />
                </span>
                <p>
                  {t.privacyLine}
                  <span>{t.privacyBody}</span>
                </p>
              </div>
            )}
          </div>
          {error && (
            <div className="jf-notice jf-error" role="alert">
              {error}
              {mode === "guest" && (
                <Link href="/kom-igang">
                  {t.createAccount} <ArrowRight size={16} />
                </Link>
              )}
            </div>
          )}
          {(view === "home" || view === "saved") && (
            <>
              {view === "home" &&
                !data.profile.confirmed &&
                mode !== "guest" && (
                  <section className="jf-setup">
                    <div>
                      <h2>{t.setupTitle}</h2>
                      <p>{t.setupBody}</p>
                    </div>
                    <button
                      className="jf-primary"
                      onClick={() => changeView("profile")}
                    >
                      {t.setupAction}
                      <ArrowRight size={19} />
                    </button>
                  </section>
                )}
              <div className="jf-search-row">
                <form
                  className="jf-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void searchJobs();
                  }}
                >
                  <Search size={21} aria-hidden="true" />
                  <input
                    aria-label={t.searchLabel}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    maxLength={200}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  <button
                    type="submit"
                    aria-label={t.search}
                    disabled={busy === "search"}
                  >
                    <ArrowRight size={20} />
                  </button>
                </form>
                <button
                  className="jf-icon jf-filter"
                  onClick={() => setFilterOpen(true)}
                  aria-label={t.filters}
                >
                  <SlidersHorizontal size={22} />
                </button>
              </div>
              <div className="jf-filter-row" aria-label={t.workStyle}>
                {(["any", "hybrid", "remote", "onsite"] as const).map(
                  (style) => (
                    <button
                      key={style}
                      onClick={() => setWorkStyle(style)}
                      aria-pressed={workStyle === style}
                    >
                      {style === "any" ? t.all : t.workStyles[style]}
                    </button>
                  ),
                )}
              </div>
              <div className="jf-section-heading">
                <h2>{view === "saved" ? t.savedHeading : t.resultHeading}</h2>
                <span>
                  {filtered.length} {t.results}
                </span>
              </div>
              {data.sources.some((s) => s.status !== "ok") && (
                <p className="jf-source-notice">{t.partial}</p>
              )}
              {/* How much of this result was actually looked at closely. A
                  score on six jobs out of forty is not a ranked list of forty,
                  and saying so is cheaper than letting it be assumed. */}
              {mode === "live" && data.analysis && view === "home" && (
                <p className="jf-source-notice">
                  {data.analysis.analysed} {t.of} {data.analysis.retained}{" "}
                  {t.deepAnalysed}.
                  {data.analysis.quotaExhausted ? ` ${t.analysisQuotaSpent}` : ""}
                  {!data.profile.confirmed ? ` ${t.analysisNeedsProfile}` : ""}
                </p>
              )}
              <div className="jf-job-grid">
                {filtered.map((job, index) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    featured={index === 0 && view === "home"}
                    saved={data.saved.includes(job.id)}
                    busy={busy === job.id}
                    onOpen={() => setSelected(job.id)}
                    onSave={() =>
                      void jobAction(
                        job,
                        data.saved.includes(job.id) ? "unsave" : "save",
                      )
                    }
                  />
                ))}
              </div>
              {!filtered.length && (
                <Empty
                  icon={Bookmark}
                  title={view === "saved" ? t.savedEmpty : t.emptyTitle}
                  body={view === "saved" ? t.savedEmptyBody : t.emptyBody}
                >
                  <button
                    className="jf-primary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      view === "saved" ? changeView("home") : void searchJobs()
                    }
                  >
                    {view === "saved"
                      ? t.browse
                      : busy === "search"
                        ? t.searching
                        : t.refresh}
                    <ArrowRight size={19} />
                  </button>
                </Empty>
              )}
              {view === "home" && filtered.length > 0 && mode !== "demo" && (
                <button
                  className="jf-secondary jf-refresh"
                  onClick={() => void searchJobs()}
                  disabled={Boolean(busy)}
                >
                  {busy === "search" ? t.searching : t.refresh}
                  <ArrowRight size={18} />
                </button>
              )}
              <div className="jf-trust">
                <ShieldCheck size={20} />
                <div>
                  <strong>{t.privacyLine}</strong>
                  <p>{t.privacyBody}</p>
                  {data.lastSearchAt && (
                    <small>
                      {t.lastSearch}: {formatDate(data.lastSearchAt)}
                    </small>
                  )}
                </div>
              </div>
            </>
          )}
          {view === "applications" && (
            <>
              <div className="jf-filter-row" aria-label={t.statusLabel}>
                {(["all", "preparing", "applied", "interview"] as const).map(
                  (s) => (
                    <button
                      key={s}
                      aria-pressed={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "all" ? t.all : t.status[s]}
                    </button>
                  ),
                )}
              </div>
              <div className="jf-application-list">
                {data.applications
                  .filter(
                    (a) => statusFilter === "all" || a.status === statusFilter,
                  )
                  .map((a) => {
                    const job = data.jobs.find((j) => j.id === a.jobId);
                    if (!job) return null;
                    return (
                      <button
                        key={a.id}
                        className="jf-application-row"
                        onClick={() => setApplication(a.id)}
                      >
                        <span className="jf-company-mark">
                          {initials(job.employer ?? "")}
                        </span>
                        <span className="jf-application-info">
                          <span className="jf-company-name">
                            {job.employer}
                          </span>
                          <strong>{job.title}</strong>
                          <span className="jf-application-meta">
                            {t.status[a.status]}
                            {a.interviewAt
                              ? ` · ${formatDate(a.interviewAt)}`
                              : a.followUpAt
                                ? ` · ${t.followUp}: ${formatDate(a.followUpAt)}`
                                : ""}
                          </span>
                        </span>
                        <ChevronRight size={21} />
                      </button>
                    );
                  })}
              </div>
              {!data.applications.filter(
                (a) => statusFilter === "all" || a.status === statusFilter,
              ).length && (
                <Empty
                  icon={BriefcaseBusiness}
                  title={t.trackerEmpty}
                  body={t.trackerEmptyBody}
                >
                  <button
                    className="jf-primary"
                    onClick={() => changeView("home")}
                  >
                    {t.browse}
                    <ArrowRight size={18} />
                  </button>
                </Empty>
              )}
            </>
          )}
          {view === "profile" && (
            <ProfileWizard
              profile={data.profile}
              mode={mode}
              capabilities={data.capabilities}
              onSave={saveProfile}
              onSearch={() => {
                changeView("home");
                void searchJobs();
              }}
            />
          )}
        </main>
      </div>
      <nav className="jf-bottom-nav" aria-label={t.brand}>
        {navigation.map((n) => (
          <button
            key={n.id}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => changeView(n.id)}
          >
            <n.icon size={22} strokeWidth={1.8} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {message && (
        <div className="jf-toast" role="status">
          <Check size={18} />
          <span>{message}</span>
          {undoId && (
            <button
              onClick={() => {
                const job = data.jobs.find((j) => j.id === undoId);
                if (job) void jobAction(job, "restore");
              }}
            >
              {t.undo}
            </button>
          )}
          <button aria-label={t.close} onClick={() => setMessage("")}>
            <X size={18} />
          </button>
        </div>
      )}
      <Sheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title={t.filterTitle}
        description={t.filterDescription}
      >
        <fieldset className="jf-radio-list">
          <legend>{t.workStyle}</legend>
          {(["any", "hybrid", "remote", "onsite"] as const).map((style) => (
            <label key={style}>
              <input
                type="radio"
                name="workStyle"
                checked={workStyle === style}
                onChange={() => setWorkStyle(style)}
              />
              {t.workStyles[style]}
            </label>
          ))}
        </fieldset>
        <button
          className="jf-primary jf-full"
          onClick={() => setFilterOpen(false)}
        >
          {t.showResults}
          <ArrowRight size={19} />
        </button>
      </Sheet>
      <Sheet
        open={Boolean(selectedJob)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selectedJob?.title ?? t.openJob}
        description={selectedJob?.employer ?? t.employerUnknown}
        wide
      >
        {selectedJob && (
          <div className="jf-detail">
            <div className="jf-detail-hero">
              <span className="jf-company-mark">
                {initials(selectedJob.employer ?? "")}
              </span>
              <p>
                {selectedJob.location ?? t.locationUnknown} ·{" "}
                {t.workStyles[selectedJob.workStyle]}
              </p>
              <div className="jf-detail-facts">
                <span>{selectedJob.employment ?? t.employmentUnknown}</span>
                <span>
                  {selectedJob.deadline
                    ? `${t.deadline}: ${formatDate(selectedJob.deadline)}`
                    : t.unknownDeadline}
                </span>
              </div>
            </div>
            <div className="jf-detail-columns">
              <div className="jf-insight">
                <p className="jf-eyebrow">
                  {selectedJob.matchKind === "example"
                    ? t.exampleMatch
                    : t.retrieved}
                </p>
                <h3>{t.fitTitle}</h3>
                {selectedJob.reasons.length ? (
                  <ul>
                    {selectedJob.reasons.map((r) => (
                      <li key={r}>
                        <Check size={18} />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t.noScore}</p>
                )}
                {selectedJob.gaps.length > 0 && (
                  <>
                    <h3>{t.gapsTitle}</h3>
                    {selectedJob.gaps.map((g) => (
                      <p key={g}>{g}</p>
                    ))}
                  </>
                )}
              </div>
              <section className="jf-job-description">
                <h3>{t.aboutJob}</h3>
                {selectedJob.descriptionCompleteness === "excerpt" && (
                  <p className="jf-excerpt">{t.excerpt}</p>
                )}
                <p>{selectedJob.description}</p>
                {mode !== "demo" && (
                  <p className="jf-source">
                    {t.source}: {t.sourceNames[selectedJob.source]} ·{" "}
                    {t.published}: {formatDate(selectedJob.publishedAt)}
                  </p>
                )}
              </section>
            </div>
            {error && (
              <p className="jf-notice jf-error" role="alert">
                {error}
              </p>
            )}
            <div className="jf-detail-actions">
              <button
                className="jf-primary"
                disabled={Boolean(busy) || isExpired(selectedJob)}
                onClick={() => void prepare(selectedJob)}
              >
                {isExpired(selectedJob)
                  ? t.expired
                  : busy === "prepare"
                    ? t.preparing
                    : t.prepare}
                <ArrowRight size={19} />
              </button>
              <button
                className="jf-secondary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void jobAction(
                    selectedJob,
                    data.saved.includes(selectedJob.id) ? "unsave" : "save",
                  )
                }
              >
                <Bookmark size={18} />
                {data.saved.includes(selectedJob.id) ? t.unsave : t.save}
              </button>
              <p>{t.prepareHint}</p>
              {mode !== "demo" && (
                <a
                  className="jf-text-link"
                  href={selectedJob.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.original}
                  <ArrowUpRight size={17} />
                </a>
              )}
              <button
                className="jf-text-link"
                onClick={() => void jobAction(selectedJob, "dismiss")}
                disabled={Boolean(busy)}
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet
        open={Boolean(selectedApplication)}
        onOpenChange={(open) => {
          if (!open) setApplication(null);
        }}
        title={t.applicationTitle}
        description={t.applicationDescription}
        wide
      >
        {selectedApplication && (
          <ApplicationEditor
            key={selectedApplication.id}
            application={selectedApplication}
            job={data.jobs.find((j) => j.id === selectedApplication.jobId)!}
            profile={data.profile}
            mode={mode}
            ai={data.capabilities.ai}
            onUpdate={(next) => {
              setData((d) => ({
                ...d,
                applications: d.applications.map((a) =>
                  a.id === next.id ? next : a,
                ),
              }));
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={settings}
        onOpenChange={setSettings}
        title={t.settings}
        description={t.notificationTitle}
      >
        <section className="jf-settings-section">
          <h3>{t.account}</h3>
          <p>{data.profile.displayName}</p>
          {mode === "live" ? (
            <button
              className="jf-secondary"
              onClick={() =>
                void run("logout", async () => {
                  await api("/api/auth/logout", "POST");
                  window.location.assign("/");
                })
              }
            >
              {t.logout}
            </button>
          ) : (
            <Link className="jf-primary" href="/kom-igang">
              {t.createAccount}
              <ArrowRight size={18} />
            </Link>
          )}
        </section>
        <section className="jf-settings-section">
          <h3>{t.notifications}</h3>
          <p>{t.notificationBody}</p>
          <label className="jf-checkbox">
            <input
              type="checkbox"
              checked={data.notifications}
              disabled={Boolean(busy) || mode === "guest"}
              onChange={(e) => {
                const next = e.target.checked;
                void run("notifications", async () => {
                  if (mode === "live")
                    await api("/api/notifications", "PATCH", { enabled: next });
                  setData((d) => ({ ...d, notifications: next }));
                  setMessage(t.notificationsSaved);
                });
              }}
            />
            {t.notifications}
          </label>
        </section>
        <section className="jf-settings-section">
          <h3>{t.install}</h3>
          <p>{t.installBody}</p>
        </section>
        <section className="jf-settings-section">
          <h3>{t.data}</h3>
          {mode === "live" && (
            <a className="jf-text-link" href="/api/account/export">
              <ArrowDownToLine size={18} />
              {t.export}
            </a>
          )}
          <Link className="jf-text-link" href="/integritet">
            {t.privacy}
            <ArrowUpRight size={17} />
          </Link>
          {mode === "live" && data.capabilities.deletion && <DeleteAccount />}
          {mode === "demo" && (
            <button
              className="jf-secondary"
              onClick={() => {
                setData(demoWorkspace());
                setSettings(false);
              }}
            >
              {t.resetDemo}
            </button>
          )}
        </section>
      </Sheet>
    </div>
  );
}
function JobCard({
  job,
  featured,
  saved,
  busy,
  onOpen,
  onSave,
}: {
  job: WorkspaceJob;
  featured: boolean;
  saved: boolean;
  busy: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article className={`jf-job-card ${featured ? "jf-job-featured" : ""}`}>
      <div className="jf-job-top">
        <span className="jf-company-mark">{initials(job.employer ?? "")}</span>
        <span className="jf-company-name">
          {job.employer ?? t.employerUnknown}
        </span>
        <button
          className="jf-bookmark"
          onClick={onSave}
          aria-label={saved ? t.unsave : t.save}
          aria-pressed={saved}
          disabled={busy}
        >
          <Bookmark size={22} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <h3>
        <button onClick={onOpen}>{job.title}</button>
      </h3>
      <p className="jf-job-location">
        <MapPin size={16} />
        {job.location ?? t.locationUnknown}
        <span>·</span>
        {t.workStyles[job.workStyle]}
      </p>
      <div className="jf-job-evidence">
        <span className="jf-fit-label">
          {job.matchKind === "example"
            ? t.exampleMatch
            : job.score !== null
              ? `${job.score}% · ${t.analysed}`
              : t.retrieved}
        </span>
        {job.reasons.length ? (
          <ul>
            {job.reasons.slice(0, 2).map((r) => (
              <li key={r}>
                <Check size={15} />
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p>{job.employment ?? t.employmentUnknown}</p>
        )}
      </div>
      <div className="jf-job-bottom">
        <span>
          {isExpired(job)
            ? t.expired
            : job.matchKind === "example"
              ? t.demo
              : t.sourceNames[job.source]}
        </span>
        <button onClick={onOpen}>
          {t.openJob}
          <ArrowUpRight size={22} />
        </button>
      </div>
    </article>
  );
}
function Empty({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Home;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="jf-empty">
      <span>
        <Icon size={32} strokeWidth={1.5} />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}
function dateInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function ApplicationEditor({
  application,
  job,
  profile,
  mode,
  ai,
  onUpdate,
}: {
  application: Application;
  job: WorkspaceJob;
  profile: WorkspaceProfile;
  mode: Mode;
  ai: boolean;
  onUpdate: (a: Application) => void;
}) {
  const [draft, setDraft] = useState(application.draftText ?? ""),
    [reviewed, setReviewed] = useState(application.reviewed),
    [compare, setCompare] = useState(false),
    [status, setStatus] = useState(application.status),
    [notes, setNotes] = useState(application.notes),
    [interviewAt, setInterviewAt] = useState(
      dateInput(application.interviewAt),
    ),
    [followUpAt, setFollowUpAt] = useState(dateInput(application.followUpAt));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    await perform(async () => {
      const result =
        mode === "demo"
          ? {
              text: profile.facts.map((f) => f.text).join("\n\n"),
              documentId: "example-document",
            }
          : await api<{ text: string; documentId: string }>(
              "/api/applications/draft",
              "POST",
              { applicationId: application.id },
            );
      setDraft(result.text);
      setReviewed(false);
      onUpdate({
        ...application,
        draftText: result.text,
        documentId: result.documentId,
        reviewed: false,
      });
    });
  }
  async function saveDraft() {
    await perform(async () => {
      let documentId = application.documentId;
      if (mode === "live")
        documentId = (
          await api<{ documentId: string }>(
            "/api/applications/draft",
            "PATCH",
            {
              applicationId: application.id,
              expectedDocumentId: application.documentId,
              text: draft,
              reviewed: true,
            },
          )
        ).documentId;
      onUpdate({
        ...application,
        documentId,
        draftText: draft,
        reviewed: true,
      });
      setMessage(t.draftSaved);
    });
  }
  function downloadExample() {
    const url = URL.createObjectURL(
      new Blob(
        [`${t.demo}\n\n${profile.displayName}\n${job.title}\n\n${draft}`],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "JobbFlow-exempel.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveStatus(e: React.FormEvent) {
    e.preventDefault();
    await perform(async () => {
      const patch = {
        id: application.id,
        status,
        notes,
        interviewAt: interviewAt ? new Date(interviewAt).toISOString() : null,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        expectedUpdatedAt: application.updatedAt,
      };
      const result =
        mode === "live"
          ? await api<{ updatedAt: string }>(
              "/api/applications",
              "PATCH",
              patch,
            )
          : { updatedAt: new Date().toISOString() };
      onUpdate({ ...application, ...patch, updatedAt: result.updatedAt });
      setMessage(t.applicationSaved);
    });
  }
  return (
    <div className="jf-editor">
      <div className="jf-editor-job">
        <span className="jf-company-mark">{initials(job.employer ?? "")}</span>
        <div>
          <span>{job.employer}</span>
          <h3>{job.title}</h3>
        </div>
      </div>
      {error && (
        <p role="alert" className="jf-notice jf-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="jf-notice">
          {message}
        </p>
      )}
      <section className="jf-document-editor">
        <div className="jf-section-heading">
          <h3>{t.document}</h3>
          <FileText size={23} />
        </div>
        <p>{ai ? t.draftAI : t.draftManual}</p>
        {draft ? (
          <>
            <button
              type="button"
              className="jf-text-link"
              aria-expanded={compare}
              onClick={() => setCompare(!compare)}
            >
              {t.compare}
              <ChevronRight size={17} />
            </button>
            {compare && (
              <div className="jf-original">
                <h4>{t.originalProfile}</h4>
                {profile.facts.map((f) => (
                  <p key={f.id}>{f.text}</p>
                ))}
              </div>
            )}
            <label className="jf-field">
              {t.draftLabel}
              <textarea
                rows={10}
                value={draft}
                maxLength={30000}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setReviewed(false);
                }}
              />
            </label>
            <label className="jf-checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              {t.reviewed}
            </label>
            <div className="jf-edit-actions">
              <button
                className="jf-primary"
                disabled={!reviewed || busy || !draft.trim()}
                onClick={() => void saveDraft()}
              >
                {busy ? t.busy : t.saveDraft}
                <Check size={18} />
              </button>
              {mode === "demo" ? (
                <button
                  className="jf-secondary"
                  disabled={
                    !application.reviewed || draft !== application.draftText
                  }
                  onClick={downloadExample}
                >
                  <ArrowDownToLine size={18} />
                  {t.demoDownload}
                </button>
              ) : (
                application.reviewed &&
                draft === application.draftText && (
                  <a
                    className="jf-secondary"
                    href={`/api/applications/pdf?id=${encodeURIComponent(application.id)}`}
                  >
                    <ArrowDownToLine size={18} />
                    {t.download}
                  </a>
                )
              )}
            </div>
          </>
        ) : (
          <>
            <p>{t.noDraft}</p>
            <button
              className="jf-primary"
              onClick={() => void generate()}
              disabled={busy}
            >
              {busy ? t.preparing : t.generateDraft}
              <ArrowRight size={18} />
            </button>
          </>
        )}
      </section>
      <form className="jf-form" onSubmit={saveStatus}>
        {/* The hint is described-by, not part of the label: a <small> inside a
            wrapping <label> becomes part of the control's accessible name, so
            a screen reader announced the whole sentence as the field's name. */}
        <div className="jf-field">
          <label htmlFor="application-status">{t.statusLabel}</label>
          <select
            id="application-status"
            aria-describedby="application-status-hint"
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
          >
            {Object.entries(t.status).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <small id="application-status-hint">{t.markAppliedHint}</small>
        </div>
        <label className="jf-field">
          {t.notes}
          <textarea
            rows={3}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
          />
        </label>
        <div className="jf-field-grid">
          <label className="jf-field">
            {t.interview}
            <input
              type="datetime-local"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
            />
          </label>
          <label className="jf-field">
            {t.followUp}
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
            />
          </label>
        </div>
        <p className="jf-small">{t.reminderHint}</p>
        <button className="jf-primary" disabled={busy}>
          {busy ? t.busy : t.updateApplication}
          <Check size={18} />
        </button>
      </form>
      {mode !== "demo" && (
        <a
          className="jf-text-link"
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.original}
          <ArrowUpRight size={18} />
        </a>
      )}
    </div>
  );
}
