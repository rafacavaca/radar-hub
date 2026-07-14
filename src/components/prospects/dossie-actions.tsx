"use client";

/**
 * AÇÕES DO DOSSIÊ (F1) — gerar/atualizar (a ação cara: debita crédito) e, com
 * dossiê pronto, "Gerar no Formare" (abordagem/one-pager pela porta estreita).
 * Estados honestos, sem esconder custo nem falha.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DossieActions({ cliente, id, temDossie }: { cliente: string; id: string; temDossie: boolean }) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<null | { live: boolean; url?: string }>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/prospects/dossie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao gerar");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao gerar");
    } finally {
      setGerando(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/prospects/formare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id }),
      });
      const body = (await res.json().catch(() => null)) as { data?: { mode?: string; ok?: boolean; cardUrl?: string }; error?: string } | null;
      if (!body?.data?.ok) throw new Error(body?.error ?? "falha ao enviar");
      setEnviado({ live: body.data.mode === "live", url: body.data.cardUrl });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={gerar}
        disabled={gerando}
        className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        {gerando ? "Montando o dossiê…" : temDossie ? "Atualizar dossiê" : "Gerar dossiê"}
      </button>

      {temDossie && !enviado ? (
        <button
          onClick={enviar}
          disabled={enviando}
          className="rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Gerar no Formare"}
        </button>
      ) : null}

      {enviado ? (
        enviado.live ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            ✓ Criado no Formare
            {enviado.url ? <a href={enviado.url} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs underline-offset-2 hover:underline">abrir ↗</a> : null}
          </span>
        ) : (
          <span className="text-sm font-medium text-stone-500">✓ guardado (porta desligada)</span>
        )
      ) : null}

      {gerando ? <span className="text-[11px] text-stone-400">consome crédito · lê o site + buscas + base (~1 min)</span> : null}
      {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
    </div>
  );
}
