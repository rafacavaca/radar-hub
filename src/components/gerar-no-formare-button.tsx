"use client";

/**
 * Botão "Gerar no Formare" (F4, formalizado) — o item vira um PEDIDO DE
 * TRABALHO (card em 'ideias') dentro do Formare, pela porta estreita.
 *
 * Estados honestos:
 * - porta de escrita LIGADA  -> "✓ Criado no Formare" + link "abrir ↗" pro card.
 * - porta de escrita DESLIGADA -> "guardado (porta desligada)" — o pedido fica
 *   na caixa de saída local, nada toca o Formare.
 * - erro -> mensagem curta e o botão volta.
 */

import { useState } from "react";

type Sent =
  | { kind: "live"; cardUrl: string }
  | { kind: "dry-run" }
  | null;

export function GerarNoFormareButton({ itemId }: { itemId: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send-to-formare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { mode?: string; ok?: boolean; cardUrl?: string };
        error?: string;
      } | null;

      if (!res.ok || !payload?.data?.ok) {
        setError(payload?.error ?? "falhou, tente de novo");
        return;
      }
      if (payload.data.mode === "live" && payload.data.cardUrl) {
        setSent({ kind: "live", cardUrl: payload.data.cardUrl });
      } else {
        setSent({ kind: "dry-run" });
      }
    } catch {
      setError("falhou, tente de novo");
    } finally {
      setSending(false);
    }
  }

  if (sent?.kind === "live") {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
        <span aria-hidden>✓</span> Criado no Formare
        <a
          href={sent.cardUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
        >
          abrir ↗
        </a>
      </span>
    );
  }
  if (sent?.kind === "dry-run") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500">
        <span aria-hidden>✓</span> guardado (porta desligada)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      <button
        type="button"
        data-testid="gerar-no-formare"
        onClick={send}
        disabled={sending}
        className="inline-flex items-center rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Criando…" : "Gerar no Formare"}
      </button>
    </span>
  );
}
