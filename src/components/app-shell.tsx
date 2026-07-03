"use client";

/**
 * APP SHELL (CRM) — o esqueleto do Radar: CLIENTE é a unidade primária.
 * Sidebar esquerda = marca + lista de contas + "+ Novo cliente" (global, no
 * rodapé) + toggle de recolher. Conteúdo = topbar do cliente + tabs de seção
 * (Visão · Briefing · Feed · Conhecimento · Concorrentes · Relatórios · Ajustes).
 *
 * Modelo de scroll do desenho: a raiz ocupa a tela (h-dvh, overflow-hidden), o
 * cabeçalho do cliente fica FIXO e só o <main> rola — assim o filtro de lente
 * do Briefing pode se fixar no topo do conteúdo sem sumir ao rolar.
 *
 * O cliente selecionado vive em `?cliente=`. Nas telas sem chrome (/entrar,
 * /apresentar) o shell some — só o conteúdo.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { NewClientButton } from "@/components/new-client-dialog";

const SECTIONS = [
  { label: "Visão", href: "/visao", match: (p: string) => p.startsWith("/visao") },
  { label: "Briefing", href: "/", match: (p: string) => p === "/" },
  { label: "Feed", href: "/feed", match: (p: string) => p.startsWith("/feed") },
  { label: "Conhecimento", href: "/perguntar", match: (p: string) => p.startsWith("/perguntar") },
  {
    label: "Concorrentes",
    href: "/vigiar",
    match: (p: string) => p.startsWith("/vigiar") || p.startsWith("/identidade"),
  },
  { label: "Relatórios", href: "/relatorios", match: (p: string) => p.startsWith("/relatorios") },
  { label: "Ajustes", href: "/analistas", match: (p: string) => p.startsWith("/analistas") },
] as const;

const SIDEBAR_KEY = "radar:sidebar-collapsed";

/** Monograma da conta (2 iniciais). Neutro — um papel por cor (nada de tinta random). */
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Preserva o cliente selecionado ao trocar de seção. */
function withClient(href: string, cliente: string): string {
  if (!cliente) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}cliente=${encodeURIComponent(cliente)}`;
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function AppShell({
  clients,
  children,
}: {
  clients: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  // Lê a preferência depois de montar (evita mismatch de hidratação).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* localStorage indisponível — mantém expandido */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignora */
      }
      return next;
    });
  }

  // Telas sem chrome: login e o modo apresentação (export limpo pra imprimir).
  if (pathname === "/entrar" || pathname.startsWith("/apresentar")) return <>{children}</>;

  const cliente =
    params.get("cliente") && clients.includes(params.get("cliente") as string)
      ? (params.get("cliente") as string)
      : (clients[0] ?? "");

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-stone-50">
      {/* SIDEBAR — marca + contas + novo cliente (global) */}
      <aside
        className={
          "hidden shrink-0 flex-col border-r border-stone-200 bg-white transition-[width] duration-200 md:flex " +
          (collapsed ? "w-[64px]" : "w-[248px]")
        }
      >
        {/* marca + toggle */}
        <div
          className={
            "flex h-14 items-center border-b border-stone-200 " +
            (collapsed ? "justify-center px-2" : "gap-2.5 px-5")
          }
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expandir a barra"
              aria-label="Expandir a barra"
              className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-stone-100"
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 radar-pulse" />
            </button>
          ) : (
            <>
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 radar-pulse" />
              <span className="text-[15px] font-bold tracking-[-0.01em] text-stone-900">Radar</span>
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Recolher a barra"
                aria-label="Recolher a barra"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
              >
                <ChevronLeftIcon />
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Clientes">
          {!collapsed ? (
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
              Clientes
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {clients.map((name) => {
              const active = name === cliente;
              return (
                <li key={name}>
                  <Link
                    href={withClient("/visao", name)}
                    aria-current={active ? "true" : undefined}
                    title={collapsed ? name : undefined}
                    className={
                      collapsed
                        ? "flex justify-center rounded-md py-1.5 transition-colors hover:bg-stone-100"
                        : "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors " +
                          (active
                            ? "bg-stone-100 font-semibold text-stone-900"
                            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
                    }
                  >
                    <span
                      aria-hidden
                      className={
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold " +
                        (active ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-600")
                      }
                    >
                      {monogram(name)}
                    </span>
                    {!collapsed ? <span className="truncate">{name}</span> : null}
                  </Link>
                </li>
              );
            })}
            {clients.length === 0 && !collapsed ? (
              <li className="px-2 py-1.5 text-sm text-stone-400">Nenhum cliente ainda</li>
            ) : null}
          </ul>
        </nav>

        {/* rodapé — "+ Novo cliente" é GLOBAL (ação da agência, não da conta) */}
        <div className="border-t border-stone-200 p-3">
          <NewClientButton clients={clients} collapsed={collapsed} />
          {!collapsed ? (
            <p className="mt-2 px-1 text-[11px] text-stone-400">Visão geral · Configurações</p>
          ) : null}
        </div>
      </aside>

      {/* CONTEÚDO — topbar do cliente (fixo) + tabs + página (rola) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-stone-200 bg-stone-50">
          {/* mobile: marca + seletor de cliente */}
          <div className="flex items-center gap-2.5 px-5 py-2.5 md:hidden">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-[15px] font-bold tracking-[-0.01em] text-stone-900">Radar</span>
            {clients.length > 0 ? (
              <select
                aria-label="Cliente"
                defaultValue={cliente}
                className="ml-auto rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800"
                onChange={(e) => {
                  window.location.href = withClient(pathname, e.target.value);
                }}
              >
                {clients.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* cliente atual (desktop) */}
          <div className="hidden items-center gap-3 px-6 pt-4 md:flex">
            <span
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-stone-200 text-xs font-semibold text-stone-600"
            >
              {cliente ? monogram(cliente) : "—"}
            </span>
            <span className="text-[20px] font-semibold tracking-tight text-stone-900">
              {cliente || "Selecione um cliente"}
            </span>
          </div>

          {/* tabs de seção */}
          <nav className="flex gap-1 overflow-x-auto px-4 md:px-6" aria-label="Seções">
            {SECTIONS.map((s) => {
              const active = s.match(pathname);
              return (
                <Link
                  key={s.href}
                  href={withClient(s.href, cliente)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
                    (active
                      ? "border-stone-900 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-900")
                  }
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
