"use client";

/**
 * AÇÕES DO BRIEFING (ritual F1) — o inbox se processa: Atuado / Adiar / Ignorar.
 * Marca o estado via /api/briefing e re-renderiza a tela Hoje (router.refresh).
 * Adiar envia o SNAPSHOT do item — é ele que volta amanhã.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DigestItem } from "@/lib/digest";

const BOTOES: Array<{ estado: "atuado" | "adiado" | "ignorado"; rotulo: string; title: string }> = [
  { estado: "atuado", rotulo: "✓ Atuado", title: "Fiz algo com isto — sai do inbox" },
  { estado: "adiado", rotulo: "→ Amanhã", title: "Volta no digest de amanhã" },
  { estado: "ignorado", rotulo: "× Ignorar", title: "Não é relevante — sai do inbox" },
];

export function BriefingItemActions({ item }: { item: DigestItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(estado: "atuado" | "adiado" | "ignorado") {
    setBusy(estado);
    setErro(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, estado, item }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao marcar");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao marcar");
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {BOTOES.map((b) => (
        <button
          key={b.estado}
          type="button"
          title={b.title}
          disabled={busy !== null}
          onClick={() => marcar(b.estado)}
          className={
            "rounded-md border px-2 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 " +
            (b.estado === "atuado"
              ? "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
              : "border-transparent text-stone-400 hover:bg-stone-100 hover:text-stone-700")
          }
        >
          {busy === b.estado ? "…" : b.rotulo}
        </button>
      ))}
      {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
    </div>
  );
}
