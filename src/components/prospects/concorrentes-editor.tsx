"use client";

/**
 * CONCORRENTES do dossiê — CURÁVEL (feedback do Rafael): a descoberta automática
 * sugere, mas o vendedor manda. Pode INDICAR concorrentes que conhece e VALIDAR
 * as sugestões (manter/descartar). Curar é barato (não re-gera o dossiê) e
 * sobrevive à regeração. Honestidade preservada: sugestão pendente é marcada
 * "validar"; manual é "você indicou"; confirmada é "confirmado".
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SourceRef } from "@/components/signal-meta";
import type { ConcorrenteExibido } from "@/lib/prospects/schema";

async function acao(cliente: string, id: string, acao: string, nome: string, nota?: string): Promise<void> {
  await fetch("/api/prospects/concorrentes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cliente, id, acao, nome, nota }),
  });
}

function ChipEstado({ c }: { c: ConcorrenteExibido }) {
  if (c.origem === "manual") return <span className="rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">você indicou</span>;
  if (c.estado === "confirmado") return <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">confirmado</span>;
  return <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">validar</span>;
}

export function ConcorrentesEditor({ cliente, id, concorrentes }: { cliente: string; id: string; concorrentes: ConcorrenteExibido[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [nota, setNota] = useState("");

  async function run(a: string, alvo: string, notaTxt?: string) {
    setBusy(a + alvo);
    try {
      await acao(cliente, id, a, alvo, notaTxt);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function adicionar() {
    if (!nome.trim()) return;
    await run("add", nome.trim(), nota.trim() || undefined);
    setNome("");
    setNota("");
    setAddOpen(false);
  }

  const pendentes = concorrentes.filter((c) => c.estado === "pendente").length;

  return (
    <div>
      {pendentes > 0 ? (
        <p className="mb-2.5 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          {pendentes} sugestão(ões) da busca aguardando você validar — mantenha as certas, descarte o ruído.
        </p>
      ) : null}

      {concorrentes.length === 0 ? (
        <p className="text-sm text-stone-400">Nenhum concorrente ainda — a busca não trouxe e você não indicou. Adicione abaixo.</p>
      ) : (
        <ul className="space-y-2">
          {concorrentes.map((c, i) => (
            <li key={i} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-900">
                    {c.nome}
                    <ChipEstado c={c} />
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] leading-snug text-stone-600">
                    {c.nota.texto}
                    {c.nota.fonte_url ? <SourceRef url={c.nota.fonte_url} titulo={c.nota.fonte_titulo} /> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.origem === "manual" ? (
                    <button onClick={() => run("remover", c.nome)} disabled={busy !== null} title="Remover" className="rounded-md px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50">×</button>
                  ) : c.estado === "pendente" ? (
                    <>
                      <button onClick={() => run("confirmar", c.nome)} disabled={busy !== null} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[12px] font-medium text-emerald-700 hover:border-emerald-500 disabled:opacity-50">✓ manter</button>
                      <button onClick={() => run("descartar", c.nome)} disabled={busy !== null} className="rounded-md px-2 py-1 text-[12px] font-medium text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50">× descartar</button>
                    </>
                  ) : (
                    <button onClick={() => run("descartar", c.nome)} disabled={busy !== null} title="Descartar" className="rounded-md px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50">×</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addOpen ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do concorrente" className="min-w-0 flex-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-stone-500" />
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="nota (opcional)" className="min-w-0 flex-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-stone-500" />
          <button onClick={adicionar} disabled={busy !== null} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">Adicionar</button>
          <button onClick={() => setAddOpen(false)} className="rounded-md px-2 py-1.5 text-sm text-stone-400 hover:text-stone-700">cancelar</button>
        </div>
      ) : (
        <button onClick={() => setAddOpen(true)} className="mt-2.5 text-[13px] font-medium text-stone-500 hover:text-stone-900">
          + Indicar concorrente
        </button>
      )}
    </div>
  );
}
