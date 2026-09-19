import { authConfigured } from "@/server/supabase";
import { AuthForm } from "@/components/auth-form";
import { ActionLink } from "@/components/ui";
import { sv } from "@/i18n/sv";
import Link from "next/link";
export default function Signup() {
  return (
    <main id="main" className="auth-main">
      <p className="eyebrow">{sv.nav.start}</p>
      <h1>{sv.auth.title}</h1>
      <p className="lead">{sv.auth.body}</p>
      {authConfigured() ? (
        <AuthForm mode="signup" />
      ) : (
        <>
          <div className="notice">{sv.auth.unavailable}</div>
          <ActionLink href="/produktvisning" arrow>
            {sv.auth.preview}
          </ActionLink>
        </>
      )}
      <p className="auth-switch">
        {sv.auth.haveAccount} <Link href="/logga-in">{sv.auth.login}</Link>
      </p>
    </main>
  );
}
