"use client";

/**
 * "Gerar relatório" (F3b) — compõe um BRIEFING DE RELACIONAMENTO da conta a
 * partir das jogadas dela (POST /api/reports action="compose-conta", LENTO:
 * chama o LLM) e o guarda. O relatório aparece na tela Relatórios (mesmo lugar
 * dos outros), com ler/Gerar no Formare/apagar.
 *
 * Estados honestos: idle -> gerando… -> "✓ criado — ver em Relatórios" (link);
 * erro (ex.: conta sem jogadas) -> mensagem curta e o botão volta.
 */

import Link from "next/link";
import { useState } from "react";

export function ContaReportButton({
  clientName,
  conta,
}: {
  clientName: string;
  conta: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function gerar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compose-conta", clientName, conta }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { id?: string };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível gerar o relatório.");
        return;
      }
      setDone(true);
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
        <span aria-hidden>✓</span> Relatório criado
        <Link
          href={`/relatorios?cliente=${encodeURIComponent(clientName)}`}
          className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
        >
          ver em Relatórios →
        </Link>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      <button
        type="button"
        data-testid="conta-report"
        onClick={gerar}
        disabled={busy}
        className="inline-flex items-center rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Gerando relatório…" : "Gerar relatório da conta"}
      </button>
    </span>
  );
}
