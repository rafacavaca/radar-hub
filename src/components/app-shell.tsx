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
import { useEffect, useRef, useState } from "react";

import { HojeBadge } from "@/components/hoje-badge";
import {
  Building2Icon,
  FileTextIcon,
  HouseIcon,
  RadarIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
  SwordsIcon,
  TargetIcon,
  WalletIcon,
} from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { NewClientButton } from "@/components/new-client-dialog";
import { useRotulo } from "@/components/vocab-context";
import { WelcomePanel } from "@/components/welcome-panel";
import type { VocabKey } from "@/lib/vocab-terms";

type IconCmp = (props: { className?: string }) => React.ReactNode;
/** `vocabKey` (opcional): o rótulo desta seção é renomeável pela agência (P13). */
type Section = { label: string; href: string; icon: IconCmp; purpose: string; match: (p: string) => boolean; vocabKey?: VocabKey };

/** Seções do modo CONCORRENTES (padrão). "Contas" = o pilar Clientes (contas-chave). */
const CONCORRENTES_SECTIONS: Section[] = [
  { label: "Visão", href: "/visao", icon: HouseIcon, purpose: "O panorama deste cliente: o que mudou e o que precisa rodar.", match: (p) => p.startsWith("/visao") },
  { label: "Briefing", href: "/", icon: SparklesIcon, purpose: "Os sinais que importam, já com a leitura por área e a ação sugerida.", match: (p) => p === "/" },
  { label: "Feed", href: "/feed", icon: RadarIcon, purpose: "Tudo que o Radar coletou sobre este cliente — os sinais crus, sem análise.", match: (p) => p.startsWith("/feed") },
  { label: "Contas", href: "/contas", icon: Building2Icon, purpose: "As {contas_chave} deste cliente — o que se move nelas e o que você pode oferecer.", match: (p) => p.startsWith("/contas") },
  { label: "Prospects", href: "/prospects", icon: TargetIcon, purpose: "Prepare-se pra uma reunião: um dossiê completo da empresa que você vai visitar.", match: (p) => p.startsWith("/prospects") },
  { label: "Conhecimento", href: "/perguntar", icon: SearchIcon, purpose: "Pergunte qualquer coisa sobre este cliente — a resposta vem com fonte e data.", match: (p) => p.startsWith("/perguntar") },
  {
    label: "Concorrentes",
    href: "/vigiar",
    icon: SwordsIcon,
    purpose: "Monitore e diagnostique os {concorrentes} deste cliente.",
    match: (p) => p.startsWith("/vigiar") || p.startsWith("/identidade") || p.startsWith("/diagnostico"),
    vocabKey: "concorrentes",
  },
  { label: "Relatórios", href: "/relatorios", icon: FileTextIcon, purpose: "Monte e exporte relatórios com gráficos, prontos pra reunião.", match: (p) => p.startsWith("/relatorios") },
  { label: "Áreas", href: "/analistas", icon: SlidersIcon, purpose: "As {areas} que leem cada sinal deste cliente — comercial, produto, marketing — e a régua de cada uma.", match: (p) => p.startsWith("/analistas"), vocabKey: "areas" },
];

/** Seções do modo CARTEIRA (2º template) — a Ficha no lugar de Visão/Briefing. */
const CARTEIRA_SECTIONS: Section[] = [
  { label: "Carteira", href: "/carteira", icon: WalletIcon, purpose: "Sua carteira: cada conta, o que se move nela e a aderência com o que você vende.", match: (p) => p.startsWith("/carteira") },
  { label: "Feed", href: "/feed", icon: RadarIcon, purpose: "Tudo que o Radar coletou sobre esta carteira — os sinais crus, sem análise.", match: (p) => p.startsWith("/feed") },
  { label: "Prospects", href: "/prospects", icon: TargetIcon, purpose: "Prepare-se pra uma reunião: um dossiê completo da empresa que você vai visitar.", match: (p) => p.startsWith("/prospects") },
  { label: "Conhecimento", href: "/perguntar", icon: SearchIcon, purpose: "Pergunte qualquer coisa sobre esta carteira — a resposta vem com fonte e data.", match: (p) => p.startsWith("/perguntar") },
  {
    label: "Hospitais",
    href: "/vigiar",
    icon: Building2Icon,
    purpose: "Monitore e diagnostique as instituições desta carteira.",
    match: (p) => p.startsWith("/vigiar") || p.startsWith("/identidade") || p.startsWith("/diagnostico"),
  },
  { label: "Relatórios", href: "/relatorios", icon: FileTextIcon, purpose: "Monte e exporte relatórios com gráficos, prontos pra reunião.", match: (p) => p.startsWith("/relatorios") },
  { label: "Áreas", href: "/analistas", icon: SlidersIcon, purpose: "As {areas} que leem cada sinal desta carteira — comercial, produto, marketing — e a régua de cada uma.", match: (p) => p.startsWith("/analistas"), vocabKey: "areas" },
];

/** Resolve os {termos} de um purpose pelo vocabulário da agência (minúsculo, meio de frase). */
function resolverPurpose(texto: string, r: (k: VocabKey) => string): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => r(k as VocabKey).toLocaleLowerCase("pt-BR"));
}

/** Home de cada cliente conforme o modo. */
function homeFor(mode: string | undefined): string {
  return mode === "carteira" ? "/carteira" : "/visao";
}

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

function CloseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function GearIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TodayIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function BookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5v14" />
      <path d="M4 5A2 2 0 0 1 6 3h6v14H6a2 2 0 0 0-2 2z" />
      <path d="M20 5a2 2 0 0 0-2-2h-6v14h6a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** A marca do Radar — o ícone com a onda pulsando atrás (a "vida" do produto,
    na linguagem do pulso do ponto vermelho original). */
function RadarMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center">
      <span aria-hidden className="radar-ping absolute inset-0 rounded-full bg-red-500/20" />
      <RadarIcon className={"relative text-red-500 " + className} />
    </span>
  );
}

/** Item de FUNÇÃO da agência no rodapé/topo (Hoje, Automações, Agências, Custo) —
    ícone solto + label, tratamento único. Distingue-se das CONTAS (monograma). */
function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
}: {
  href: string;
  label: string;
  icon: IconCmp;
  active: boolean;
  collapsed: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={
        (collapsed ? "justify-center " : "gap-2.5 px-2 ") +
        "flex items-center rounded-md py-1.5 text-sm transition-colors " +
        (active ? "bg-stone-100 font-semibold text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
      }
    >
      <Icon className={"h-[18px] w-[18px] shrink-0 " + (active ? "text-stone-900" : "text-stone-500")} />
      {!collapsed ? <span className="flex-1">{label}</span> : null}
      {!collapsed ? badge : null}
    </Link>
  );
}

/** Miolo da sidebar (Hoje + clientes + rodapé) — reusado no desktop e na gaveta
    mobile. `collapsed` só é true no desktop recolhido; na gaveta é sempre false. */
function SidebarNav({
  clients,
  modes,
  isAdmin,
  pathname,
  cliente,
  collapsed,
}: {
  clients: string[];
  modes?: Record<string, string>;
  isAdmin: boolean;
  pathname: string;
  cliente: string;
  collapsed: boolean;
}) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Clientes">
        {/* INÍCIO (Home) + HOJE — telas da AGÊNCIA (cruzam os clientes), acima da lista */}
        <div className="mb-2 space-y-0.5">
          <NavItem href="/inicio" label="Início" icon={HouseIcon} active={pathname === "/inicio"} collapsed={collapsed} />
          <NavItem href="/hoje" label="Hoje" icon={TodayIcon} active={pathname === "/hoje"} collapsed={collapsed} badge={<HojeBadge />} />
        </div>
        {!collapsed ? (
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Clientes</p>
        ) : null}
        <ul className="space-y-0.5">
          {clients.map((name) => {
            const active = name === cliente;
            return (
              <li key={name}>
                <Link
                  href={withClient(homeFor(modes?.[name]), name)}
                  aria-current={active ? "true" : undefined}
                  title={collapsed ? name : undefined}
                  className={
                    collapsed
                      ? "flex justify-center rounded-md py-1.5 transition-colors hover:bg-stone-100"
                      : "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors " +
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

      {/* rodapé — ações da AGÊNCIA (fora do escopo de um cliente) */}
      <div className="space-y-1 border-t border-stone-200 p-3">
        <NewClientButton clients={clients} collapsed={collapsed} />
        <NavItem href="/automacoes" label="Automações" icon={GearIcon} active={pathname === "/automacoes"} collapsed={collapsed} />
        <NavItem href="/implantacao" label="Implantação" icon={FileTextIcon} active={pathname === "/implantacao"} collapsed={collapsed} />
        <NavItem href="/treinamento" label="Treinamento" icon={BookIcon} active={pathname === "/treinamento"} collapsed={collapsed} />
        {isAdmin ? (
          collapsed ? (
            <>
              <NavItem href="/admin" label="Agências" icon={ShieldIcon} active={pathname === "/admin"} collapsed />
              <NavItem href="/custo" label="Custo" icon={ReceiptIcon} active={pathname === "/custo"} collapsed />
            </>
          ) : (
            <div className="pt-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">Administração</p>
              <NavItem href="/admin" label="Agências" icon={ShieldIcon} active={pathname === "/admin"} collapsed={false} />
              <NavItem href="/custo" label="Custo" icon={ReceiptIcon} active={pathname === "/custo"} collapsed={false} />
            </div>
          )
        ) : null}
        <LogoutButton collapsed={collapsed} />
      </div>
    </>
  );
}

export function AppShell({
  clients,
  modes,
  isAdmin = false,
  children,
}: {
  clients: string[];
  /** modo por cliente (nome → "concorrentes" | "carteira"); ausente ⇒ concorrentes. */
  modes?: Record<string, string>;
  /** o usuário da sessão pode administrar (super_admin / dono no modo clássico). */
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const r = useRotulo(); // rótulos renomeáveis pela agência (P13)

  // Lê a preferência depois de montar (evita mismatch de hidratação).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* localStorage indisponível — mantém expandido */
    }
  }, []);

  // Fecha a gaveta mobile ao navegar (mudou rota OU cliente selecionado).
  const routeSig = pathname + "?" + params.toString();
  useEffect(() => {
    setDrawerOpen(false);
  }, [routeSig]);

  // Mantém a aba ATIVA visível na fileira rolável (mobile: 9 abas não cabem).
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const ativo = tabsRef.current?.querySelector('[aria-current="page"]');
    ativo?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [routeSig]);

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

  // Telas sem chrome: login, o modo apresentação (export limpo) e o painel
  // admin de custo (standalone, fora do escopo de um cliente).
  if (
    pathname === "/entrar" ||
    pathname.startsWith("/apresentar") ||
    pathname === "/custo" ||
    pathname === "/admin" ||
    pathname === "/treinamento"
  ) {
    return <>{children}</>;
  }

  const cliente =
    params.get("cliente") && clients.includes(params.get("cliente") as string)
      ? (params.get("cliente") as string)
      : (clients[0] ?? "");
  const mode = modes?.[cliente] ?? "concorrentes";
  const sections = mode === "carteira" ? CARTEIRA_SECTIONS : CONCORRENTES_SECTIONS;
  const activeSection = sections.find((s) => s.match(pathname));
  // telas da AGÊNCIA (não de um cliente) — sem o cabeçalho/abas de cliente.
  const orgLevel =
    pathname === "/inicio" || pathname === "/hoje" || pathname === "/automacoes" || pathname === "/implantacao";

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-stone-50">
      {/* SIDEBAR (desktop) — marca + contas + novo cliente (global) */}
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
              <RadarMark />
            </button>
          ) : (
            <>
              <RadarMark />
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
        <SidebarNav clients={clients} modes={modes} isAdmin={isAdmin} pathname={pathname} cliente={cliente} collapsed={collapsed} />
      </aside>

      {/* GAVETA (mobile) — overlay + painel deslizante com a MESMA navegação */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-stone-900/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      ) : null}
      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[264px] max-w-[82vw] flex-col border-r border-stone-200 bg-white shadow-xl transition-transform duration-200 md:hidden " +
          (drawerOpen ? "translate-x-0" : "-translate-x-full")
        }
        aria-label="Navegação"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-stone-200 px-5">
          <RadarMark />
          <span className="text-[15px] font-bold tracking-[-0.01em] text-stone-900">Radar</span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <CloseIcon />
          </button>
        </div>
        <SidebarNav clients={clients} modes={modes} isAdmin={isAdmin} pathname={pathname} cliente={cliente} collapsed={false} />
      </aside>

      {/* CONTEÚDO — topbar do cliente (fixo) + tabs + página (rola).
          /hoje e /automacoes são da agência: sem cabeçalho de cliente. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOPBAR MOBILE (universal) — hambúrguer + marca + troca rápida de cliente.
            Aparece em TODAS as telas do mobile, inclusive as da agência (Hoje). */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-stone-200 bg-white px-4 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100"
          >
            <MenuIcon />
          </button>
          <RadarMark />
          <span className="text-[15px] font-bold tracking-[-0.01em] text-stone-900">Radar</span>
          {!orgLevel && clients.length > 0 ? (
            <select
              aria-label="Cliente"
              value={cliente}
              className="ml-auto max-w-[45%] truncate rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-800"
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

        <WelcomePanel />
        {orgLevel ? (
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        ) : (
        <header className="shrink-0 border-b border-stone-200 bg-stone-50">
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

          {/* tabs de seção — fileira rolável no mobile (9 abas), fade nas bordas */}
          <div className="relative">
            <nav
              ref={tabsRef}
              className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden"
              aria-label="Seções"
            >
              {sections.map((s) => {
                const active = s.match(pathname);
                return (
                  <Link
                    key={s.href}
                    href={withClient(s.href, cliente)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
                      (active
                        ? "border-stone-900 text-stone-900"
                        : "border-transparent text-stone-500 hover:text-stone-900")
                    }
                  >
                    <s.icon className={"h-4 w-4 shrink-0 " + (active ? "text-stone-900" : "text-stone-400")} />
                    {s.vocabKey ? r(s.vocabKey) : s.label}
                  </Link>
                );
              })}
            </nav>
            {/* fades — sinalizam que a fileira rola (só mobile) */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-stone-50 md:hidden" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-stone-50 md:hidden" />
          </div>

          {/* Linha "pra que serve esta tela" — orienta quem chegou agora. */}
          {activeSection ? (
            <p className="px-4 pb-2.5 text-[13px] leading-snug text-stone-500 md:px-6">
              {resolverPurpose(activeSection.purpose, r)}
            </p>
          ) : null}
        </header>
        )}

        {!orgLevel ? (
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        ) : null}
      </div>
    </div>
  );
}
