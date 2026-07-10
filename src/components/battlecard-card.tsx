"use client";

/**
 * F1d/F3 — BATTLECARD redesenhado: cartão de sales-enablement no design system
 * (papel quente, Archivo, vermelho SÓ de acento — nada de dark). Hierarquia:
 *
 *   Quem são · Como se posicionam → Forças × Fraquezas → COMO GANHAR DELES
 *   (o destaque — é o que o vendedor usa) → Objeções & respostas → Mudanças
 *   recentes. CTA "Gerar no Formare" fixo no rodapé do card.
 *
 * HONESTIDADE (inalterada): cada afirmação com fonte; fato × opinião marcados
 * por selo; "como ganhar" sem cobertura do Brain É DITO ("sem diferencial nosso
 * mapeado"), nunca forçado; origem dos diferenciais rotulada (live/rascunho/nenhum).
 *
 * `BattlecardView` é PURA (testável em DOM sem router); `BattlecardCard` é o
 * wrapper interativo (gerar/abordagem/enviar via /api/diagnostico/battlecard).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Battlecard, Movimento, Posicionamento } from "@/lib/diagnostico/schema";
import { formatDateShort, formatDateTimePtBR } from "@/lib/format";

import { SourceRef } from "@/components/signal-meta";

const BRAIN_LABEL: Record<Battlecard["brain_mode"], { texto: string; cor: string }> = {
  live: { texto: "diferenciais do Brain real", cor: "bg-emerald-50 text-emerald-700" },
  fixture: { texto: "diferenciais de rascunho local — confirmar no Brain", cor: "bg-amber-50 text-amber-800" },
  none: { texto: "Brain sem dados deste cliente — sem 'como ganhar'", cor: "bg-stone-100 text-stone-500" },
};

/** Selo fato/opinião — mesma linguagem dos gráficos (um estilo por tipo). */
function SeloNatureza({ tipo }: { tipo: "fato" | "opiniao" }) {
  const op = tipo === "opiniao";
  return (
    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + (op ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700")}>
      {op ? "opinião" : "fato"}
    </span>
  );
}

function SecaoTitulo({ children, selo }: { children: React.ReactNode; selo?: "fato" | "opiniao" }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{children}</p>
      {selo ? <SeloNatureza tipo={selo} /> : null}
    </div>
  );
}

/** A VIEW pura do battlecard — todo o desenho, zero interação. */
export function BattlecardView({
  b,
  concorrenteNome,
  posicionamento,
  movimentos,
}: {
  b: Battlecard;
  concorrenteNome: string;
  /** do diagnóstico salvo — "como se posicionam" (fato, com fonte). */
  posicionamento?: Posicionamento;
  /** movimentos recentes do diagnóstico (mudanças reais, com data). */
  movimentos?: Movimento[];
}) {
  const tagline = posicionamento?.tagline?.status === "encontrado" ? posicionamento.tagline : null;
  const posic = posicionamento?.posicionamento?.status === "encontrado" ? posicionamento.posicionamento : null;
  const recentes = (movimentos ?? []).filter((m) => m.tipo !== "primeira_coleta").slice(0, 3);

  return (
    <div>
      {/* origem dos diferenciais (honestidade do Brain) */}
      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BRAIN_LABEL[b.brain_mode].cor}`}>
        {BRAIN_LABEL[b.brain_mode].texto}
      </span>

      {/* QUEM SÃO · COMO SE POSICIONAM — a abertura editorial */}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {b.quem_sao ? (
          <div>
            <SecaoTitulo selo="opiniao">Quem são</SecaoTitulo>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-700">{b.quem_sao}</p>
          </div>
        ) : null}
        {tagline?.valor || posic?.valor ? (
          <div>
            <SecaoTitulo selo="fato">Como se posicionam</SecaoTitulo>
            {tagline?.valor ? (
              <p className="mt-1.5 text-[17px] font-semibold leading-snug tracking-tight text-stone-900">
                “{tagline.valor}”
              </p>
            ) : null}
            {posic?.valor ? <p className="mt-1 text-sm leading-relaxed text-stone-600">{posic.valor}</p> : null}
            {(tagline?.fonte_url || posic?.fonte_url) ? (
              <p className="mt-1"><SourceRef url={(tagline?.fonte_url || posic?.fonte_url)!} /></p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* FORÇAS × FRAQUEZAS — itens curtos, fonte em cada um */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-4">
          <SecaoTitulo selo="opiniao">Forças (deles)</SecaoTitulo>
          <ul className="mt-2 space-y-2">
            {b.forcas.length === 0 ? <li className="text-sm text-stone-400">— sem evidência coletada</li> : null}
            {b.forcas.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-stone-700">
                <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">✓</span>
                <span>
                  {f.texto} {f.fonte_url ? <SourceRef url={f.fonte_url} /> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-4">
          <SecaoTitulo selo="opiniao">Fraquezas (deles)</SecaoTitulo>
          <ul className="mt-2 space-y-2">
            {b.fraquezas.length === 0 ? <li className="text-sm text-stone-400">— sem evidência coletada</li> : null}
            {b.fraquezas.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-stone-700">
                <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[10px] font-bold text-rose-800">–</span>
                <span>
                  {f.texto} {f.fonte_url ? <SourceRef url={f.fonte_url} /> : null}
                  {f.citacao ? <span className="mt-0.5 block border-l-2 border-stone-200 pl-2 text-xs italic text-stone-500">“{f.citacao.slice(0, 110)}”</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* COMO GANHAR DELES — O DESTAQUE (o que o vendedor usa) */}
      <div className="mt-5 rounded-lg border border-red-100 bg-red-50/40 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500" />
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-red-700">Como ganhar deles</p>
          <SeloNatureza tipo="opiniao" />
        </div>
        <div className="mt-3 space-y-2.5">
          {b.como_ganhar.length === 0 ? (
            <p className="text-sm text-stone-500">— sem fraqueza evidenciada pra cruzar com a nossa oferta</p>
          ) : null}
          {b.como_ganhar.map((g, i) => (
            <div key={i} className="rounded-lg border border-stone-200 bg-white p-3.5">
              <p className="text-sm leading-snug text-stone-700">
                <span className="font-semibold text-rose-800">Fraqueza deles:</span> {g.fraqueza}{" "}
                {g.fonte_url ? <SourceRef url={g.fonte_url} /> : null}
              </p>
              {g.nosso_diferencial ? (
                <>
                  <p className="mt-1.5 text-sm leading-snug text-stone-700">
                    <span className="font-semibold text-emerald-700">Nosso diferencial:</span> {g.nosso_diferencial}
                  </p>
                  {g.resposta ? (
                    <p className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm font-medium leading-relaxed text-stone-900">
                      💬 {g.resposta}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 text-sm italic text-stone-400">
                  sem diferencial nosso mapeado para esta fraqueza — alimentar o Brain
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* OBJEÇÕES & RESPOSTAS */}
      {b.objecoes.length > 0 ? (
        <div className="mt-5">
          <SecaoTitulo selo="opiniao">Objeções &amp; respostas</SecaoTitulo>
          <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {b.objecoes.map((o, i) => (
              <li key={i} className="px-4 py-2.5 text-sm">
                <p className="italic text-stone-500">“{o.objecao}”</p>
                <p className="mt-0.5 leading-snug text-stone-800">→ {o.resposta}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* MUDANÇAS RECENTES — o card é VIVO (fato, com data) */}
      {recentes.length > 0 ? (
        <div className="mt-5">
          <SecaoTitulo selo="fato">Mudanças recentes</SecaoTitulo>
          <ul className="mt-2 space-y-1.5">
            {recentes.map((m, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm text-stone-700">
                <span className="text-[11px] tabular-nums text-stone-400">{formatDateShort(m.data_deteccao)}</span>
                <span className="font-medium">{m.campo_label}:</span>
                <span>{m.de ?? "—"} → {m.para ?? "—"}</span>
                {m.fonte_url_para || m.fonte_url_de ? <SourceRef url={(m.fonte_url_para ?? m.fonte_url_de)!} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <span className="sr-only">{concorrenteNome}</span>
    </div>
  );
}

export function BattlecardCard({
  clientName,
  competitorId,
  concorrenteNome,
  battlecard,
  posicionamento,
  movimentos,
}: {
  clientName: string;
  competitorId: string;
  concorrenteNome: string;
  battlecard: Battlecard | null;
  posicionamento?: Posicionamento;
  movimentos?: Movimento[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "gerar" | "abordagem" | "enviar">(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  async function chamar(acao: "gerar" | "abordagem" | "enviar_formare") {
    setBusy(acao === "enviar_formare" ? "enviar" : acao);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/battlecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, competitorId, acao }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: { mode?: string; ok?: boolean }; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      if (acao === "enviar_formare") {
        setEnviado(payload?.data?.mode === "live" ? "✓ criado no Formare" : "✓ guardado (porta de escrita desligada)");
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou, tente de novo");
    } finally {
      setBusy(null);
    }
  }

  const b = battlecard;

  return (
    <section className="mt-2 rounded-lg border border-stone-200 bg-white shadow-sm">
      {/* cabeçalho editorial — papel, kicker + nome, ação primária à direita */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-4 py-3.5 sm:px-5">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Battlecard
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-stone-500">
              derivado — cada afirmação citada
            </span>
          </p>
          <h3 className="mt-0.5 text-[19px] font-bold tracking-tight text-stone-900">{concorrenteNome}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b ? <span className="text-[11px] text-stone-400">gerado {formatDateTimePtBR(b.gerado_em)}</span> : null}
          <button
            onClick={() => chamar("gerar")}
            disabled={busy !== null}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {busy === "gerar" ? "Gerando…" : b ? "Atualizar battlecard" : "Gerar battlecard"}
          </button>
        </div>
      </header>

      {erro ? <p className="px-4 pt-2 text-xs text-red-600 sm:px-5">{erro}</p> : null}

      {!b ? (
        <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">
          Sem battlecard ainda — gera a partir do diagnóstico salvo + Brain (rápido, sem nova varredura).
        </p>
      ) : (
        <>
          <div className="px-4 py-4 sm:px-5">
            <BattlecardView b={b} concorrenteNome={concorrenteNome} posicionamento={posicionamento} movimentos={movimentos} />
          </div>

          {/* rodapé de AÇÕES — abordagem + Gerar no Formare (o CTA, primário) */}
          <div className="border-t border-stone-100 bg-stone-50/60 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => chamar("abordagem")}
                disabled={busy !== null}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900 disabled:opacity-50"
              >
                {busy === "abordagem" ? "Escrevendo…" : b.abordagem ? "Reescrever abordagem" : "Rascunho de abordagem"}
              </button>
              {b.abordagem ? (
                <button
                  onClick={() => chamar("enviar_formare")}
                  disabled={busy !== null}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {busy === "enviar" ? "Enviando…" : "Gerar no Formare"}
                </button>
              ) : null}
              {enviado ? <span className="text-xs text-emerald-700">{enviado}</span> : null}
            </div>
            {b.abordagem ? (
              <pre className="mt-2.5 whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3.5 font-sans text-sm leading-relaxed text-stone-700">
                {b.abordagem.texto}
              </pre>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
