/**
 * PAINEL DE CUSTO (item 1) — admin (só o Rafael; gate no proxy). Mostra o custo
 * ESTIMADO por tabela de preço, com os recortes que orientam pricing: por
 * cliente · por feature · por concorrente/conta (o custo marginal) · por
 * provider (Claude × DeepSeek × Firecrawl) · por modelo.
 *
 * Honestidade: é ESTIMATIVA (tabela), não fatura; o Claude roda por subscrição
 * (marginal real ≈ 0 até o teto) — o valor é o equivalente-API, a base pra
 * decidir preço. Nada de número inventado: se não houve evento, diz.
 *
 * Standalone (sem o shell de cliente) — é uma tela da AGÊNCIA, não de uma conta.
 */

import Link from "next/link";

import {
  custoMarginalEntidade,
  fmtUSD,
  porCliente,
  porDia,
  porEntidade,
  porFeature,
  porModelo,
  porProvider,
  totais,
  type Bucket,
} from "@/lib/usage/aggregate";
import { getPrecos } from "@/lib/usage/precos";
import { readUsageEvents } from "@/lib/usage/store";

export const dynamic = "force-dynamic";

const PERIODOS: Array<{ dias: number | null; label: string }> = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
  { dias: null, label: "Tudo" },
];

function desdeISO(dias: number | null): string | undefined {
  if (dias == null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{valor}</p>
      {sub ? <p className="mt-0.5 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

function Tabela({ titulo, nota, buckets, total, mostrarTokens = true }: { titulo: string; nota?: string; buckets: Bucket[]; total: number; mostrarTokens?: boolean }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-900">{titulo}</h2>
        {nota ? <p className="mt-0.5 text-xs text-stone-500">{nota}</p> : null}
      </div>
      {buckets.length === 0 ? (
        <p className="px-4 py-6 text-sm text-stone-400">Sem eventos no período.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {buckets.map((b) => {
            const pct = total > 0 ? (b.custo / total) * 100 : 0;
            return (
              <li key={b.chave} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-stone-800">{b.rotulo}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">{fmtUSD(b.custo)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-stone-400">
                    {b.chamadas} ch{mostrarTokens && (b.tokensIn || b.tokensOut) ? ` · ${fmtTokens(b.tokensIn + b.tokensOut)} tok` : b.unidades ? ` · ${b.unidades} un` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function CustoPage({ searchParams }: { searchParams: Promise<{ dias?: string; cliente?: string }> }) {
  const sp = await searchParams;
  const diasSel = sp.dias === "tudo" ? null : sp.dias ? Number(sp.dias) : 30;
  const clienteSel = sp.cliente?.trim() || undefined;

  const eventos = readUsageEvents({ desde: desdeISO(diasSel), clientName: clienteSel });
  const t = totais(eventos);
  const marginal = custoMarginalEntidade(eventos);
  const precos = getPrecos();

  const clientes = porCliente(eventos);
  const features = porFeature(eventos);
  const entidades = porEntidade(eventos);
  const providers = porProvider(eventos);
  const modelos = porModelo(eventos);
  const dias = porDia(eventos);

  const linkPeriodo = (d: number | null) => {
    const q = new URLSearchParams();
    q.set("dias", d == null ? "tudo" : String(d));
    if (clienteSel) q.set("cliente", clienteSel);
    return `/custo?${q.toString()}`;
  };

  return (
    <div className="min-h-[100dvh] bg-stone-50">
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-8">
        {/* cabeçalho */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm text-stone-500 transition-colors hover:text-stone-900">
            ← Radar
          </Link>
          <div className="ml-auto flex gap-1 rounded-lg border border-stone-200 bg-white p-0.5">
            {PERIODOS.map((p) => {
              const ativo = (p.dias ?? "tudo") === (diasSel ?? "tudo");
              return (
                <Link
                  key={p.label}
                  href={linkPeriodo(p.dias)}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                    (ativo ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-900")
                  }
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Custo{clienteSel ? ` · ${clienteSel}` : ""}</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Estimativa por tabela de preço — <span className="font-medium text-stone-600">não é fatura</span>. Claude roda por
          subscrição (marginal real ≈ 0 até o teto do plano); o valor é o equivalente-API, a base honesta pra decidir preço.
        </p>

        {eventos.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-stone-700">Ainda não há chamadas medidas neste período.</p>
            <p className="mt-1 text-sm text-stone-500">
              Rode um briefing (Rodar agora) ou um diagnóstico de concorrente e volte aqui — cada chamada de LLM e de coleta
              grava um evento automaticamente.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Custo estimado" valor={fmtUSD(t.custo)} sub={`${t.chamadas} chamada(s) · ${diasSel == null ? "todo o histórico" : `${diasSel} dias`}`} />
              <Kpi rotulo="Tokens (in · out)" valor={`${fmtTokens(t.tokensIn)} · ${fmtTokens(t.tokensOut)}`} sub={`${fmtTokens(t.unidades)} páginas/buscas`} />
              <Kpi
                rotulo="Custo médio / entidade"
                valor={marginal.entidades > 0 ? fmtUSD(marginal.custoMedioPorEntidade) : "—"}
                sub={marginal.entidades > 0 ? `${marginal.entidades} concorrente(s)/conta(s) — o marginal de +1` : "sem entidade medida"}
              />
              <Kpi
                rotulo="Cross-check provedor"
                valor={t.custoProvedor > 0 ? fmtUSD(t.custoProvedor) : "—"}
                sub={t.custoProvedor > 0 ? "custo que o SDK reportou" : "sem número do provedor"}
              />
            </div>

            {/* tabelas */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Tabela titulo="Por cliente" buckets={clientes} total={t.custo} />
              <Tabela titulo="Por feature" nota="briefing · diagnóstico · lentes · correlação · relatório · coleta" buckets={features} total={t.custo} />
              <Tabela
                titulo="Por concorrente / conta"
                nota="a base do custo marginal — quanto custa vigiar cada entidade"
                buckets={entidades}
                total={entidades.reduce((s, b) => s + b.custo, 0)}
              />
              <Tabela titulo="Por provider" nota="Claude (subscrição) × DeepSeek (fallback) × Firecrawl (coleta)" buckets={providers} total={t.custo} mostrarTokens={false} />
              <Tabela titulo="Por modelo" buckets={modelos} total={t.custo} />
              <Tabela titulo="Por dia" nota="tendência do gasto ao longo do período" buckets={dias} total={t.custo} mostrarTokens={false} />
            </div>

            {/* rodapé de transparência */}
            <div className="mt-5 rounded-xl border border-stone-200 bg-stone-100/60 p-4 text-xs leading-relaxed text-stone-500">
              <p>
                <span className="font-semibold text-stone-600">Tabela vigente</span> (editável em{" "}
                <code className="rounded bg-white px-1 py-0.5 text-stone-600">data/config/precos.json</code>): Claude Sonnet ${precos.llm["claude-sonnet"]?.input_usd_mtok}/${precos.llm["claude-sonnet"]?.output_usd_mtok} por 1M (in/out) ·
                DeepSeek ${precos.llm.deepseek?.input_usd_mtok}/${precos.llm.deepseek?.output_usd_mtok} · Firecrawl ${precos.coleta.firecrawl_pagina_usd}/página.
              </p>
              <p className="mt-1.5">
                O log é <span className="font-medium text-stone-600">assíncrono e só de metadados</span> (tokens, feature, ids) — nunca o
                conteúdo do prompt ou do sinal. Chamadas servidas do cache do dia não gastam crédito e não são contadas.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
