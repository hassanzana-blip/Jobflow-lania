import { redirect, notFound } from "next/navigation";
import { authConfigured, requireUser } from "@/server/supabase";
import { loadWorkspace } from "@/server/workspace";
import { MobileWorkspace } from "@/components/mobile-workspace";
import { ActionLink } from "@/components/ui";
import { sv } from "@/i18n/sv";
import { mobileSv as t } from "@/i18n/mobile-sv";
export default async function Workspace({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view } = await params,
    route = view?.join("/") ?? "";
  const routes = {
    "": "home",
    sparade: "saved",
    ansokningar: "applications",
    profil: "profile",
    installningar: "profile",
  } as const;
  if (!(route in routes)) notFound();
  if (!authConfigured())
    return (
      <main id="main" className="auth-main">
        <h1>{sv.app.forYou}</h1>
        <p className="notice">{sv.auth.unavailable}</p>
        <ActionLink href="/produktvisning">{sv.auth.preview}</ActionLink>
        <ActionLink href="/hitta-jobb">{t.search}</ActionLink>
      </main>
    );
  const auth = await requireUser().catch(() => null);
  if (!auth) redirect("/logga-in");
  return (
    <MobileWorkspace
      initial={await loadWorkspace()}
      initialView={routes[route as keyof typeof routes]}
    />
  );
}
