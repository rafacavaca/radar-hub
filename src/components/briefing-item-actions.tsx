"use client";

/**
 * AÇÕES DO BRIEFING (ritual F1) — o inbox se processa: Atuado / Amanhã / Ignorar.
 * Opera sobre TODOS os itens do sinal (um sinal pode ter várias leituras de
 * lente agrupadas): marca cada um via /api/briefing e re-renderiza (router.refresh).
 * Adiar leva o SNAPSHOT de cada item — é ele que volta amanhã.
 *
 * Compacto por padrão (moldura de software, não botões gordos): ícone + rótulo
 * curto; o hover explica.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import type { DigestItem } from "@/lib/digest";

type Estado = "atuado" | "adiado" | "ignorado";

const BOTOES: Array<{ estado: Estado; rotulo: string; icone: string; tip: string }> = [
  { estado: "atuado", rotulo: "Atuado", icone: "✓", tip: "Já cuidei — sai do inbox de hoje." },
  { estado: "adiado", rotulo: "Amanhã", icone: "→", tip: "Volta no digest de amanhã, íntegro." },
  { estado: "ignorado", rotulo: "Ignorar", icone: "×", tip: "Não é relevante — sai do inbox." },
];

export function BriefingItemActions({ items }: { items: DigestItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(estado: Estado) {
    setBusy(estado);
    setErro(null);
    try {
      for (const item of items) {
        const res = await fetch("/api/briefing", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: item.id, estado, item }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "falha ao marcar");
        }
      }
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao marcar");
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {BOTOES.map((b) => (
        <Tooltip key={b.estado} content={b.tip}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => marcar(b.estado)}
            className={
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 " +
              (b.estado === "atuado"
                ? "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
                : "border-transparent text-stone-400 hover:bg-stone-100 hover:text-stone-700")
            }
          >
            <span aria-hidden>{busy === b.estado ? "…" : b.icone}</span>
            <span className="hidden sm:inline">{b.rotulo}</span>
          </button>
        </Tooltip>
      ))}
      {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
    </div>
  );
}
