"use client";

/**
 * EDITOR DE ANALISTAS — o painel client onde o Rafael afina as três LENTES de
 * cada cliente (comercial, produto, marketing). É a "transparência dos agentes"
 * do Radar: ele vê a régua com que cada analista pensa e ajusta ali mesmo.
 *
 * Espelha os padrões do watchlist-editor: postJson -> router.refresh, estado
 * local POR LINHA (aqui, por lente) e classes stone. Renderiza SEMPRE a partir
 * de `initial` (props do server component); cada mutação chama /api/lenses e
 * `router.refresh()` — as props novas chegam e o estado local segue.
 *
 * De @/lib/lenses importa só TIPOS (o módulo usa node:fs; nada de valor em
 * runtime no cliente). Os rótulos de apresentação — nome, pergunta fixa e ação —
 * são re-declarados aqui, tipados contra as uniões da lib pra não sair de
 * sincronia nas chaves.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { LensActionKind, LensConfig, LensId, LensesFile } from "@/lib/lenses";

/** Mesmo estilo de input do watchlist-editor (a régua só acrescenta altura). */
const FIELD_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

/** Nome de cada lente (espelha LENS_LABEL da lib). */
const LENS_LABEL: Record<LensId, string> = {
  comercial: "Comercial",
  produto: "Produto",
  marketing: "Marketing",
};

/** A pergunta fixa que cada lente responde — a identidade dela (espelha LENS_QUESTION). */
const LENS_QUESTION: Record<LensId, string> = {
  comercial: "O que este movimento significa pra vender ou reter AGORA?",
  produto: "O que isto significa pro nosso produto e roadmap?",
  marketing: "O que isto significa pro nosso discurso, posicionamento e conteúdo?",
};

/** Rótulo humano de cada tipo de ação (espelha ACTION_LABEL). */
const ACTION_LABEL: Record<LensActionKind, string> = {
  abordagem: "Rascunho de abordagem (no Formare)",
  nota_roadmap: "Nota de roadmap (interna)",
  brief_conteudo: "Brief de conteúdo (no Formare)",
};

const ACTION_KINDS: readonly LensActionKind[] = ["abordagem", "nota_roadmap", "brief_conteudo"];

type LensesRequest =
  | {
      action: "update";
      clientName: string;
      lensId: LensId;
      patch: { enabled?: boolean; team?: string; regua?: string; action?: LensActionKind };
    }
  | { action: "reset"; clientName: string; lensId: LensId };

/** POST na API de lentes; normaliza o retorno em ok/erro pt-BR. */
async function postLenses(
  body: LensesRequest,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/lenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: payload?.error ?? "Não foi possível salvar esta área." };
  } catch {
    return { ok: false, error: "Falha de conexão. Verifique a internet e tente de novo." };
  }
}

export function LensConfigEditor({ initial }: { initial: LensesFile }) {
  if (initial.clients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
        <p className="text-base font-medium text-stone-700">Nenhum cliente configurado.</p>
        <p className="mt-1 text-sm text-stone-500">
          Cadastre um cliente em Monitorar e as três áreas aparecem aqui, já com a régua padrão.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {initial.clients.map((client) => (
        <ClientLensesCard
          key={client.clientName}
          clientName={client.clientName}
          lenses={client.lenses}
        />
      ))}
    </div>
  );
}

function ClientLensesCard({ clientName, lenses }: { clientName: string; lenses: LensConfig[] }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Cliente</p>
        <p className="mt-0.5 font-semibold text-stone-900">{clientName}</p>
      </div>

      <div className="divide-y divide-stone-100">
        {lenses.map((lens) => (
          <LensRow key={lens.id} clientName={clientName} lens={lens} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Uma lente: cabeçalho + toggle, pergunta fixa, régua, time, ação, salvar/reset
// ─────────────────────────────────────────────────────────────────────────────

function LensRow({ clientName, lens }: { clientName: string; lens: LensConfig }) {
  const router = useRouter();

  const [regua, setRegua] = useState(lens.regua);
  const [team, setTeam] = useState(lens.team);
  const [action, setAction] = useState<LensActionKind>(lens.action);

  const [busy, setBusy] = useState<null | "save" | "reset" | "toggle">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // As props novas chegam depois de salvar/resetar — o estado local segue.
  // (Um toggle não mexe nestes valores, então uma régua em edição é preservada.)
  useEffect(() => {
    setRegua(lens.regua);
    setTeam(lens.team);
    setAction(lens.action);
  }, [lens.regua, lens.team, lens.action]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const changed = regua !== lens.regua || team !== lens.team || action !== lens.action;

  function flashSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }

  async function save() {
    if (busy || !changed) return;
    setBusy("save");
    setError(null);
    const result = await postLenses({
      action: "update",
      clientName,
      lensId: lens.id,
      patch: { regua, team, action },
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    flashSaved();
    router.refresh();
    setBusy(null);
  }

  async function reset() {
    if (busy) return;
    if (!window.confirm("Restaurar a régua padrão desta área?")) return;
    setBusy("reset");
    setError(null);
    const result = await postLenses({ action: "reset", clientName, lensId: lens.id });
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    flashSaved();
    router.refresh();
    setBusy(null);
  }

  async function toggle() {
    if (busy) return;
    setBusy("toggle");
    setError(null);
    const result = await postLenses({
      action: "update",
      clientName,
      lensId: lens.id,
      patch: { enabled: !lens.enabled },
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div data-testid="lens-row" className="px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={"font-semibold " + (lens.enabled ? "text-stone-900" : "text-stone-400")}
            >
              {LENS_LABEL[lens.id]}
            </span>
            {!lens.enabled ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                desligada
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs italic text-stone-400">{LENS_QUESTION[lens.id]}</p>
        </div>

        <button
          type="button"
          data-testid="lens-toggle"
          onClick={toggle}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] flex-none items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          {busy === "toggle"
            ? lens.enabled
              ? "Desligando…"
              : "Ligando…"
            : lens.enabled
              ? "Desligar"
              : "Ligar"}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-stone-500">
          Régua de relevância — o que faz um sinal subir
        </span>
        <textarea
          data-testid="lens-regua"
          value={regua}
          onChange={(event) => setRegua(event.target.value)}
          rows={4}
          placeholder="Descreva, em linguagem simples, o que faz um sinal subir pra esta área."
          className={FIELD_CLASS + " min-h-[96px] resize-y"}
        />
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Time destinatário</span>
          <input
            type="text"
            value={team}
            onChange={(event) => setTeam(event.target.value)}
            placeholder="Ex.: Time de vendas / CS"
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Ação ao subir</span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as LensActionKind)}
            className={FIELD_CLASS}
          >
            {ACTION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ACTION_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="lens-save"
          onClick={save}
          disabled={busy !== null || !changed}
          className="inline-flex min-h-[40px] items-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "save" ? "Salvando…" : "Salvar"}
        </button>

        <button
          type="button"
          data-testid="lens-reset"
          onClick={reset}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          {busy === "reset" ? "Restaurando…" : "Restaurar padrão"}
        </button>

        {saved ? <span className="text-xs text-emerald-700">✓ salvo</span> : null}
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
