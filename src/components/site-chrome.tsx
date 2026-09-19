"use client";
import { usePathname } from "next/navigation";
import { Navigation } from "./navigation";
import { Brand } from "./ui";
import { sv } from "@/i18n/sv";
import Link from "next/link";
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (
    path.startsWith("/app") ||
    path.startsWith("/produktvisning") ||
    path.startsWith("/hitta-jobb")
  )
    return <>{children}</>;
  return (
    <>
      <Navigation />
      {children}
      <footer className="site-footer">
        <div className="container footer-top">
          <div>
            <Brand />
            <p>{sv.footer.line}</p>
          </div>
          <nav aria-label="Information">
            <Link href="/integritet">{sv.footer.privacy}</Link>
            <Link href="/villkor">{sv.footer.terms}</Link>
            <Link href="/tillganglighet">{sv.footer.accessibility}</Link>
          </nav>
        </div>
        <div className="container footer-bottom">{sv.footer.status}</div>
      </footer>
    </>
  );
}
