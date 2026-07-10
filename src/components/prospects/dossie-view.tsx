"use client";

/**
 * DOSSIÊ na tela (F1) — mobile-first, no espírito do card enxuto do redesign:
 * cada seção é uma manchete escaneável com o conteúdo expansível; "Como nós
 * encaixamos" e "Munição" abrem por padrão (é o que o vendedor usa). Papel
 * quente, Archivo, vermelho só de acento. Honestidade em cada ponto (selo+fonte).
 */

import { useState } from "react";

import { SourceRef } from "@/components/signal-meta";
import { PontoLinha, SeloNatureza } from "@/components/prospects/ponto";
import { formatDateShort } from "@/lib/format";
import type { Dossie } from "@/lib/prospects/schema";

const BRAIN_LABEL: Record<Dossie["encaixe"]["brain_mode"], { txt: string; cls: string }> = {
  live: { txt: "oferta do Brain real", cls: "bg-emerald-50 text-emerald-700" },
  fixture: { txt: "oferta de rascunho — confirmar no Brain", cls: "bg-amber-50 text-amber-800" },
  none: { txt: "sem Brain deste cliente — encaixe em branco", cls: "bg-stone-100 text-stone-500" },
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
    <section className={"overflow-hidden rounded-lg border " + (destaque ? "border-red-100 bg-red-50/30" : "border-stone-200 bg-white")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          {destaque ? <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500" /> : null}
          <span className={"text-[13px] font-semibold uppercase tracking-[0.06em] " + (destaque ? "text-red-700" : "text-stone-500")}>
            {titulo}
          </span>
          {contagem !== undefined ? <span className="text-[11px] tabular-nums text-stone-400">{contagem}</span> : null}
        </span>
        <span aria-hidden className={"text-stone-400 transition-transform " + (open ? "rotate-90" : "")}>▸</span>
      </button>
      {open ? <div className="border-t border-stone-100 px-4 py-3.5">{children}</div> : null}
    </section>
  );
}

export function DossieView({ dossie }: { dossie: Dossie }) {
  const d = dossie;
  const brain = BRAIN_LABEL[d.encaixe.brain_mode];
  const encaixeVazio = d.encaixe.ganchos.length === 0 && d.encaixe.dores.length === 0 && !d.encaixe.angulo;

  return (
    <div className="space-y-3">
      {/* PERFIL */}
      <Secao titulo="Perfil da empresa" abreto>
        <ul className="space-y-1.5">
          <PontoLinha ponto={d.perfil.resumo} />
          {d.perfil.tagline ? <PontoLinha ponto={d.perfil.tagline} /> : null}
          {d.perfil.porte ? <PontoLinha ponto={d.perfil.porte} /> : null}
        </ul>
        {d.perfil.produtos.length > 0 ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">Soluções</p>
            <ul className="mt-1.5 space-y-1.5">
              {d.perfil.produtos.map((p, i) => <PontoLinha key={i} ponto={p} />)}
            </ul>
          </div>
        ) : null}
        {d.perfil.paginas_lidas.length > 0 ? (
          <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
            Lido de {d.perfil.paginas_lidas.length} página(s) do site.
          </p>
        ) : null}
      </Secao>

      {/* CONCORRENTES */}
      <Secao titulo="Concorrentes dela" contagem={d.concorrentes.length}>
        {d.concorrentes.length === 0 ? (
          <p className="text-sm text-stone-400">A busca não trouxe concorrentes claros — não inventamos.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.concorrentes.map((c, i) => (
              <li key={i}>
                <p className="text-sm font-semibold text-stone-900">{c.nome}</p>
                <ul className="mt-0.5"><PontoLinha ponto={c.nota} /></ul>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* SINAIS RECENTES */}
      <Secao titulo="Sinais recentes" contagem={d.sinais.length}>
        {d.sinais.length === 0 ? (
          <p className="text-sm text-stone-400">Sem movimentos públicos recentes encontrados.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.sinais.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-stone-700">
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">{s.tipo}</span>
                <span className="font-medium text-stone-900">{s.titulo}</span>
                {s.data ? <span className="text-[11px] tabular-nums text-stone-400">{formatDateShort(s.data)}</span> : null}
                <SourceRef url={s.fonte_url} titulo={s.fonte_titulo} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* COMO NÓS ENCAIXAMOS — destaque */}
      <Secao titulo="Como nós encaixamos" destaque abreto>
        <span className={"inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold " + brain.cls}>{brain.txt}</span>
        {encaixeVazio ? (
          <p className="mt-2 text-sm text-stone-500">
            Sem encaixe mapeado {d.encaixe.brain_mode === "none" ? "— este cliente não tem Brain no Formare." : "— nada claro cruzou com a nossa oferta."}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {d.encaixe.angulo ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-red-700">Ângulo de abertura</p>
                <ul className="mt-1"><PontoLinha ponto={d.encaixe.angulo} /></ul>
              </div>
            ) : null}
            {d.encaixe.ganchos.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Ganchos de conversa</p>
                <ul className="mt-1 space-y-1.5">{d.encaixe.ganchos.map((g, i) => <PontoLinha key={i} ponto={g} />)}</ul>
              </div>
            ) : null}
            {d.encaixe.dores.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Dores prováveis</p>
                <ul className="mt-1 space-y-1.5">{d.encaixe.dores.map((p, i) => <PontoLinha key={i} ponto={p} />)}</ul>
              </div>
            ) : null}
          </div>
        )}
      </Secao>

      {/* MUNIÇÃO */}
      <Secao titulo="Munição de reunião" abreto>
        {d.municao.perguntas.length === 0 && d.municao.objecoes.length === 0 ? (
          <p className="text-sm text-stone-400">Sem munição gerada nesta rodada.</p>
        ) : (
          <div className="space-y-3">
            {d.municao.perguntas.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Perguntas pra fazer</p>
                <ul className="mt-1.5 space-y-1.5">
                  {d.municao.perguntas.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm leading-relaxed text-stone-700">
                      <span aria-hidden className="text-stone-300">•</span>
                      <span>{p.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.municao.objecoes.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">Objeções prováveis &amp; resposta</p>
                <ul className="mt-1.5 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                  {d.municao.objecoes.map((o, i) => (
                    <li key={i} className="px-3 py-2 text-sm">
                      <p className="italic text-stone-500">“{o.objecao}”</p>
                      <p className="mt-0.5 leading-snug text-stone-800">→ {o.resposta}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-stone-400">
              <SeloNatureza natureza="inferencia" /> munição é sugestão do Radar — adapte ao seu contexto.
            </p>
          </div>
        )}
      </Secao>

      {/* transparência da base */}
      {d.observacoes.length > 0 ? (
        <div className="rounded-lg border border-stone-200 bg-stone-100/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">Transparência da base</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stone-500">
            {d.observacoes.map((o, i) => <li key={i}>· {o}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
