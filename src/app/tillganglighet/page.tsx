import { sv } from "@/i18n/sv";
export default function Accessibility() {
  return (
    <main id="main" className="container legal">
      <h1>{sv.accessibility.title}</h1>
      <p>{sv.accessibility.body}</p>
    </main>
  );
}
