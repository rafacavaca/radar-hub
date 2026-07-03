"use client";

/**
 * Cabeçalho/nav compartilhado — a mesma faixa no topo do Briefing e do Feed,
 * com o item ativo destacado. Único componente client do layout.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Briefing" },
  { href: "/feed", label: "Feed" },
  { href: "/vigiar", label: "Vigiar" },
  { href: "/perguntar", label: "Perguntar" },
  { href: "/analistas", label: "Analistas" },
  { href: "/relatorios", label: "Relatórios" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SiteNav() {
  const pathname = usePathname();

  // Modo apresentação (F6) é limpo/exportável — sem chrome do app.
  if (pathname.startsWith("/apresentar")) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ring-4 ring-red-500/15"
          />
          <span className="text-[15px] font-semibold tracking-tight text-stone-900">
            Radar
          </span>
          <span className="hidden text-sm text-stone-400 sm:inline">
            Inteligência de mercado
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-stone-900 text-stone-50"
                    : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
