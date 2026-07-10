"use client";

/**
 * DOSSIÊ na tela (F1) — mobile-first, EDITORIAL (feedback do Rafael: texto mais
 * atraente). Cada seção é escaneável com hierarquia real: lead do perfil,
 * produtos como chips, ângulo de abertura como callout, ganchos/dores em cards,
 * perguntas numeradas. Papel quente, Archivo, vermelho só de acento.
 *
 * Honestidade em cada ponto (selo natureza + fonte). Concorrentes são CURÁVEIS
 * (indicar/validar) via ConcorrentesEditor — a descoberta sugere, o vendedor manda.
 */

import { useState } from "react";

import { SourceRef } from "@/components/signal-meta";
import { ConcorrentesEditor } from "@/components/prospects/concorrentes-editor";
import { SeloNatureza } from "@/components/prospects/ponto";
import { formatDateShort } from "@/lib/format";
import type { ConcorrenteExibido, Dossie } from "@/lib/prospects/schema";

const BRAIN_LABEL: Record<Dossie["encaixe"]["brain_mode"], { txt: string; cls: string }> = {
  live: { txt: "oferta do Brain real", cls: "bg-emerald-50 text-emerald-700" },
  fixture: { txt: "oferta de rascunho — confirmar no Brain", cls: "bg-amber-50 text-amber-800" },
  none: { txt: "sem Brain deste cliente — encaixe em branco", cls: "bg-stone-100 text-stone-500" },
};

/** dot de cor por tipo de sinal (só ritmo visual — a fonte segue explícita). */
const TIPO_COR: Record<string, string> = {
  expansão: "bg-emerald-500",
  contratação: "bg-blue-500",
  produto: "bg-violet-500",
  rodada: "bg-amber-500",
  parceria: "bg-teal-500",
  notícia: "bg-stone-400",
};

function Secao({
  titulo,
  contagem,
  children,
  abreto = false,
  destaque = false,
}: {
  titulo: string;
  contagem?: number;
  children: React.ReactNode;
  abreto?: boolean;
  destaque?: boolean;
}) {
  const [open, setOpen] = useState(abreto);
  return (
    <section className={"overflow-hidden rounded-xl border " + (destaque ? "border-red-100 bg-gradient-to-b from-red-50/50 to-white" : "border-stone-200 bg-white")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
      >
        <span className="flex items-center gap-2">
          {destaque ? <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500" /> : null}
          <span className={"text-[12px] font-bold uppercase tracking-[0.08em] " + (destaque ? "text-red-700" : "text-stone-500")}>
            {titulo}
          </span>
          {contagem !== undefined ? <span className="rounded-full bg-stone-100 px-1.5 text-[11px] font-semibold tabular-nums text-stone-500">{contagem}</span> : null}
        </span>
        <span aria-hidden className={"text-stone-300 transition-transform " + (open ? "rotate-90" : "")}>▸</span>
      </button>
      {open ? <div className="border-t border-stone-100 px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

/** Card curto pra gancho/dor — ícone + texto, com um leve tom. */
function CardEncaixe({ icone, texto, tom }: { icone: string; texto: string; tom: "gancho" | "dor" }) {
  return (
    <div className={"flex gap-2.5 rounded-lg border p-3 " + (tom === "gancho" ? "border-stone-200 bg-white" : "border-amber-100 bg-amber-50/40")}>
      <span aria-hidden className="mt-0.5 shrink-0 text-[15px]">{icone}</span>
      <p className="text-[13.5px] leading-relaxed text-stone-700">{texto}</p>
    </div>
  );
}

export function DossieView({
  dossie,
  cliente,
  prospectId,
  concorrentes,
}: {
  dossie: Dossie;
  cliente: string;
  prospectId: string;
  concorrentes: ConcorrenteExibido[];
}) {
  const d = dossie;
  const brain = BRAIN_LABEL[d.encaixe.brain_mode];
  const encaixeVazio = d.encaixe.ganchos.length === 0 && d.encaixe.dores.length === 0 && !d.encaixe.angulo;

  return (
    <div className="space-y-3">
      {/* PERFIL — lead editorial */}
      <Secao titulo="Perfil da empresa" abreto>
        <p className="text-[15px] leading-relaxed text-stone-800">
          {d.perfil.resumo.texto} <SeloNatureza natureza={d.perfil.resumo.natureza} />
          {d.perfil.resumo.fonte_url ? <SourceRef url={d.perfil.resumo.fonte_url} className="ml-1" /> : null}
        </p>
        {d.perfil.tagline?.texto ? (
          <p className="mt-2 border-l-2 border-stone-200 pl-3 text-[15px] italic leading-snug text-stone-500">“{d.perfil.tagline.texto}”</p>
        ) : null}

        {d.perfil.produtos.length > 0 ? (
          <div className="mt-3.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">Soluções</p>
            <div className="flex flex-wrap gap-1.5">
              {d.perfil.produtos.map((p, i) =>
                p.fonte_url ? (
                  <a key={i} href={p.fonte_url} target="_blank" rel="noreferrer" title={p.texto} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[12.5px] text-stone-700 transition-colors hover:border-stone-300 hover:bg-white">
                    {p.texto}
                  </a>
                ) : (
                  <span key={i} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[12.5px] text-stone-700">{p.texto}</span>
                ),
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-100 pt-2.5 text-[12px] text-stone-400">
          {d.perfil.porte?.texto ? (
            <span className="flex items-center gap-1.5"><span className="font-semibold text-stone-600">Porte:</span> {d.perfil.porte.texto} <SeloNatureza natureza={d.perfil.porte.natureza} /></span>
          ) : null}
          {d.perfil.paginas_lidas.length > 0 ? <span>lido de {d.perfil.paginas_lidas.length} página(s)</span> : null}
        </div>
      </Secao>

      {/* CONCORRENTES — CURÁVEL */}
      <Secao titulo="Concorrentes dela" contagem={concorrentes.length} abreto>
        <ConcorrentesEditor cliente={cliente} id={prospectId} concorrentes={concorrentes} />
      </Secao>

      {/* SINAIS RECENTES */}
      <Secao titulo="Sinais recentes" contagem={d.sinais.length}>
        {d.sinais.length === 0 ? (
          <p className="text-sm text-stone-400">Sem movimentos públicos recentes encontrados.</p>
        ) : (
          <ul className="space-y-3">
            {d.sinais.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (TIPO_COR[s.tipo] ?? "bg-stone-400")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-stone-900">{s.titulo}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-stone-400">
                    <span className="uppercase tracking-wide">{s.tipo}</span>
                    {s.data ? <span className="tabular-nums">{formatDateShort(s.data)}</span> : null}
                    <SourceRef url={s.fonte_url} titulo={s.fonte_titulo} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* COMO NÓS ENCAIXAMOS — destaque editorial */}
      <Secao titulo="Como nós encaixamos" destaque abreto>
        <span className={"inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold " + brain.cls}>{brain.txt}</span>
        {encaixeVazio ? (
          <p className="mt-3 text-sm text-stone-500">
            Sem encaixe mapeado {d.encaixe.brain_mode === "none" ? "— este cliente não tem Brain no Formare." : "— nada claro cruzou com a nossa oferta."}
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {d.encaixe.angulo ? (
              <div className="rounded-lg border-l-[3px] border-red-500 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-red-700">Ângulo de abertura</p>
                <p className="mt-1 text-[15px] font-medium leading-relaxed text-stone-900">{d.encaixe.angulo.texto}</p>
              </div>
            ) : null}
            {d.encaixe.ganchos.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Ganchos de conversa</p>
                <div className="grid gap-2">
                  {d.encaixe.ganchos.map((g, i) => <CardEncaixe key={i} icone="🎣" texto={g.texto} tom="gancho" />)}
                </div>
              </div>
            ) : null}
            {d.encaixe.dores.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Dores prováveis</p>
                <div className="grid gap-2">
                  {d.encaixe.dores.map((p, i) => <CardEncaixe key={i} icone="⚠️" texto={p.texto} tom="dor" />)}
                </div>
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 text-[11px] text-stone-400">
              <SeloNatureza natureza="inferencia" /> cruzamento do perfil com a nossa oferta (Brain) — valide antes de usar.
            </p>
          </div>
        )}
      </Secao>

      {/* MUNIÇÃO */}
      <Secao titulo="Munição de reunião" abreto>
        {d.municao.perguntas.length === 0 && d.municao.objecoes.length === 0 ? (
          <p className="text-sm text-stone-400">Sem munição gerada nesta rodada.</p>
        ) : (
          <div className="space-y-4">
            {d.municao.perguntas.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Perguntas pra fazer</p>
                <ol className="space-y-2">
                  {d.municao.perguntas.map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-stone-700">
                      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">{i + 1}</span>
                      <span>{p.texto}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {d.municao.objecoes.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Objeções prováveis &amp; resposta</p>
                <ul className="space-y-2">
                  {d.municao.objecoes.map((o, i) => (
                    <li key={i} className="rounded-lg border border-stone-200 bg-white px-3.5 py-2.5">
                      <p className="text-[13.5px] font-medium italic text-stone-500">“{o.objecao}”</p>
                      <p className="mt-1 text-[13.5px] leading-snug text-stone-800"><span className="font-semibold text-emerald-700">→</span> {o.resposta}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-stone-400">
              <SeloNatureza natureza="inferencia" /> munição é sugestão do Radar — adapte ao seu contexto.
            </p>
          </div>
        )}
      </Secao>

      {/* transparência da base */}
      {d.observacoes.length > 0 ? (
        <div className="rounded-xl border border-stone-200 bg-stone-100/60 px-4 py-3 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">Transparência da base</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stone-500">
            {d.observacoes.map((o, i) => <li key={i}>· {o}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
