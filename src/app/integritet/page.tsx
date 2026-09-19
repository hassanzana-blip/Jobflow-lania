import { sv } from "@/i18n/sv";
export default function Privacy() {
  return (
    <main id="main" className="container legal">
      <h1>{sv.privacy.title}</h1>
      <p>{sv.privacy.intro}</p>
      {sv.privacy.sections.map(([h, b]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{b}</p>
        </section>
      ))}
    </main>
  );
}
