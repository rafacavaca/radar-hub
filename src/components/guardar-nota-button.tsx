"use client";

/**
 * Botão "Guardar nota de roadmap" — a AÇÃO da lente PRODUTO (F6).
 * Diferente das outras lentes (card no Formare), produto é INTERNO: a leitura
 * vira uma nota no banco próprio do Radar, listada na própria visão Produto.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GuardarNotaButton({ readingId }: { readingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    if (state === "saving") return;
    setState("saving");
    try {
      const res = await fetch("/api/roadmap-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("saved");
      router.refresh(); // a lista "Notas guardadas" da visão Produto atualiza.
    } catch {
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <span aria-hidden>✓</span> Nota guardada
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {state === "error" ? (
        <span className="text-xs text-red-600">falhou, tente de novo</span>
      ) : null}
      <button
        type="button"
        data-testid="guardar-nota"
        onClick={save}
        disabled={state === "saving"}
        className="inline-flex items-center rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "saving" ? "Guardando…" : "Guardar nota de roadmap"}
      </button>
    </span>
  );
}
