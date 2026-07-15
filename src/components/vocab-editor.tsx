"use client";

/**
 * Editor de RÓTULOS da agência (P13) — só o super_admin vê (a Implantação
 * decide). Lista os termos renomeáveis; em branco = usa o padrão. Salva em
 * /api/vocab e recarrega (os rótulos valem em toda a interface). Importa só o
 * núcleo puro do vocabulário.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { VOCAB_TERMS, type VocabKey, type VocabMap } from "@/lib/vocab-terms";

export function VocabEditor({ initial }: { initial: VocabMap }) {
  const router = useRouter();
  const [map, setMap] = useState<VocabMap>(initial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set(key: VocabKey, value: string) {
    setOk(false);
    setMap((m) => ({ ...m, [key]: value }));
  }

  async function salvar() {
    setBusy(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch("/api/vocab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocab: map }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setOk(true);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {VOCAB_TERMS.map((t) => (
        <div key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="w-48 shrink-0">
            <span className="text-[13px] font-medium text-stone-700">{t.label}</span>
            <span className="ml-1 text-[11px] text-stone-400">{t.desc}</span>
          </div>
          <input
            value={map[t.key] ?? ""}
            onChange={(e) => set(t.key, e.target.value)}
            placeholder={`padrão: ${t.label}`}
            className="min-w-[180px] flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] text-stone-900 placeholder:text-stone-300 focus:border-stone-500 focus:outline-none"
          />
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={salvar}
          disabled={busy}
          className="inline-flex min-h-[38px] items-center rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar rótulos"}
        </button>
        {ok ? <span className="text-[12px] text-emerald-700">Salvo — vale em toda a interface.</span> : null}
        {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
      </div>
      <p className="text-[11px] text-stone-400">Deixe em branco para usar o rótulo padrão.</p>
    </div>
  );
}
