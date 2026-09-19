import { sv } from "@/i18n/sv";
export default function Terms() {
  return (
    <main id="main" className="container legal">
      <h1>{sv.terms.title}</h1>
      <p>{sv.terms.body}</p>
    </main>
  );
}
