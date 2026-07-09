"use client";

/**
 * Botão "Gerar / Atualizar diagnóstico" — dispara as Lentes 1-2 pra UM
 * concorrente (POST /api/diagnostico) e regrava com data nova. LENTO (scrape +
 * LLM): avisa que leva ~1 min. Diagnóstico não é alta-frequência — rode sob demanda.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiagnosticoRunButton({
  clientName,
  competitorId,
  temDiagnostico,
}: {
  clientName: string;
  competitorId: string;
  temDiagnostico: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, competitorId }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível gerar o diagnóstico.");
        return;
      }
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="max-w-[220px] text-xs text-red-600">{error}</span> : null}
      <button
        type="button"
        data-testid="diagnostico-run"
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-[36px] items-center rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? "Lendo o site… (~1 min)"
          : temDiagnostico
            ? "Atualizar diagnóstico"
            : "Gerar diagnóstico"}
      </button>
    </span>
  );
}
