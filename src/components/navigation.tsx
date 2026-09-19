"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Brand, ActionLink } from "./ui";
import { sv } from "@/i18n/sv";
export function Navigation() {
  const links = [
    ["/hitta-jobb", sv.nav.jobs],
    ["/#sa-fungerar-det", sv.nav.how],
    ["/#priser", sv.nav.pricing],
  ];
  return (
    <header className="site-header">
      <div className="container nav-row">
        <Brand />
        <nav className="desktop-nav" aria-label="Huvudmeny">
          {links.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Link className="login-link" href="/logga-in">
            {sv.nav.login}
          </Link>
          <ActionLink href="/kom-igang">{sv.nav.start}</ActionLink>
        </div>
        <Dialog.Root>
          <Dialog.Trigger
            className="icon-button mobile-menu"
            aria-label={sv.nav.menu}
          >
            <Menu />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="mobile-drawer">
              <Dialog.Title>{sv.nav.menu}</Dialog.Title>
              <Dialog.Description className="sr-only">
                Navigera i JobbFlow
              </Dialog.Description>
              <Dialog.Close
                className="icon-button close"
                aria-label={sv.nav.close}
              >
                <X />
              </Dialog.Close>
              <nav>
                {links.map(([href, label]) => (
                  <Dialog.Close asChild key={href}>
                    <Link href={href}>{label}</Link>
                  </Dialog.Close>
                ))}
                <Dialog.Close asChild>
                  <Link href="/logga-in">{sv.nav.login}</Link>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Link href="/kom-igang">{sv.nav.start}</Link>
                </Dialog.Close>
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
