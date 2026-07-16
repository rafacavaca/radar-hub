"use client";

/**
 * Editor da BASE DE CONHECIMENTO LOCAL de um cliente (só super_admin, na
 * Implantação). Cola-se o essencial do cliente (oferta, ICP, personas). O
 * produto rotula isso como "base local (implantação)" — nunca como Brain real.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BaseLocalEditor({ cliente, initial }: { cliente: string; initial: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setBusy(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch("/api/base-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, texto }),
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

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-900"
      >
        {initial ? "Editar base local" : "Adicionar base local"} →
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={texto}
        onChange={(e) => {
          setOk(false);
          setTexto(e.target.value);
        }}
        rows={5}
        placeholder="Cole o essencial deste cliente: a oferta, o ICP, as personas, os diferenciais. Enxuto — não é o Brain completo."
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[13px] text-stone-900 placeholder:text-stone-300 focus:border-stone-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={busy}
          className="inline-flex min-h-[36px] items-center rounded-md bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar base local"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-[12px] text-stone-500 hover:text-stone-900">
          Fechar
        </button>
        {ok ? <span className="text-[12px] text-emerald-700">Salvo.</span> : null}
        {erro ? <span className="text-[12px] text-red-600">{erro}</span> : null}
      </div>
      <p className="text-[11px] text-stone-400">
        Base enxuta, digitada na implantação — o dossiê a rotula como <span className="font-medium">base local</span>, não como Brain real.
      </p>
    </div>
  );
}
