"use client";

/**
 * Botão de apagar uma nota de roadmap guardada (lista da visão Produto).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApagarNotaButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    if (!window.confirm("Apagar esta nota de roadmap?")) return;
    setBusy(true);
    try {
      await fetch(`/api/roadmap-note?id=${encodeURIComponent(noteId)}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded-full px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
    >
      {busy ? "Apagando…" : "Apagar"}
    </button>
  );
}
