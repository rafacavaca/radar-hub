"use client";

/**
 * CICLO DE VIDA do prospect. Em F1: só "Arquivar / Reativar" (esfriar — tira da
 * lista ativa, sem custo contínuo). Em F3 ganha "Promover a conta-chave"
 * (o efêmero vira monitorado, sem duplicar dado).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProspectStatus } from "@/lib/prospects/schema";

export function ProspectLifecycle({ cliente, id, status }: { cliente: string; id: string; status: ProspectStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(novo: ProspectStatus) {
    setBusy(true);
    try {
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id, patch: { status: novo } }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "arquivado") {
    return (
      <button onClick={() => setStatus("ativo")} disabled={busy} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50">
        {busy ? "…" : "Reativar"}
      </button>
    );
  }

  return (
    <button onClick={() => setStatus("arquivado")} disabled={busy} className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-400 hover:border-stone-300 hover:text-stone-600 disabled:opacity-50">
      {busy ? "…" : "Arquivar"}
    </button>
  );
}
