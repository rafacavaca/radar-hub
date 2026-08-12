"use client";

/**
 * HISTÓRICO (ritual) — tudo que foi processado no Hoje, por ESTADO, com data
 * absoluta e autor. Lê o snapshot durável (não depende do material do dia). O
 * inbox do Hoje segue curado; aqui nada se perde. Filtro: Todos · Atuados ·
 * Adiados · Ignorados · Arquivados. Ação leve: Arquivar (tira do histórico ativo).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SourceRef } from "@/components/signal-meta";
import { formatDateTimePtBR } from "@/lib/format";
import type { Balanco } from "@/lib/balanco";
import type { BriefingEstado, EstadoRegistro } from "@/lib/briefing-estado";

type Filtro = "todos" | BriefingEstado;
type Janela = 30 | 60 | 90;

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "atuado", label: "Atuados" },
  { id: "adiado", label: "Adiados" },
  { id: "ignorado", label: "Ignorados" },
  { id: "arquivado", label: "Arquivados" },
];

const ESTADO_META: Record<BriefingEstado, { label: string; cor: string }> = {
  atuado: { label: "Atuado", cor: "bg-emerald-50 text-emerald-700" },
  adiado: { label: "Adiado", cor: "bg-amber-50 text-amber-800" },
  ignorado: { label: "Ignorado", cor: "bg-stone-100 text-stone-500" },
  arquivado: { label: "Arquivado", cor: "bg-blue-50 text-blue-700" },
};

function formatDia(d: string): string {
  const [, m, day] = d.split("-");
  return day && m ? `${day}/${m}` : d;
}

export function HistoricoView({
  registros,
  balancos,
}: {
  registros: EstadoRegistro[];
  balancos: Record<Janela, Balanco>;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const conta = (e: BriefingEstado) => registros.filter((r) => r.estado === e).length;
  const visiveis = filtro === "todos" ? registros : registros.filter((r) => r.estado === filtro);

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Ritual</p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900">Histórico</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-stone-500">
        Tudo que você processou no Hoje — por estado, com data. O inbox segue curado; aqui nada se perde.
      </p>

      <BalancoCockpit balancos={balancos} />

      <div className="mt-6 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const n = f.id === "todos" ? registros.length : conta(f.id);
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={
                "rounded-full px-3 py-1 text-[12px] font-medium " +
                (ativo ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100")
              }
            >
              {f.label} <span className={ativo ? "text-stone-300" : "text-stone-400"}>({n})</span>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">Nada aqui ainda.</p>
          <p className="mt-1 text-sm text-stone-500">
            Quando você marcar itens no Hoje (Atuado · Amanhã · Ignorar), eles aparecem aqui — com estado e data.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {visiveis.map((r) => (
            <Row key={`${r.chave}:${r.em}`} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BalancoCockpit({ balancos }: { balancos: Record<Janela, Balanco> }) {
  const [dias, setDias] = useState<Janela>(30);
  const b = balancos[dias];
  const pct = Math.round(b.taxaAcao * 100);

  return (
    <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-stone-900">Balanço</p>
          <p className="text-[12px] text-stone-500">O que você processou — e de quanto atuou.</p>
        </div>
        <div className="flex gap-1">
          {([30, 60, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={
                "rounded-full px-2.5 py-1 text-[12px] font-medium " +
                (dias === d ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100")
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {b.total.total === 0 ? (
        <p className="mt-3 text-[13px] text-stone-400">Nada processado nos últimos {dias} dias ainda.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-10">
            <Num n={b.total.total} label="processados" />
            <Num n={b.total.atuado} label={`atuados · ${pct}%`} accent />
            <Num n={b.total.ignorado} label="ignorados" />
            <Num n={b.total.adiado} label="adiados" />
            {b.total.arquivado > 0 ? <Num n={b.total.arquivado} label="arquivados" /> : null}
          </div>
          {b.porCliente.length > 1 ? (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">Por cliente</p>
              <ul className="mt-1.5 space-y-1">
                {b.porCliente.slice(0, 6).map((l) => (
                  <li key={l.label} className="flex items-center justify-between text-[13px]">
                    <span className="text-stone-700">{l.label}</span>
                    <span className="text-stone-400">
                      {l.contagem.atuado} atuado(s) · {l.contagem.total} no total
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Num({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div>
      <span className={"text-2xl font-bold " + (accent ? "text-emerald-600" : "text-stone-900")}>{n}</span>
      <span className="ml-1.5 text-[13px] text-stone-500">{label}</span>
    </div>
  );
}

function Row({ r }: { r: EstadoRegistro }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const meta = ESTADO_META[r.estado];

  async function arquivar() {
    setBusy(true);
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: r.item.id, estado: "arquivado", item: r.item }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-stone-200 bg-white px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-stone-800">{r.item.titulo}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
            <span className="font-medium text-stone-500">{r.item.clientName}</span>
            {r.item.origem ? (
              <>
                <span>·</span>
                <span>{r.item.origem}</span>
              </>
            ) : null}
            {r.item.fonte?.url ? <SourceRef url={r.item.fonte.url} titulo={r.item.fonte.titulo} /> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + meta.cor}>
            {meta.label}
            {r.estado === "adiado" && r.ate ? ` · volta ${formatDia(r.ate)}` : ""}
          </span>
          <span className="text-[11px] text-stone-400">
            {formatDateTimePtBR(r.em)}
            {r.por?.email ? ` · ${r.por.email}` : ""}
          </span>
          {r.estado !== "arquivado" ? (
            <button
              onClick={arquivar}
              disabled={busy}
              className="text-[11px] font-medium text-stone-400 hover:text-stone-700 disabled:opacity-50"
            >
              {busy ? "…" : "Arquivar"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
