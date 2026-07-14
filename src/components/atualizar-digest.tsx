"use client";

/**
 * "Atualizar" da tela Hoje (ritual F1) — re-gera o digest do dia a partir do
 * material atual (POST /api/hoje). Não re-coleta nada (o digest é cache-only);
 * serve pra puxar pro inbox o que chegou depois da geração da manhã.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { GenerateIcon } from "@/components/icons";

export function AtualizarDigest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function atualizar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/hoje", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao atualizar");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={atualizar}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900 disabled:opacity-50"
      >
        <GenerateIcon className={"h-3.5 w-3.5 " + (busy ? "animate-pulse" : "")} />
        {busy ? "Atualizando…" : "Atualizar"}
      </button>
      {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
    </span>
  );
}
