import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ActionLink } from "@/components/ui";
import { LandingMatch } from "@/components/landing-match";
import { sv } from "@/i18n/sv";
import { PLANS, type Plan } from "@/core/entitlements";
export default function Home() {
  const c = sv.editorial;
  return (
    <main id="main" className="editorial-home">
      <section className="editorial-hero container">
        <ArrowUpRight
          className="hero-arrow"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <div className="editorial-intro">
          <p className="editorial-eyebrow">{c.eyebrow}</p>
          <h1>
            {c.first}
            <br />
            <mark>{c.highlight}</mark> {c.last}
          </h1>
          <p className="editorial-lead">
            {c.intro}
            <br />
            {c.introSecond}
          </p>
          <ActionLink href="/kom-igang/" arrow>
            {sv.hero.cta}
          </ActionLink>
          <p className="editorial-note">{c.note}</p>
        </div>
        <div className="editorial-product">
          <LandingMatch />
        </div>
      </section>
      <section id="sa-fungerar-det" className="editorial-dark">
        <div className="dark-heading">
          <h2>{c.darkTitle}</h2>
          <p>{c.darkBody}</p>
        </div>
        <div className="editorial-steps">
          {c.steps.map(([n, title, body]) => (
            <article key={n}>
              <span className="step-number">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <a className="dark-explore" href="/produktvisning/">
          <span>{c.previewLink}</span>
          <ArrowRight aria-hidden="true" />
        </a>
      </section>
      <section className="editorial-close container">
        <h2>{c.closing}</h2>
        <div>
          <p>{c.closingBody}</p>
          <ActionLink href="/kom-igang/" arrow>
            {c.start}
          </ActionLink>
        </div>
      </section>
      <section id="priser" className="section container editorial-pricing">
        <div className="section-heading">
          <p className="editorial-eyebrow">{sv.pricing.eyebrow}</p>
          <h2>{sv.pricing.title}</h2>
        </div>
        <div className="pricing-grid">
          {(Object.keys(PLANS) as Plan[]).map((plan) => (
            <article
              className={`plan ${plan === "pro" ? "featured" : ""}`}
              key={plan}
            >
              <div className="plan-name">
                <h3>{plan[0].toUpperCase() + plan.slice(1)}</h3>
                {plan === "pro" && <span>{sv.pricing.popular}</span>}
              </div>
              <p>{sv.pricing.plans[plan]}</p>
              <div className="price">
                {PLANS[plan].priceSek}
                <span> kr {sv.pricing.month}</span>
              </div>
              <ul>
                <li>
                  {PLANS[plan].deepMatches} {sv.pricing.matches}
                </li>
                <li>
                  {PLANS[plan].tailoredApplications} {sv.pricing.drafts}
                </li>
                {PLANS[plan].browserApplications > 0 && (
                  <li>
                    {PLANS[plan].browserApplications} {sv.pricing.assisted}
                  </li>
                )}
                <li>{sv.pricing.all}</li>
              </ul>
              <ActionLink href="/kom-igang/" secondary={plan !== "pro"}>
                {plan === "free"
                  ? sv.pricing.free
                  : sv.pricing.choose +
                    " " +
                    plan[0].toUpperCase() +
                    plan.slice(1)}
              </ActionLink>
            </article>
          ))}
        </div>
        <p className="pricing-note">{sv.pricing.note}</p>
      </section>
      <section className="editorial-faq container">
        <h2>{c.faqTitle}</h2>
        <div>
          {c.faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
