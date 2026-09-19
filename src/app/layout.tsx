import type { Metadata } from "next";
import type { Viewport } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { Navigation } from "@/components/navigation";
import { Brand } from "@/components/ui";
import { sv } from "@/i18n/sv";
import Link from "next/link";
import "./globals.css";
import "./mobile.css";
export const metadata: Metadata = {
  applicationName: "JobbFlow",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  appleWebApp: { capable: true, title: "JobbFlow", statusBarStyle: "default" },
  title: {
    default: "JobbFlow — Jobben som passar dig. Hittade åt dig.",
    template: "%s · JobbFlow",
  },
  description: sv.hero.body,
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f4e9",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body>
        <a className="skip-link" href="#main">
          Till innehållet
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
