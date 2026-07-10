"use client";

/**
 * CICLO DE VIDA do prospect (F3): PROMOVER a conta-chave (o efêmero vira
 * monitorado, sem duplicar) · ARQUIVAR/reativar (esfriar — sai da lista ativa,
 * sem custo contínuo). Promovido mostra "Monitorado" + atalho pra Contas.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProspectStatus } from "@/lib/prospects/schema";

export function ProspectLifecycle({ cliente, id, status }: { cliente: string; id: string; status: ProspectStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "promover" | "status">(null);
  const [erro, setErro] = useState<string | null>(null);

  async function setStatus(novo: ProspectStatus) {
    setBusy("status");
    setErro(null);
    try {
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id, patch: { status: novo } }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function promover() {
    setBusy("promover");
    setErro(null);
    try {
      const res = await fetch("/api/prospects/promover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao promover");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao promover");
      setBusy(null);
    }
  }

  if (status === "promovido") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
          ✓ Monitorado (conta-chave)
        </span>
        <Link href={`/contas?cliente=${encodeURIComponent(cliente)}`} className="text-[11px] text-stone-400 underline-offset-2 hover:text-stone-700 hover:underline">
          ver em Contas →
        </Link>
      </div>
    );
  }

  if (status === "arquivado") {
    return (
      <button onClick={() => setStatus("ativo")} disabled={busy !== null} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50">
        {busy ? "…" : "Reativar"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={promover}
          disabled={busy !== null}
          title="Virou oportunidade real? Passa a ser vigiada continuamente (pilar Clientes)."
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "promover" ? "Promovendo…" : "Promover a conta-chave"}
        </button>
        <button
          onClick={() => setStatus("arquivado")}
          disabled={busy !== null}
          className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-400 hover:border-stone-300 hover:text-stone-600 disabled:opacity-50"
        >
          Arquivar
        </button>
      </div>
      {busy === "promover" ? <span className="text-[11px] text-stone-400">descobrindo fontes pra vigiar…</span> : null}
      {erro ? <span className="text-[11px] text-red-600">{erro}</span> : null}
    </div>
  );
}
