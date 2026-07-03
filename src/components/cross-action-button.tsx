"use client";

/**
 * Ação de um insight Interno × Externo (F9). Conforme o veredito:
 *  - ja_temos           -> "Gerar no Formare" (go-to-market: você já tem, o
 *                          mercado quer — vira conteúdo/argumento);
 *  - meio_pronto / gap  -> "Guardar oportunidade" (nota de roadmap interna);
 *  - sem_dado_interno   -> sem ação (a UI mostra o convite a enriquecer o Brain).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CrossVerdict } from "@/lib/cross-reference";

export function CrossActionButton({
  insightId,
  verdict,
}: {
  insightId: string;
  verdict: CrossVerdict;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  if (verdict === "sem_dado_interno") return null;

  const isFormare = verdict === "ja_temos";
  const label = isFormare ? "Gerar no Formare" : "Guardar oportunidade";

  async function run() {
    if (state === "busy") return;
    setState("busy");
    setCardUrl(null);
    try {
      const res = await fetch("/api/cross-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightId, action: isFormare ? "formare" : "nota" }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { kind?: string; mode?: string; ok?: boolean; cardUrl?: string };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setState("error");
        return;
      }
      if (isFormare && payload.data.mode === "live" && payload.data.cardUrl) {
        setCardUrl(payload.data.cardUrl);
      }
      setState("done");
      if (!isFormare) router.refresh(); // a nota aparece na visão Produto.
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <span aria-hidden>✓</span>
        {isFormare ? (
          cardUrl ? (
            <>
              Criado no Formare —{" "}
              <a href={cardUrl} target="_blank" rel="noreferrer" className="underline">
                abrir ↗
              </a>
            </>
          ) : (
            "preparado (porta desligada)"
          )
        ) : (
          "Oportunidade guardada"
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {state === "error" ? <span className="text-xs text-red-600">falhou, tente de novo</span> : null}
      <button
        type="button"
        data-testid="cross-action"
        onClick={run}
        disabled={state === "busy"}
        className="inline-flex items-center rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "busy" ? "…" : label}
      </button>
    </span>
  );
}
