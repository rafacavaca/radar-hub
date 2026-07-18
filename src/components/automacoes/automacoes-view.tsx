"use client";

/**
 * PAINEL DE AUTOMAÇÕES — o lugar claro (pedido do Rafael) pra LIGAR cada rotina
 * e escolher a frequência/dia. Cada rotina é um cartão: um interruptor grande,
 * a frequência (todo dia / semanal + dia), a próxima execução e o que faz —
 * bem mais explícito que os toggles espalhados de antes. Default: tudo desligado.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Automacao, AutomacaoKind, AutomacoesConfig, Cadencia } from "@/lib/automacoes";
import { useRotulo } from "@/components/vocab-context";

const WEEKDAYS = [
  { v: 1, l: "segunda" }, { v: 2, l: "terça" }, { v: 3, l: "quarta" }, { v: 4, l: "quinta" },
  { v: 5, l: "sexta" }, { v: 6, l: "sábado" }, { v: 0, l: "domingo" },
];

async function patch(kind: AutomacaoKind, body: { enabled?: boolean; cadencia?: Cadencia }): Promise<AutomacoesConfig> {
  const res = await fetch("/api/automacoes", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, ...body }),
  });
  const json = (await res.json().catch(() => null)) as { data?: { config: AutomacoesConfig }; error?: string } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error ?? "falha ao salvar");
  return json.data.config;
}

function Switch({ on, busy, onChange }: { on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
        (on ? "bg-emerald-500" : "bg-stone-300")
      }
    >
      <span className={"inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " + (on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

function Cartao({
  kind,
  titulo,
  descricao,
  quando,
  automacao,
  proxima,
  onSaved,
}: {
  kind: AutomacaoKind;
  titulo: string;
  descricao: string;
  quando: string;
  automacao: Automacao;
  proxima: string;
  onSaved: (c: AutomacoesConfig) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const a = automacao;

  async function salvar(body: { enabled?: boolean; cadencia?: Cadencia }) {
    setBusy(true);
    setErro(null);
    try {
      onSaved(await patch(kind, body));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"rounded-xl border bg-white p-5 transition-colors " + (a.enabled ? "border-emerald-200" : "border-stone-200")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-stone-900">{titulo}</h2>
          <p className="mt-0.5 text-sm text-stone-500">{descricao}</p>
        </div>
        <Switch on={a.enabled} busy={busy} onChange={(v) => salvar({ enabled: v })} />
      </div>

      {a.enabled ? (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-wide text-stone-400">Frequência</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-stone-300">
              <button
                type="button"
                disabled={busy}
                onClick={() => salvar({ cadencia: { tipo: "diaria" } })}
                className={"px-3 py-1.5 text-sm font-medium transition-colors " + (a.cadencia.tipo === "diaria" ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50")}
              >
                Todo dia
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => salvar({ cadencia: { tipo: "semanal", weekday: a.cadencia.tipo === "semanal" ? a.cadencia.weekday : 1 } })}
                className={"border-l border-stone-300 px-3 py-1.5 text-sm font-medium transition-colors " + (a.cadencia.tipo === "semanal" ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50")}
              >
                Semanal
              </button>
            </div>

            {a.cadencia.tipo === "semanal" ? (
              <select
                value={a.cadencia.weekday}
                disabled={busy}
                onChange={(e) => salvar({ cadencia: { tipo: "semanal", weekday: Number(e.target.value) } })}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-500"
              >
                {WEEKDAYS.map((w) => (
                  <option key={w.v} value={w.v}>{w.l}</option>
                ))}
              </select>
            ) : null}
          </div>

          <p className="mt-3 text-[13px] text-stone-500">
            {quando} · <span className="font-medium text-stone-700">próxima: {proxima}</span>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-stone-400">Desligada — nada roda até você ligar.</p>
      )}

      {erro ? <p className="mt-2 text-xs text-red-600">{erro}</p> : null}
    </div>
  );
}

export function AutomacoesView({
  config,
  proximas,
}: {
  config: AutomacoesConfig;
  proximas: { digest: string; diagnostico: string };
}) {
  const router = useRouter();
  const r = useRotulo();
  const [cfg, setCfg] = useState(config);

  const onSaved = (c: AutomacoesConfig) => {
    setCfg(c);
    router.refresh(); // re-computa a "próxima execução" no servidor
  };

  return (
    <section className="mx-auto max-w-[720px] px-5 py-8 sm:px-6">
      <header className="mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Automações</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900">O que roda sozinho</h1>
        <p className="mt-1 text-sm text-stone-500">
          Por padrão, <span className="font-medium text-stone-700">nada varre sozinho</span>. Ligue só o que quiser e
          escolha quando. Você pode rodar tudo manualmente a qualquer momento em cada tela.
        </p>
      </header>

      <div className="mt-5 space-y-3">
        <Cartao
          kind="digest"
          titulo="Resumo do dia (Hoje)"
          descricao="Prepara o digest da manhã cruzando os clientes e, se o e-mail estiver configurado, envia pra você."
          quando="de manhã, a partir das 6h (horário de Brasília)"
          automacao={cfg.digest}
          proxima={proximas.digest}
          onSaved={onSaved}
        />
        <Cartao
          kind="diagnostico"
          titulo={`Varredura de ${r("concorrentes").toLocaleLowerCase("pt-BR")}`}
          descricao="Reexamina os concorrentes que têm ficha de diagnóstico e gera alertas quando algo muda (tagline, preço, produto…)."
          quando="de manhã, no dia escolhido"
          automacao={cfg.diagnostico}
          proxima={proximas.diagnostico}
          onSaved={onSaved}
        />
      </div>

      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-100/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Controladas por item (já opt-in)</p>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
          <li>
            <span className="font-medium text-stone-800">Relatórios agendados</span> — criados um a um em{" "}
            <Link href="/relatorios" className="text-red-700 underline-offset-2 hover:underline">Relatórios</Link>. Só roda o que você criar.
          </li>
          <li>
            <span className="font-medium text-stone-800">Dossiê de reunião</span> — preparado na véspera quando você marca a data no{" "}
            <Link href="/prospects" className="text-red-700 underline-offset-2 hover:underline">Prospect</Link>.
          </li>
        </ul>
      </div>
    </section>
  );
}
