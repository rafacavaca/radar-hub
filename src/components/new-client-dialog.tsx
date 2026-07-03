"use client";

/**
 * NOVO CLIENTE (global) — o "+ Novo cliente" mora no rodapé da sidebar, não
 * dentro de um cliente (o cadastro é uma ação da AGÊNCIA, não da conta).
 *
 * `NewClientButton` é o gatilho (adapta-se à sidebar recolhida: vira um "+");
 * `NewClientDialog` é o diálogo com o form. Escolhe dos workspaces reais do
 * Formare (o nome precisa casar pra Brain/cards baterem) ou digita à mão.
 * POST {action:"add-client"} -> /api/watchlist; ao criar, navega pro cliente.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

const INPUT_CLASS =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

function PlusIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function NewClientButton({
  clients,
  collapsed = false,
}: {
  clients: string[];
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          data-testid="new-client"
          onClick={() => setOpen(true)}
          title="Novo cliente"
          aria-label="Novo cliente"
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <PlusIcon />
        </button>
      ) : (
        <button
          type="button"
          data-testid="new-client"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          <PlusIcon />
          Novo cliente
        </button>
      )}
      {open ? <NewClientDialog clients={clients} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NewClientDialog({ clients, onClose }: { clients: string[]; onClose: () => void }) {
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

  // Escape fecha o diálogo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = (available ?? []).filter((name) => !clients.includes(name));
  const clientName = (choice || manual).trim();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !clientName) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-client", clientName }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não foi possível adicionar o cliente.");
        setPending(false);
        return;
      }
      // fecha, navega pro cliente novo e re-lê a sidebar (server component).
      onClose();
      router.push(`/visao?cliente=${encodeURIComponent(clientName)}`);
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente de novo.");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Novo cliente"
    >
      <div
        className="w-full max-w-md rounded-lg border border-stone-200 bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-stone-900">Novo cliente</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={add} className="px-5 py-4">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

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

          <label className="mt-3 block">
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

          <p className="mt-3 text-xs text-stone-400">
            O cliente novo nasce com as 3 lentes padrão e sem concorrentes — depois é só adicionar
            quem vigiar na aba Concorrentes.
          </p>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[36px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !clientName}
              className="inline-flex min-h-[36px] items-center rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
            >
              {pending ? "Adicionando…" : "Adicionar cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
