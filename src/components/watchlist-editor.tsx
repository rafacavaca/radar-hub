"use client";

/**
 * WATCHLIST EDITOR — o painel client onde o Rafael edita a vigilância.
 *
 * FLUXO NOVO (descoberta de fontes): ele digita só NOME + SITE do concorrente
 * -> "Descobrir fontes" fareja as páginas públicas (blog/notícias, novidades,
 * produto, vagas) -> os candidatos aparecem com checkbox (óbvios já marcados,
 * cada um com uma frase honesta) -> "Adicionar à vigilância".
 * A URL manual continua existindo como opção avançada — nunca trava.
 *
 * Renderiza SEMPRE a partir de `initial` (props do server component); cada
 * mutação chama a API e `router.refresh()`. Estado local só para o fluxo de
 * adicionar (passo, campos, candidatos, erro, loading).
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { SourceCandidate } from "@/lib/discovery";
import type { SourceStatus } from "@/lib/source-status";
import type { Competitor, EntityPillar, SourceKind, WatchClient, Watchlist } from "@/lib/watchlist";

/** Vocabulário por pilar — o MESMO fluxo, rótulos diferentes (concorrente × conta-chave). */
const VOCAB: Record<
  EntityPillar,
  {
    sing: string;
    plural: string;
    nomeLabel: string;
    placeholder: string;
    addCta: string;
    emptyRow: string;
    hint: string;
  }
> = {
  concorrente: {
    sing: "concorrente",
    plural: "concorrentes",
    nomeLabel: "Nome do concorrente",
    placeholder: "Ex.: RD Station",
    addCta: "Adicionar à vigilância",
    emptyRow: "Nenhum concorrente vigiado ainda. Adicione o primeiro abaixo.",
    hint: 'Digite nome + site e clique em "Descobrir fontes". Adicionou alguém? Vá ao Briefing e use "Rodar agora" para varrer já.',
  },
  "conta-chave": {
    sing: "conta-chave",
    plural: "contas-chave",
    nomeLabel: "Nome da conta",
    placeholder: "Ex.: Frigorífico Bom Gosto",
    addCta: "Adicionar conta-chave",
    emptyRow: "Nenhuma conta-chave vigiada ainda. Adicione a primeira abaixo.",
    hint: 'Digite nome + site e clique em "Descobrir fontes". Adicionou? Vá em Contas → Fichas e use "Rodar" pra varrer já.',
  },
};

/** Status por fonte (chave `${competitorId}:${sourceId}`) — F18, transparência. */
type StatusMap = Record<string, SourceStatus>;

/** Texto curto e honesto do status de uma fonte. */
function statusLabel(status: SourceStatus | undefined): { text: string; tone: "ok" | "quiet" | "bad" } | null {
  if (!status) return null; // nunca rodou — sem selo (a 1ª rodada cria)
  if (status.erro) return { text: "falhou", tone: "bad" };
  if (status.eventos > 0)
    return { text: `${status.eventos} ${status.eventos === 1 ? "sinal" : "sinais"}`, tone: "ok" };
  return { text: "sem novidade", tone: "quiet" };
}

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

const KIND_CHIP: Record<SourceKind, string> = {
  blog: "Blog",
  noticias: "Notícias",
  releases: "Novidades",
  produto: "Produto",
  vagas: "Vagas",
};

type WatchlistAction =
  | {
      action: "add";
      clientName: string;
      name: string;
      siteUrl?: string;
      blogUrl?: string;
      sources?: Array<{ kind: SourceKind; url: string; label?: string }>;
      pillar?: EntityPillar;
    }
  | { action: "remove"; clientName: string; competitorId: string }
  | { action: "toggle"; clientName: string; competitorId: string; enabled: boolean }
  | {
      action: "add-sources";
      clientName: string;
      competitorId: string;
      sources: Array<{ kind: SourceKind; url: string; label?: string }>;
    }
  | { action: "add-client"; clientName: string }
  | { action: "remove-client"; clientName: string };

/** POST na API da watchlist; normaliza o retorno em ok/erro pt-BR. */
async function postWatchlist(
  action: WatchlistAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (res.ok) return { ok: true };
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: payload?.error ?? "Não foi possível atualizar a vigilância." };
  } catch {
    return { ok: false, error: "Falha de conexão. Verifique a internet e tente de novo." };
  }
}

export function WatchlistEditor({
  initial,
  sourceStatus = {},
  pillar = "concorrente",
}: {
  initial: Watchlist;
  sourceStatus?: StatusMap;
  /** qual pilar este editor gerencia (concorrente | conta-chave). */
  pillar?: EntityPillar;
}) {
  if (initial.clients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
        <p className="text-base font-medium text-stone-700">Nenhum cliente ainda.</p>
        <p className="mt-1 text-sm text-stone-500">
          Use o <span className="font-medium text-stone-700">“+ Novo cliente”</span> no rodapé da
          barra lateral para cadastrar a primeira conta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {initial.clients.map((client) => (
        <ClientCard
          key={client.name}
          client={client}
          removable={initial.clients.length > 1}
          sourceStatus={sourceStatus}
          pillar={pillar}
        />
      ))}
    </div>
  );
}

function ClientCard({
  client,
  removable,
  sourceStatus,
  pillar,
}: {
  client: WatchClient;
  removable: boolean;
  sourceStatus: StatusMap;
  pillar: EntityPillar;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const vocab = VOCAB[pillar];
  // as entidades já vêm filtradas pelo pilar no server (a página escopa por pillarOf).
  const entities = client.competitors;

  async function removeClient() {
    if (removing) return;
    if (
      !window.confirm(
        `Remover "${client.name}" do Radar? Isso apaga só a vigilância daqui — não mexe em NADA no Formare.`,
      )
    ) {
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    const result = await postWatchlist({ action: "remove-client", clientName: client.name });
    if (!result.ok) {
      setRemoveError(result.error);
      setRemoving(false);
      return;
    }
    router.refresh();
    setRemoving(false);
  }

  return (
    <div
      data-testid="watchlist-client"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-4 sm:px-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Cliente</p>
          <p className="mt-0.5 font-semibold text-stone-900">{client.name}</p>
          {removeError ? <p className="mt-1 text-sm text-red-600">{removeError}</p> : null}
        </div>
        {removable ? (
          <button
            type="button"
            data-testid="remove-client"
            onClick={removeClient}
            disabled={removing}
            className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {removing ? "Removendo…" : "Remover cliente"}
          </button>
        ) : null}
      </div>

      {entities.length > 0 ? (
        <ul className="divide-y divide-stone-100">
          {entities.map((competitor) => (
            <CompetitorRow
              key={competitor.id}
              clientName={client.name}
              competitor={competitor}
              sourceStatus={sourceStatus}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-stone-500 sm:px-5">{vocab.emptyRow}</p>
      )}

      <AddCompetitorFlow clientName={client.name} pillar={pillar} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O fluxo de adicionar: nome+site -> descobrir -> confirmar (manual = avançado)
// ─────────────────────────────────────────────────────────────────────────────

type Candidate = SourceCandidate & { checked: boolean };

function AddCompetitorFlow({ clientName, pillar }: { clientName: string; pillar: EntityPillar }) {
  const router = useRouter();
  const vocab = VOCAB[pillar];

  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "discover" | "add">(null);

  function reset() {
    setName("");
    setSiteUrl("");
    setManualUrl("");
    setManualOpen(false);
    setCandidates(null);
    setNotice(null);
    setError(null);
  }

  /** Passo 1 -> 2: fareja o site e mostra os candidatos. */
  async function discover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("discover");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/discover-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { candidates: SourceCandidate[]; warning?: string };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível investigar o site.");
        return;
      }
      const found = payload.data.candidates.map((c) => ({ ...c, checked: c.preChecked }));
      setCandidates(found);
      if (payload.data.warning || found.length === 0) {
        setNotice(payload.data.warning ?? "Não achei fontes óbvias — use a URL manual abaixo.");
        setManualOpen(true);
      }
    } catch {
      setError("Falha de conexão ao investigar o site.");
    } finally {
      setBusy(null);
    }
  }

  /** Passo final: adiciona com as fontes confirmadas (e/ou a manual). */
  async function add() {
    if (busy) return;
    setBusy("add");
    setError(null);
    const chosen = (candidates ?? [])
      .filter((c) => c.checked)
      .map((c) => ({ kind: c.kind, url: c.url, label: c.titulo }));

    const result = await postWatchlist({
      action: "add",
      clientName,
      name,
      siteUrl: siteUrl.trim() || undefined,
      blogUrl: manualUrl.trim() || undefined,
      sources: chosen.length > 0 ? chosen : undefined,
      pillar,
    });

    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    reset();
    router.refresh();
    setBusy(null);
  }

  return (
    <form
      data-testid="watchlist-add"
      onSubmit={discover}
      className="border-t border-stone-100 px-4 py-4 sm:px-5"
    >
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">{vocab.nomeLabel}</span>
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={vocab.placeholder}
            className={INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">Site</span>
          <input
            type="text"
            inputMode="url"
            required={!manualOpen}
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder="concorrente.com.br"
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {/* Passo 2 — candidatos descobertos, com checkbox e frase honesta. */}
      {candidates !== null && candidates.length > 0 ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Fontes encontradas — confirme o que vigiar
          </p>
          <ul className="mt-2 space-y-2">
            {candidates.map((c, index) => (
              <li key={c.url} data-testid="watchlist-candidate">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={() =>
                      setCandidates((prev) =>
                        (prev ?? []).map((p, i) =>
                          i === index ? { ...p, checked: !p.checked } : p,
                        ),
                      )
                    }
                    className="mt-1 h-4 w-4 accent-stone-900"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-stone-900">{c.titulo}</span>
                      <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-xs text-stone-600">
                        {KIND_CHIP[c.kind]}
                        {c.kind === "produto" || c.kind === "vagas" ? " · por mudança" : ""}
                        {c.coletavel ? "" : " · em breve"}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-stone-400">{c.url}</span>
                    <span className="mt-0.5 block text-xs text-stone-500">{c.descricao}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? <p className="mt-3 text-sm text-amber-700">{notice}</p> : null}

      {/* Opção avançada — nunca travar o Rafael. */}
      {manualOpen ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-stone-500">
            URL manual (blog/notícias)
          </span>
          <input
            type="text"
            inputMode="url"
            value={manualUrl}
            onChange={(event) => setManualUrl(event.target.value)}
            placeholder="https://…"
            className={INPUT_CLASS}
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-3 text-xs text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
        >
          prefiro colar a URL do blog manualmente
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          data-testid="watchlist-discover"
          disabled={busy !== null || !siteUrl.trim()}
          className="inline-flex min-h-[40px] items-center rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          {busy === "discover" ? "Investigando o site…" : "Descobrir fontes"}
        </button>

        <button
          type="button"
          onClick={add}
          disabled={
            busy !== null ||
            !name.trim() ||
            (!(candidates ?? []).some((c) => c.checked) && !manualUrl.trim())
          }
          className="inline-flex min-h-[40px] items-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "add" ? "Adicionando…" : vocab.addCta}
        </button>
      </div>

      <p className="mt-3 text-xs text-stone-400">{vocab.hint}</p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// "Achar mais fontes" (F15): re-roda a descoberta profunda (com o entendimento
// do site) num concorrente EXISTENTE e oferece só as fontes NOVAS pra confirmar.
// ─────────────────────────────────────────────────────────────────────────────

function FindMoreSources({
  clientName,
  competitor,
}: {
  clientName: string;
  competitor: Competitor;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [state, setState] = useState<"idle" | "searching" | "adding">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!competitor.siteUrl) return null; // sem site não há o que farejar

  async function search() {
    if (state !== "idle") return;
    setState("searching");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/discover-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: competitor.siteUrl }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { candidates: SourceCandidate[] };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível investigar o site.");
        return;
      }
      // só o que ainda NÃO está registrado neste concorrente.
      const registered = new Set(competitor.sources.map((s) => s.url.replace(/\/$/, "")));
      const fresh = payload.data.candidates
        .filter((c) => !registered.has(c.url.replace(/\/$/, "")))
        .map((c) => ({ ...c, checked: c.preChecked }));
      setCandidates(fresh);
      if (fresh.length === 0) setNotice("Nada novo — as fontes conhecidas já estão registradas.");
    } catch {
      setError("Falha de conexão ao investigar o site.");
    } finally {
      setState("idle");
    }
  }

  async function add() {
    if (state !== "idle") return;
    const chosen = (candidates ?? [])
      .filter((c) => c.checked)
      .map((c) => ({ kind: c.kind, url: c.url, label: c.titulo }));
    if (chosen.length === 0) return;
    setState("adding");
    setError(null);
    const result = await postWatchlist({
      action: "add-sources",
      clientName,
      competitorId: competitor.id,
      sources: chosen,
    });
    if (!result.ok) {
      setError(result.error);
      setState("idle");
      return;
    }
    setCandidates(null);
    setNotice(`✓ ${chosen.length} fonte(s) adicionada(s)`);
    router.refresh();
    setState("idle");
  }

  return (
    <div className="mt-2">
      {candidates === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="find-more-sources"
            onClick={search}
            disabled={state !== "idle"}
            className="text-xs font-medium text-stone-400 underline-offset-2 hover:text-stone-700 hover:underline disabled:opacity-60"
          >
            {state === "searching" ? "Investigando o site (lendo a navegação)…" : "Achar mais fontes →"}
          </button>
          {notice ? <span className="text-xs text-emerald-700">{notice}</span> : null}
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-stone-400">{notice}</p>
      ) : (
        <div className="mt-1 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Fontes novas encontradas — confirme
          </p>
          <ul className="mt-2 space-y-1.5">
            {candidates.map((c, index) => (
              <li key={c.url}>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={() =>
                      setCandidates((prev) =>
                        (prev ?? []).map((p, i) => (i === index ? { ...p, checked: !p.checked } : p)),
                      )
                    }
                    className="mt-0.5 h-4 w-4 accent-stone-900"
                  />
                  <span className="min-w-0 text-xs">
                    <span className="font-medium text-stone-800">{c.titulo}</span>{" "}
                    <span className="rounded-full bg-stone-200/70 px-1.5 py-0.5 text-stone-600">
                      {KIND_CHIP[c.kind]}
                    </span>
                    <span className="mt-0.5 block truncate text-stone-400">{c.url}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={add}
              disabled={state !== "idle" || !candidates.some((c) => c.checked)}
              className="inline-flex min-h-[36px] items-center rounded-md bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-50"
            >
              {state === "adding"
                ? "Adicionando…"
                : `Adicionar ${candidates.filter((c) => c.checked).length} fonte(s)`}
            </button>
            <button
              type="button"
              onClick={() => setCandidates(null)}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// "Rodar" UM concorrente (F16): rodada parcial — coleta/analisa só ele e
// mescla no dia. O resto do briefing fica como está.
// ─────────────────────────────────────────────────────────────────────────────

function RunCompetitor({
  clientName,
  competitor,
  disabled,
}: {
  clientName: string;
  competitor: Competitor;
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (state !== "idle") return;
    setState("running");
    setNote(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/run?cliente=${encodeURIComponent(clientName)}&concorrente=${encodeURIComponent(competitor.id)}`,
        { cache: "no-store" },
      );
      const payload = (await res.json().catch(() => null)) as {
        resumo?: { eventos: number; leituras: number; jogadas?: number };
        error?: string;
      } | null;
      if (!res.ok) {
        setError(payload?.error ?? "não deu pra rodar agora");
        return;
      }
      const r = payload?.resumo;
      // leituras (lentes de concorrente) + jogadas (contas-chave) = análises geradas.
      const analises = r ? r.leituras + (r.jogadas ?? 0) : 0;
      setNote(
        r && (r.eventos > 0 || analises > 0)
          ? `✓ ${r.eventos} sinal(is), ${analises} análise(s) — veja no Briefing/Contas`
          : "✓ rodou — nada novo desta vez",
      );
      router.refresh();
    } catch {
      setError("falha de conexão");
    } finally {
      setState("idle");
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {note ? <span className="max-w-[180px] truncate text-xs text-emerald-700">{note}</span> : null}
      {error ? <span className="max-w-[160px] truncate text-xs text-red-600">{error}</span> : null}
      <button
        type="button"
        data-testid="run-competitor"
        onClick={run}
        disabled={disabled || state !== "idle" || !competitor.enabled}
        title={`Coleta e analisa só ${competitor.name} (o resto do dia fica como está)`}
        className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50"
      >
        {state === "running" ? "Rodando…" : "Rodar"}
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Linha de concorrente: nome, fontes registradas, pausar/reativar, remover
// ─────────────────────────────────────────────────────────────────────────────

function CompetitorRow({
  clientName,
  competitor,
  sourceStatus,
}: {
  clientName: string;
  competitor: Competitor;
  sourceStatus: StatusMap;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "toggle" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const paused = !competitor.enabled;

  async function toggle() {
    if (busy) return;
    setBusy("toggle");
    setError(null);
    const result = await postWatchlist({
      action: "toggle",
      clientName,
      competitorId: competitor.id,
      enabled: paused,
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(`Remover "${competitor.name}" da vigilância?`)) return;
    setBusy("remove");
    setError(null);
    const result = await postWatchlist({
      action: "remove",
      clientName,
      competitorId: competitor.id,
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
    <li
      data-testid="watchlist-competitor"
      className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={"font-medium " + (paused ? "text-stone-400" : "text-stone-900")}>
            {competitor.name}
          </span>
          {paused ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
              pausado
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {competitor.sources.map((source) => {
            const status = statusLabel(sourceStatus[`${competitor.id}:${source.id}`]);
            return (
              <a
                key={source.id}
                data-testid="watchlist-source"
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title={`${source.url}${status?.tone === "bad" ? ` — última rodada falhou` : ""}`}
                className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 underline-offset-2 hover:bg-stone-200 hover:underline"
              >
                {source.label ? (
                  <span className="max-w-[150px] truncate font-medium">{source.label}</span>
                ) : (
                  KIND_CHIP[source.kind]
                )}
                {source.kind === "produto" || source.kind === "vagas" ? (
                  <span className="text-stone-400">· por mudança</span>
                ) : null}
                {status ? (
                  <span
                    data-testid="source-status"
                    className={
                      status.tone === "ok"
                        ? "text-emerald-700"
                        : status.tone === "bad"
                          ? "text-red-600"
                          : "text-stone-400"
                    }
                  >
                    · {status.text}
                  </span>
                ) : null}
              </a>
            );
          })}
          {competitor.sources.length === 0 ? (
            <span className="text-xs text-stone-400">sem fontes — adicione uma URL manual</span>
          ) : null}
        </div>
        {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}

        <FindMoreSources clientName={clientName} competitor={competitor} />
      </div>

      <div className="flex flex-none items-center gap-1">
        <RunCompetitor clientName={clientName} competitor={competitor} disabled={busy !== null} />
        <button
          type="button"
          data-testid="watchlist-toggle"
          onClick={toggle}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {busy === "toggle" ? (paused ? "Reativando…" : "Pausando…") : paused ? "Reativar" : "Pausar"}
        </button>
        <button
          type="button"
          data-testid="watchlist-remove"
          onClick={remove}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          {busy === "remove" ? "Removendo…" : "Remover"}
        </button>
      </div>
    </li>
  );
}
