import Link from "next/link";
import { RecoveryForm } from "@/components/recovery-form";
import { authConfigured, userClient } from "@/server/supabase";
import { sv } from "@/i18n/sv";
export default async function ResetPassword() {
  const user = authConfigured() ? (await (await userClient()).auth.getUser()).data.user : null;
  return <main id="main" className="auth-main"><h1>{sv.auth.resetTitle}</h1>{user?.email ? <RecoveryForm email={user.email} /> : <><p>{sv.auth.resetExpired}</p><Link href="/glomt-losenord">{sv.auth.recoveryButton}</Link></>}</main>;
}
