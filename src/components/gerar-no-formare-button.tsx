"use client";

/**
 * Botão "Gerar no Formare" — envia o item como demanda pela porta estreita.
 * POR ENQUANTO o endpoint é um STUB SEGURO (não chama o Formare); ao confirmar,
 * mostra "enviado (modo seguro)". Mínimo de propósito.
 */

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export function GerarNoFormareButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function send() {
    setStatus("sending");
    try {
      const res = await fetch("/api/send-to-formare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <span aria-hidden>✓</span> enviado (modo seguro)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {status === "error" && (
        <span className="text-xs text-red-600">falhou, tente de novo</span>
      )}
      <button
        type="button"
        data-testid="gerar-no-formare"
        onClick={send}
        disabled={status === "sending"}
        className="inline-flex items-center rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Enviando…" : "Gerar no Formare"}
      </button>
    </span>
  );
}
