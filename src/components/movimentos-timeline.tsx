"use client";

/**
 * F1a — TIMELINE DE MOVIMENTOS na ficha do diagnóstico: cronológica (mais novo
 * primeiro), com filtro por tipo e severidade. Cada movimento cita as DUAS
 * fontes/datas (de/para). Render puro sobre Movimento[] — a detecção é do motor.
 */

import { useMemo, useState } from "react";

import type { Movimento, MovimentoTipo, Severidade } from "@/lib/diagnostico/schema";
import { formatDateShort } from "@/lib/format";

import { SourceRef } from "@/components/signal-meta";

const TIPO_LABEL: Record<MovimentoTipo, string> = {
  "mudança": "mudou",
  primeira_coleta: "1ª coleta",
  novo: "novo",
  removido: "removido",
};

const SEV_CHIP: Record<Severidade, string> = {
  alta: "bg-red-50 text-red-700 border-red-200",
  "média": "bg-amber-50 text-amber-800 border-amber-200",
  baixa: "bg-stone-100 text-stone-500 border-stone-200",
};

function valor(v: string | number | null): string {
  if (v === null) return "—";
  return typeof v === "number" ? String(v) : v;
}

export function MovimentosTimeline({ movimentos }: { movimentos: Movimento[] }) {
  const [tipo, setTipo] = useState<"todos" | MovimentoTipo>("todos");
  const [sev, setSev] = useState<"todas" | Severidade>("todas");

  const visiveis = useMemo(
    () =>
      movimentos.filter(
        (m) => (tipo === "todos" || m.tipo === tipo) && (sev === "todas" || m.severidade === sev),
      ),
    [movimentos, tipo, sev],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600"
          aria-label="Filtrar por tipo"
        >
          <option value="todos">todos os tipos</option>
          <option value="mudança">mudança</option>
          <option value="novo">novo</option>
          <option value="removido">removido</option>
          <option value="primeira_coleta">1ª coleta</option>
        </select>
        <select
          value={sev}
          onChange={(e) => setSev(e.target.value as typeof sev)}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600"
          aria-label="Filtrar por severidade"
        >
          <option value="todas">todas as severidades</option>
          <option value="alta">alta</option>
          <option value="média">média</option>
          <option value="baixa">baixa</option>
        </select>
        <span className="text-xs text-stone-400">
          {visiveis.length} de {movimentos.length}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="mt-3 text-sm text-stone-400">Nenhum movimento com esse filtro.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visiveis.map((m, i) => (
            <li
              key={`${m.campo}-${m.data_deteccao}-${i}`}
              className="rounded-xl border border-stone-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    SEV_CHIP[m.severidade]
                  }
                >
                  {m.severidade}
                </span>
                <span className="text-sm font-medium text-stone-900">{m.campo_label}</span>
                <span className="text-xs text-stone-400">{TIPO_LABEL[m.tipo]}</span>
                <span className="ml-auto text-xs text-stone-400">
                  detectado {formatDateShort(m.data_deteccao) ?? m.data_deteccao.slice(0, 10)}
                </span>
              </div>

              <p className="mt-1.5 text-sm text-stone-700">
                {m.tipo === "novo" || m.tipo === "primeira_coleta" ? (
                  <span>{valor(m.para)}</span>
                ) : m.tipo === "removido" ? (
                  <span className="line-through decoration-stone-300">{valor(m.de)}</span>
                ) : (
                  <>
                    <span className="text-stone-400">{valor(m.de)}</span>
                    <span aria-hidden className="mx-1.5 text-stone-300">→</span>
                    <span className="font-medium">{valor(m.para)}</span>
                  </>
                )}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-400">
                {m.fonte_url_de ? (
                  <span className="inline-flex items-center gap-1">
                    antes: <SourceRef url={m.fonte_url_de} />
                    {m.data_de ? <span>({formatDateShort(m.data_de)})</span> : null}
                  </span>
                ) : null}
                {m.fonte_url_para ? (
                  <span className="inline-flex items-center gap-1">
                    {m.tipo === "mudança" ? "depois:" : "fonte:"} <SourceRef url={m.fonte_url_para} />
                    {m.data_para ? <span>({formatDateShort(m.data_para)})</span> : null}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
