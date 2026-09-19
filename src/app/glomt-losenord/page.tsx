import { RecoveryForm } from "@/components/recovery-form";
import { authConfigured } from "@/server/supabase";
import { sv } from "@/i18n/sv";
export default function ForgotPassword() {
  return <main id="main" className="auth-main"><h1>{sv.auth.recoveryTitle}</h1>{authConfigured() ? <RecoveryForm /> : <p className="notice">{sv.auth.unavailable}</p>}</main>;
}
