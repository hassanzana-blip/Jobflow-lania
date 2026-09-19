import Link from "next/link";
import { Check, MapPin, Info, ChevronRight } from "lucide-react";
import { sv } from "@/i18n/sv";
export function LandingMatch() {
  const c = sv.editorial;
  return (
    <Link
      href="/produktvisning/"
      className="landing-match"
      aria-label={c.openExample}
    >
      <p className="match-eyebrow">{sv.demo.label}</p>
      <div className="match-title-row">
        <h2>{sv.demo.title}</h2>
        <ChevronRight size={24} aria-hidden="true" />
      </div>
      <p className="match-location">
        <MapPin size={17} aria-hidden="true" />
        {sv.demo.location} · {sv.demo.style}
      </p>
      <div className="match-evidence">
        <h3>{sv.demo.more}</h3>
        <ul>
          {c.reasons.map((r) => (
            <li key={r}>
              <Check size={18} aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      </div>
      <p className="match-caveat">
        <Info size={16} aria-hidden="true" />
        {c.gap}
      </p>
    </Link>
  );
}
