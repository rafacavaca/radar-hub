"use client";

/**
 * IMPORTAR FICHA — o painel (só super_admin) que fecha o ciclo diagnóstico →
 * Ficha JSON → Radar parametrizado. Cola/sobe a Ficha, vê o DIFF (o que vai
 * mudar, antes de mudar) e só então APLICA. Nunca aplica direto. Depois de
 * aplicar, mostra o relatório honesto e recarrega a tela (selos + proveniência).
 *
 * Importa só TIPOS do motor (@/lib/implantacao/ficha usa node:fs) — nada de
 * runtime no bundle do cliente.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ApplyReport, DiffResult, ReportItem } from "@/lib/implantacao/ficha";

export function FichaImport() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [json, setJson] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [erro, setErro] = useState<string | null>(null);

  function reset() {
    setJson("");
    setDiff(null);
    setReport(null);
    setErro(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    setJson(texto);
    setDiff(null);
    setReport(null);
    setErro(null);
  }

  async function enviar(mode: "preview" | "apply") {
    setBusy(mode);
    setErro(null);
    try {
      const res = await fetch("/api/implantacao/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json, mode }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: { diff?: DiffResult; report?: ApplyReport }; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      if (mode === "preview") {
        setDiff(payload?.data?.diff ?? null);
        setReport(null);
      } else {
        setReport(payload?.data?.report ?? null);
        setDiff(null);
        router.refresh();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no import.");
    } finally {
      setBusy(null);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
      >
        ↑ Importar Ficha da implantação
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-stone-300 bg-stone-50/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-stone-900">Importar Ficha da implantação</h3>
        <button type="button" onClick={() => { setAberto(false); reset(); }} className="text-[12px] text-stone-500 hover:text-stone-900">
          Fechar
        </button>
      </div>
      <p className="mb-3 text-[12px] text-stone-500">
        Cole o JSON da Ficha (ou suba o arquivo) exportado pelo instrumento de diagnóstico. Você vê o que vai mudar <span className="font-medium">antes</span> de aplicar. Aplica só na sua agência.
      </p>

      <textarea
        value={json}
        onChange={(e) => { setJson(e.target.value); setDiff(null); setReport(null); }}
        rows={5}
        placeholder='{ "ficha_version": 1, "agencia": "…", "criterio_agencia": { … }, "contas": [ … ] }'
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-[12px] text-stone-900 placeholder:text-stone-300 focus:border-stone-500 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-900">
          Subir arquivo .json
          <input type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
        </label>
        <button
          type="button"
          onClick={() => enviar("preview")}
          disabled={busy !== null || !json.trim()}
          className="ml-auto inline-flex min-h-[36px] items-center rounded-md border border-stone-800 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-800 transition-colors hover:bg-stone-100 disabled:opacity-40"
        >
          {busy === "preview" ? "Lendo…" : "Pré-visualizar"}
        </button>
      </div>
      {erro ? <p className="mt-2 text-[12px] text-red-600">{erro}</p> : null}

      {/* DIFF — o que vai mudar, antes de mudar */}
      {diff ? (
        <div className="mt-4 space-y-3 border-t border-stone-200 pt-3">
          {diff.avisoOrg ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">⚠️ {diff.avisoOrg}</p>
          ) : null}
          {diff.nada ? (
            <p className="text-[13px] text-stone-500">Nada a mudar — a Ficha não traz parâmetros <span className="font-medium">definidos</span> novos.</p>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-stone-400">Vai mudar isto</p>
              {diff.grupos.map((g, i) => (
                <div key={i}>
                  <p className="text-[13px] font-semibold text-stone-800">{g.titulo}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {g.linhas.map((l, j) => (
                      <li key={j} className="text-[13px] text-stone-600">· {l}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => enviar("apply")}
                  disabled={busy !== null}
                  className="inline-flex min-h-[38px] items-center rounded-md bg-stone-900 px-4 py-1.5 text-[13px] font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
                >
                  {busy === "apply" ? "Aplicando…" : "Aplicar no Radar"}
                </button>
                <button type="button" onClick={() => setDiff(null)} className="text-[12px] text-stone-500 hover:text-stone-900">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* RELATÓRIO — o que foi aplicado, ignorado, pendente, falhou */}
      {report ? (
        <div className="mt-4 space-y-2.5 border-t border-stone-200 pt-3">
          <p className="text-[13px] font-semibold text-emerald-700">✓ Ficha aplicada.</p>
          {report.contasCriadas.length ? (
            <p className="text-[12px] text-stone-600">Contas criadas: <span className="font-medium">{report.contasCriadas.join(" · ")}</span></p>
          ) : null}
          <Bloco titulo="Aplicado" itens={report.aplicado} cor="text-emerald-700" />
          <Bloco titulo="Pendente (não aplicado — precisa de ajuste)" itens={report.pendente} cor="text-amber-700" />
          <Bloco titulo="Ignorado" itens={report.ignorado} cor="text-stone-500" />
          <Bloco titulo="Falhou" itens={report.falha} cor="text-red-600" />
          <button type="button" onClick={reset} className="text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-900">
            Importar outra
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Bloco({ titulo, itens, cor }: { titulo: string; itens: ReportItem[]; cor: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className={"text-[11px] font-semibold uppercase tracking-[0.06em] " + cor}>{titulo}</p>
      <ul className="mt-0.5 space-y-0.5">
        {itens.map((it, i) => (
          <li key={i} className="text-[12px] text-stone-600">
            <span className="font-medium text-stone-800">{it.param}:</span> {it.detalhe}
          </li>
        ))}
      </ul>
    </div>
  );
}
