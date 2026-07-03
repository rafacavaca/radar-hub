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
import { useEffect, useState, type FormEvent } from "react";

import type { SourceCandidate } from "@/lib/discovery";
import type { Competitor, SourceKind, WatchClient, Watchlist } from "@/lib/watchlist";

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
      sources?: Array<{ kind: SourceKind; url: string }>;
    }
  | { action: "remove"; clientName: string; competitorId: string }
  | { action: "toggle"; clientName: string; competitorId: string; enabled: boolean }
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

export function WatchlistEditor({ initial }: { initial: Watchlist }) {
  if (initial.clients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
        <p className="text-base font-medium text-stone-700">Nenhum cliente configurado.</p>
        <p className="mt-1 text-sm text-stone-500">
          Os clientes do Radar aparecem aqui assim que forem configurados.
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
        />
      ))}
      <AddClientBlock existing={initial.clients.map((c) => c.name)} />
    </div>
  );
}

function ClientCard({ client, removable }: { client: WatchClient; removable: boolean }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
            className="inline-flex min-h-[40px] items-center rounded-full px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            {removing ? "Removendo…" : "Remover cliente"}
          </button>
        ) : null}
      </div>

      {client.competitors.length > 0 ? (
        <ul className="divide-y divide-stone-100">
          {client.competitors.map((competitor) => (
            <CompetitorRow key={competitor.id} clientName={client.name} competitor={competitor} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-stone-500 sm:px-5">
          Nenhum concorrente vigiado ainda. Adicione o primeiro abaixo.
        </p>
      )}

      <AddCompetitorFlow clientName={client.name} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O fluxo de adicionar: nome+site -> descobrir -> confirmar (manual = avançado)
// ─────────────────────────────────────────────────────────────────────────────

type Candidate = SourceCandidate & { checked: boolean };

function AddCompetitorFlow({ clientName }: { clientName: string }) {
  const router = useRouter();

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
      .map((c) => ({ kind: c.kind, url: c.url }));

    const result = await postWatchlist({
      action: "add",
      clientName,
      name,
      siteUrl: siteUrl.trim() || undefined,
      blogUrl: manualUrl.trim() || undefined,
      sources: chosen.length > 0 ? chosen : undefined,
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
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Nome do concorrente
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: RD Station"
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
          className="inline-flex min-h-[40px] items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
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
          className="inline-flex min-h-[40px] items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "add" ? "Adicionando…" : "Adicionar à vigilância"}
        </button>
      </div>

      <p className="mt-3 text-xs text-stone-400">
        Digite nome + site e clique em “Descobrir fontes”. Adicionou alguém? Vá ao Briefing e use
        “Rodar agora” para varrer já.
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Adicionar CLIENTE (F7 — multi-cliente): escolhe dos workspaces reais do
// Formare (o nome precisa casar pra Brain/cards baterem) ou digita à mão.
// ─────────────────────────────────────────────────────────────────────────────

function AddClientBlock({ existing }: { existing: string[] }) {
  const router = useRouter();
  const [available, setAvailable] = useState<string[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Busca os workspaces do Formare uma vez (porta fora do ar -> campo manual).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/formare-workspaces");
        const payload = (await res.json().catch(() => null)) as {
          data?: { workspaces?: string[]; warning?: string };
        } | null;
        if (!alive) return;
        setAvailable(payload?.data?.workspaces ?? []);
        setWarning(payload?.data?.warning ?? null);
      } catch {
        if (!alive) return;
        setAvailable([]);
        setWarning("não consegui falar com o Formare agora");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const options = (available ?? []).filter((name) => !existing.includes(name));
  const clientName = (choice || manual).trim();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !clientName) return;
    setPending(true);
    setError(null);
    const result = await postWatchlist({ action: "add-client", clientName });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setChoice("");
    setManual("");
    router.refresh();
    setPending(false);
  }

  return (
    <form
      data-testid="add-client"
      onSubmit={add}
      className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-4 sm:px-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Adicionar cliente
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Clientes do Formare
          </span>
          <select
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
              if (event.target.value) setManual("");
            }}
            className={INPUT_CLASS}
          >
            <option value="">
              {available === null
                ? "carregando…"
                : options.length === 0
                  ? "nenhum disponível"
                  : "escolha um cliente…"}
            </option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {warning ? <span className="mt-1 block text-xs text-amber-700">{warning}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-500">
            Ou digite o nome (precisa ser igual ao do Formare)
          </span>
          <input
            type="text"
            value={manual}
            onChange={(event) => {
              setManual(event.target.value);
              if (event.target.value) setChoice("");
            }}
            placeholder="Ex.: Arosco Alimentos"
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending || !clientName}
          className="inline-flex min-h-[40px] items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "Adicionando…" : "Adicionar cliente"}
        </button>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        O cliente novo nasce com as 3 lentes padrão e sem concorrentes — adicione quem vigiar no
        card dele acima.
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Linha de concorrente: nome, fontes registradas, pausar/reativar, remover
// ─────────────────────────────────────────────────────────────────────────────

function CompetitorRow({
  clientName,
  competitor,
}: {
  clientName: string;
  competitor: Competitor;
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
          {competitor.sources.map((source) => (
            <a
              key={source.id}
              data-testid="watchlist-source"
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.url}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 underline-offset-2 hover:bg-stone-200 hover:underline"
            >
              {KIND_CHIP[source.kind]}
              {source.kind === "produto" || source.kind === "vagas" ? (
                <span className="text-stone-400">· em breve</span>
              ) : null}
            </a>
          ))}
          {competitor.sources.length === 0 ? (
            <span className="text-xs text-stone-400">sem fontes — adicione uma URL manual</span>
          ) : null}
        </div>
        {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          data-testid="watchlist-toggle"
          onClick={toggle}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {busy === "toggle" ? (paused ? "Reativando…" : "Pausando…") : paused ? "Reativar" : "Pausar"}
        </button>
        <button
          type="button"
          data-testid="watchlist-remove"
          onClick={remove}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-full px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          {busy === "remove" ? "Removendo…" : "Remover"}
        </button>
      </div>
    </li>
  );
}
