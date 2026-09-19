import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { sv } from "@/i18n/sv";
export function Brand() {
  return (
    <Link className="wordmark" href="/" aria-label="JobbFlow">
      JobbFlow
    </Link>
  );
}
export function Button({
  children,
  secondary = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button className={`button ${secondary ? "secondary" : ""}`} {...props}>
      {children}
    </button>
  );
}
export function ActionLink({
  href,
  children,
  secondary = false,
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  arrow?: boolean;
}) {
  return (
    <Link href={href} className={`button ${secondary ? "secondary" : ""}`}>
      {children}
      {arrow && <ArrowRight size={18} aria-hidden="true" />}
    </Link>
  );
}
export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty">
      <div className="empty-line" aria-hidden="true" />
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children}
    </section>
  );
}
export function DemoJobCard({
  interactive = false,
}: {
  interactive?: boolean;
}) {
  return (
    <article className="job-card">
      <div className="job-company">
        <span className="company-fallback" aria-hidden="true">
          EX
        </span>
        <div>
          <p>{sv.demo.company}</p>
          <span>{sv.demo.location}</span>
        </div>
        <span className="example-label">Exempel</span>
      </div>
      <h3>{sv.demo.title}</h3>
      <p className="job-meta">
        {sv.demo.location}
        <span>·</span>
        {sv.demo.style}
        <span>·</span>
        {sv.demo.employment}
      </p>
      <div className="match-line">
        <span className="match-mark" aria-hidden="true" />
        {sv.demo.match}
      </div>
      <ul className="evidence">
        {sv.demo.evidence.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="gap">{sv.demo.gap}</p>
      {interactive ? (
        <ActionLink href="/produktvisning#matchning" secondary>
          {sv.demo.view}
        </ActionLink>
      ) : (
        <p className="card-foot">{sv.demo.notice}</p>
      )}
    </article>
  );
}
