"use client";

/**
 * F1d — BATTLECARD na tela: o artefato comercial por concorrente, DERIVADO e
 * citado. Estados honestos: sem battlecard → gerar; "como ganhar" sem
 * cobertura do Brain → "sem diferencial nosso mapeado" (visível, não escondido);
 * origem dos diferenciais rotulada (Brain real / rascunho local / nenhum).
 * Botões: Gerar/Atualizar · Rascunho de abordagem · Enviar ao Formare.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Battlecard } from "@/lib/diagnostico/schema";
import { formatDateTimePtBR } from "@/lib/format";

import { SourceRef } from "@/components/signal-meta";

const BRAIN_LABEL: Record<Battlecard["brain_mode"], { texto: string; cor: string }> = {
  live: { texto: "diferenciais do Brain real", cor: "bg-emerald-50 text-emerald-700" },
  fixture: { texto: "diferenciais de rascunho local — confirmar no Brain", cor: "bg-amber-50 text-amber-800" },
  none: { texto: "Brain sem dados deste cliente — sem 'como ganhar'", cor: "bg-stone-100 text-stone-500" },
};

export function BattlecardCard({
  clientName,
  competitorId,
  concorrenteNome,
  battlecard,
}: {
  clientName: string;
  competitorId: string;
  concorrenteNome: string;
  battlecard: Battlecard | null;
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
    <section className="mt-2 rounded-2xl border border-stone-300 bg-stone-900 text-stone-100 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-700/60 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-400">
          Battlecard — {concorrenteNome}
          <span className="ml-2 rounded-full bg-stone-700/70 px-2 py-0.5 text-[10px] font-semibold text-stone-300">
            derivado — cada afirmação citada
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {b ? <span className="text-[11px] text-stone-500">gerado {formatDateTimePtBR(b.gerado_em)}</span> : null}
          <button
            onClick={() => chamar("gerar")}
            disabled={busy !== null}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy === "gerar" ? "Gerando…" : b ? "Atualizar battlecard" : "Gerar battlecard"}
          </button>
        </div>
      </header>

      {erro ? <p className="px-4 pt-2 text-xs text-red-400 sm:px-5">{erro}</p> : null}

      {!b ? (
        <p className="px-4 py-4 text-sm text-stone-400 sm:px-5">
          Sem battlecard ainda — gera a partir do diagnóstico salvo + Brain (rápido, sem nova varredura).
        </p>
      ) : (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BRAIN_LABEL[b.brain_mode].cor}`}>
            {BRAIN_LABEL[b.brain_mode].texto}
          </span>

          {b.quem_sao ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">Quem são</p>
              <p className="mt-1 text-sm text-stone-200">{b.quem_sao}</p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-500">Forças (deles)</p>
              <ul className="mt-1 space-y-1.5">
                {b.forcas.length === 0 ? <li className="text-sm text-stone-500">— sem evidência coletada</li> : null}
                {b.forcas.map((f, i) => (
                  <li key={i} className="text-sm text-stone-200">
                    {f.texto}{" "}
                    {f.fonte_url ? <SourceRef url={f.fonte_url} className="!text-stone-500 hover:!text-stone-300" /> : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-400">Fraquezas (deles)</p>
              <ul className="mt-1 space-y-1.5">
                {b.fraquezas.length === 0 ? <li className="text-sm text-stone-500">— sem evidência coletada</li> : null}
                {b.fraquezas.map((f, i) => (
                  <li key={i} className="text-sm text-stone-200">
                    {f.texto}{" "}
                    {f.fonte_url ? <SourceRef url={f.fonte_url} className="!text-stone-500 hover:!text-stone-300" /> : null}
                    {f.citacao ? <span className="mt-0.5 block text-xs italic text-stone-500">“{f.citacao.slice(0, 110)}”</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Como ganhar deles</p>
            <ul className="mt-1.5 space-y-2">
              {b.como_ganhar.length === 0 ? <li className="text-sm text-stone-500">— sem fraqueza evidenciada pra cruzar</li> : null}
              {b.como_ganhar.map((g, i) => (
                <li key={i} className="rounded-xl border border-stone-700/60 bg-stone-800/60 p-3">
                  <p className="text-sm text-stone-200">
                    <span className="text-red-400">Fraqueza:</span> {g.fraqueza}{" "}
                    {g.fonte_url ? <SourceRef url={g.fonte_url} className="!text-stone-500 hover:!text-stone-300" /> : null}
                  </p>
                  {g.nosso_diferencial ? (
                    <>
                      <p className="mt-1 text-sm text-stone-200">
                        <span className="text-emerald-500">Nosso diferencial:</span> {g.nosso_diferencial}
                      </p>
                      {g.resposta ? <p className="mt-1 text-sm text-stone-300"><span className="text-stone-500">Na conversa:</span> {g.resposta}</p> : null}
                    </>
                  ) : (
                    <p className="mt-1 text-sm italic text-stone-500">
                      sem diferencial nosso mapeado para esta fraqueza — alimentar o Brain
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {b.objecoes.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Objeções &amp; respostas</p>
              <ul className="mt-1.5 space-y-1.5">
                {b.objecoes.map((o, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-stone-400">“{o.objecao}”</span>
                    <span className="mt-0.5 block text-stone-200">→ {o.resposta}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Abordagem (rascunho de e-mail) */}
          <div className="border-t border-stone-700/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => chamar("abordagem")}
                disabled={busy !== null}
                className="rounded-lg border border-stone-600 bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 disabled:opacity-50"
              >
                {busy === "abordagem" ? "Escrevendo…" : b.abordagem ? "Reescrever abordagem" : "Rascunho de abordagem"}
              </button>
              {b.abordagem ? (
                <button
                  onClick={() => chamar("enviar_formare")}
                  disabled={busy !== null}
                  className="rounded-lg border border-stone-600 bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 disabled:opacity-50"
                >
                  {busy === "enviar" ? "Enviando…" : "Gerar no Formare"}
                </button>
              ) : null}
              {enviado ? <span className="text-xs text-emerald-500">{enviado}</span> : null}
            </div>
            {b.abordagem ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-stone-700/60 bg-stone-800/60 p-3 font-sans text-sm leading-relaxed text-stone-200">
                {b.abordagem.texto}
              </pre>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
