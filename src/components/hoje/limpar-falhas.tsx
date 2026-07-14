"use client";

/**
 * "Limpar falhas" da Transparência da base (Hoje). Apaga as falhas de coleta
 * que ficaram no histórico do dia (POST /api/hoje/limpar-falhas) — o que
 * coletou certo permanece. Só aparece quando há falhas.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LimparFalhas({ quantidade }: { quantidade: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (quantidade <= 0) return null;

  async function limpar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/hoje/limpar-falhas", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao limpar");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao limpar");
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={limpar}
        disabled={busy}
        className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-600 transition-colors hover:border-stone-900 hover:text-stone-900 disabled:opacity-50"
      >
        {busy ? "Limpando…" : `Limpar ${quantidade} falha${quantidade > 1 ? "s" : ""}`}
      </button>
      {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
    </span>
  );
}
