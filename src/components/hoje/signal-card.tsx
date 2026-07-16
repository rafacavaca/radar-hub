"use client";

/**
 * SIGNAL CARD (F1.1 + F1.7) — o card ENXUTO do inbox. A moldura é software
 * (manchete + chips escaneáveis); a prosa do LLM (análise, ação) fica RECOLHIDA
 * atrás de "ver análise". Um sinal lido por várias lentes vira UMA manchete com
 * as leituras aninhadas.
 *
 * Honestidade preservada: fonte + data (RecencyStamp/SourceRef) sempre visíveis
 * na linha de chips; "gatilho/ângulo" viram rótulos curtos, não parágrafos.
 */

import Link from "next/link";

import { useRotulo } from "@/components/vocab-context";
import { useState } from "react";

import { BriefingItemActions } from "@/components/briefing-item-actions";
import { RecencyStamp, SourceRef } from "@/components/signal-meta";
import { Tooltip } from "@/components/ui/tooltip";
import type { DigestGroup, DigestItem } from "@/lib/digest";

const LENS_META: Record<string, { label: string; tip: string }> = {
  comercial: { label: "Comercial", tip: "O que significa para vender ou reter agora." },
  produto: { label: "Produto", tip: "O que significa para o produto e o roadmap." },
  marketing: { label: "Marketing", tip: "O que significa para o discurso, posicionamento e conteúdo." },
};

const KIND_META: Record<DigestItem["kind"], { label: string; tip: string }> = {
  leitura: { label: "Leitura", tip: "Um sinal lido pelas lentes dos times." },
  gatilho: { label: "Oportunidade de venda", tip: "Sinal de uma conta que abre oportunidade comercial." },
  jogada: { label: "Relacionamento", tip: "Sinal de conta-chave cruzado com a sua oferta." },
  alerta: { label: "Alerta", tip: "Movimento de concorrente que casou uma regra sua." },
  relatorio: { label: "Relatório", tip: "Um relatório agendado saiu." },
  reuniao: { label: "Reunião", tip: "Prospect com reunião marcada — o dossiê está no card." },
};

/** Rótulos estruturados da análise/ação por tipo (nada de parágrafo solto). */
const ANALISE_LABEL: Record<DigestItem["kind"], { corpo: string; acao: string }> = {
  leitura: { corpo: "Leitura", acao: "Ação" },
  gatilho: { corpo: "Oportunidade", acao: "Ângulo" },
  jogada: { corpo: "Oportunidade", acao: "Jogada" },
  alerta: { corpo: "Movimento", acao: "Ação" },
  relatorio: { corpo: "Sobre", acao: "Ação" },
  reuniao: { corpo: "Dossiê", acao: "Contato" },
};

/** Onde cada tipo abre no painel (deep-link do inbox) — puro, client-safe. */
function painelDe(item: DigestItem): string {
  if (item.href) return item.href; // deep-link explícito (ex.: dossiê do prospect)
  const q = `?cliente=${encodeURIComponent(item.clientName)}`;
  switch (item.kind) {
    case "alerta":
      return `/diagnostico${q}`;
    case "relatorio":
      return `/relatorios${q}`;
    case "gatilho":
      return `/carteira${q}`;
    case "jogada":
      return `/contas${q}`;
    case "reuniao":
      return `/prospects${q}`;
    default:
      return `/${q}`;
  }
}

/** Pílula neutra pequena (chip). */
function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={"inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500 " + className}>
      {children}
    </span>
  );
}

export function SignalCard({
  group,
  now,
  voltou = false,
  unread = false,
}: {
  group: DigestGroup;
  now: string;
  voltou?: boolean;
  unread?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const head = group.head;
  const agrupado = group.itens.length > 1;
  // lentes presentes (quando agrupado por sinal) — chips escaneáveis.
  const lentes = group.itens.map((i) => i.lens).filter((l): l is NonNullable<typeof l> => Boolean(l));
  // vocabulário da agência: o tipo "gatilho" é a Oportunidade (renomeável).
  const r = useRotulo();
  const kindLabel = (k: DigestItem["kind"]) => (k === "gatilho" ? `${r("oportunidade")} de venda` : KIND_META[k].label);
  const corpoLabel = (k: DigestItem["kind"]) => (k === "gatilho" || k === "jogada" ? r("oportunidade") : ANALISE_LABEL[k].corpo);

  return (
    <article
      className={
        "rounded-lg border bg-white transition-colors " +
        (unread ? "border-stone-200 border-l-2 border-l-red-500" : "border-stone-200")
      }
    >
      <div className="px-4 py-3 sm:px-5">
        {/* linha 1: cliente · tipo · (novo)  ·············  ações */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">{head.clientName}</span>
            <Tooltip content={KIND_META[head.kind].tip}>
              <Chip>{kindLabel(head.kind)}</Chip>
            </Tooltip>
            {voltou ? <Chip className="bg-amber-100 text-amber-800">Adiado</Chip> : null}
            {unread && !voltou ? (
              <Tooltip content="Novo desde a sua última visita.">
                <Chip className="bg-red-50 text-red-700">Novo</Chip>
              </Tooltip>
            ) : null}
          </div>
          {/* desktop: ações no topo-direito; mobile: vão pro fim do card (abaixo) */}
          <div className="hidden shrink-0 md:block">
            <BriefingItemActions items={group.itens} />
          </div>
        </div>

        {/* manchete: o FATO, curto e em destaque */}
        <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-stone-900">{head.titulo}</h3>

        {/* linha de chips: impacto · lentes · fonte · data */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Tooltip content="Prioridade: quão relevante para você (não popularidade). Escala 0–100.">
            <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-stone-700">
              {group.score}
              <span className="font-medium uppercase tracking-wide text-stone-400">prioridade</span>
            </span>
          </Tooltip>

          {agrupado
            ? lentes.map((l) => (
                <Tooltip key={l} content={LENS_META[l].tip}>
                  <Chip>{LENS_META[l].label}</Chip>
                </Tooltip>
              ))
            : head.lens
              ? (
                  <Tooltip content={LENS_META[head.lens].tip}>
                    <Chip>{LENS_META[head.lens].label}</Chip>
                  </Tooltip>
                )
              : null}

          {head.fonte?.url ? <SourceRef url={head.fonte.url} titulo={head.fonte.titulo} /> : null}
          {head.data ? <RecencyStamp publishedAt={head.data} collectedAt={head.data} now={now} /> : null}
        </div>

        {/* controles: ver análise · abrir no painel */}
        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-stone-500 transition-colors hover:text-stone-900"
          >
            <span aria-hidden className={"transition-transform " + (open ? "rotate-90" : "")}>▸</span>
            {open ? "ocultar análise" : agrupado ? `ver análise · ${group.itens.length} lentes` : "ver análise"}
          </button>
          <Link
            href={painelDe(head)}
            className="text-[12px] font-medium text-stone-400 underline-offset-2 transition-colors hover:text-stone-700 hover:underline"
          >
            abrir no painel
          </Link>
        </div>

        {/* ações — no mobile ficam no fim do card (não sobrepõem título/chips) */}
        <div className="mt-3 border-t border-stone-100 pt-3 md:hidden">
          <BriefingItemActions items={group.itens} />
        </div>
      </div>

      {/* análise recolhida: a prosa do LLM, por lente, com rótulos estruturados */}
      {open ? (
        <div className="space-y-3 border-t border-stone-100 bg-stone-50/40 px-4 py-3 sm:px-5">
          {group.itens.map((item) => (
            <div key={item.id}>
              {agrupado && item.lens ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">
                  {LENS_META[item.lens].label}
                </p>
              ) : null}
              <p className="mt-0.5 text-sm leading-relaxed text-stone-700">
                <span className="font-medium text-stone-500">{corpoLabel(item.kind)}: </span>
                {item.detalhe}
              </p>
              {item.acao ? (
                <p className="mt-1 text-sm leading-relaxed text-stone-800">
                  <span className="font-medium text-stone-500">{ANALISE_LABEL[item.kind].acao}: </span>
                  {item.acao}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
