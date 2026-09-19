import Link from "next/link";
import { sv } from "@/i18n/sv";
import type { CallbackFailure } from "@/core/auth-callback";
const reasons: Record<CallbackFailure, string> = sv.linkError.reasons;
/**
 * A failed e-mail link used to end in a silent redirect to `/logga-in`, which
 * looked like the link had simply done nothing. This page says what happened
 * and offers the way forward for each of the three link kinds.
 */
export default async function LinkError({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).orsak;
  const reason: CallbackFailure =
    typeof raw === "string" && Object.hasOwn(reasons, raw)
      ? (raw as CallbackFailure)
      : "invalid";
  return (
    <main id="main" className="auth-main">
      <h1>{sv.linkError.title}</h1>
      <p className="lead">{reasons[reason]}</p>
      <p className="notice">{sv.linkError.next}</p>
      <p className="inline-links">
        <Link href="/logga-in">{sv.linkError.login}</Link>
        <Link href="/glomt-losenord">{sv.linkError.recovery}</Link>
        <Link href="/kom-igang">{sv.linkError.signup}</Link>
      </p>
    </main>
  );
}
