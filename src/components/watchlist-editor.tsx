"use client";

/**
 * WATCHLIST EDITOR — o painel client onde o Rafael edita a vigilância.
 *
 * Renderiza SEMPRE a partir de `initial` (props vindas do server component).
 * Cada mutação (adicionar / pausar / reativar / remover) fala com
 * `/api/watchlist` e, ao dar certo, chama `router.refresh()` — o server
 * component re-renderiza com a lista nova e volta como `initial`. Por isso NÃO
 * guardamos cópia da lista em estado: estado local é só para campos do
 * formulário, erro e "carregando". Erro da API aparece em pt-BR na própria
 * linha/formulário.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { Competitor, WatchClient, Watchlist } from "@/lib/watchlist";

/** O corpo aceito por POST /api/watchlist (espelha o contrato da rota). */
type WatchlistAction =
  | { action: "add"; clientName: string; name: string; blogUrl: string; siteUrl?: string }
  | { action: "remove"; clientName: string; competitorId: string }
  | { action: "toggle"; clientName: string; competitorId: string; enabled: boolean };

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

/** POST na API; normaliza o retorno em ok/erro pt-BR para a UI. */
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
        <ClientCard key={client.name} client={client} />
      ))}
    </div>
  );
}

function ClientCard({ client }: { client: WatchClient }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await postWatchlist({
      action: "add",
      clientName: client.name,
      name,
      blogUrl,
      siteUrl: siteUrl.trim() ? siteUrl : undefined,
    });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    setName("");
    setBlogUrl("");
    setSiteUrl("");
    router.refresh();
    setPending(false);
  }

  return (
    <div
      data-testid="watchlist-client"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Cliente</p>
        <p className="mt-0.5 font-semibold text-stone-900">{client.name}</p>
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

      <form
        data-testid="watchlist-add"
        onSubmit={onSubmit}
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
            <span className="mb-1 block text-xs font-medium text-stone-500">
              Blog ou página de notícias
            </span>
            <input
              type="text"
              inputMode="url"
              required
              value={blogUrl}
              onChange={(event) => setBlogUrl(event.target.value)}
              placeholder="https://…"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-stone-500">Site (opcional)</span>
            <input
              type="text"
              inputMode="url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://…"
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-[40px] items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-60"
          >
            {pending ? "Adicionando…" : "Adicionar à vigilância"}
          </button>
        </div>

        <p className="mt-3 text-xs text-stone-400">
          Adicionou alguém? Vá ao Briefing e use “Rodar agora” para varrer já.
        </p>
      </form>
    </div>
  );
}

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
      enabled: paused, // pausado -> reativa (true); ativo -> pausa (false)
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
        <a
          href={competitor.blogUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block truncate text-xs text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
        >
          {competitor.blogUrl}
        </a>
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
          {busy === "toggle"
            ? paused
              ? "Reativando…"
              : "Pausando…"
            : paused
              ? "Reativar"
              : "Pausar"}
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
