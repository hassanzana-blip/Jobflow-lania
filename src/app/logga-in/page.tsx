import { authConfigured } from "@/server/supabase";
import { AuthForm } from "@/components/auth-form";
import { ActionLink } from "@/components/ui";
import { sv } from "@/i18n/sv";
export default function Login() {
  return (
    <main id="main" className="auth-main">
      <h1>{sv.auth.loginTitle}</h1>
      {authConfigured() ? (
        <AuthForm mode="login" />
      ) : (
        <>
          <div className="notice">{sv.auth.unavailable}</div>
          <ActionLink href="/produktvisning">{sv.auth.preview}</ActionLink>
        </>
      )}
    </main>
  );
}
