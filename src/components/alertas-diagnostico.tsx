"use client";

/**
 * F1a — ALERTAS do diagnóstico (in-app): inbox de disparos (não-vistos em
 * destaque) + regras editáveis (ligar/desligar; limiar % pros anúncios).
 * Mutations via /api/diagnostico/alertas; estado inicial vem do servidor.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AlertaDisparo, RegraAlerta } from "@/lib/diagnostico/schema";
import { REGRA_LABEL } from "@/lib/diagnostico/movimento";
import { formatDateShort } from "@/lib/format";
import { Rotulo } from "@/components/rotulo";

function resumo(d: AlertaDisparo): string {
  const m = d.movimento;
  if (m.tipo === "mudança") return `${m.campo_label}: ${m.de ?? "—"} → ${m.para ?? "—"}`;
  if (m.tipo === "novo") return `${m.campo_label} novo: ${m.para ?? "—"}`;
  if (m.tipo === "removido") return `${m.campo_label} removido: ${m.de ?? "—"}`;
  return `${m.campo_label}: ${m.para ?? "—"}`;
}

export function AlertasDiagnostico({
  cliente,
  regrasIniciais,
  disparos,
}: {
  cliente: string;
  regrasIniciais: RegraAlerta[];
  disparos: AlertaDisparo[];
}) {
  const router = useRouter();
  const [regras, setRegras] = useState<RegraAlerta[]>(regrasIniciais);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const naoVistos = disparos.filter((d) => !d.visto);
  const historico = disparos.filter((d) => d.visto).slice(0, 5);

  async function salvarRegras() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/alertas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: cliente, regras }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcarVistos() {
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: cliente, acao: "marcar_vistos" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao marcar.");
    }
  }

  return (
    <section
      className={
        "rounded-2xl border p-4 shadow-sm sm:p-5 " +
        (naoVistos.length > 0 ? "border-red-200 bg-red-50/40" : "border-stone-200 bg-white")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
          Alertas
          {naoVistos.length > 0 ? (
            <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              {naoVistos.length} novo{naoVistos.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          {naoVistos.length > 0 ? (
            <button
              onClick={marcarVistos}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              Marcar como vistos
            </button>
          ) : null}
          <button
            onClick={() => setEditando((v) => !v)}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            {editando ? "Fechar regras" : "Regras"}
          </button>
        </div>
      </div>

      {naoVistos.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">
          Nenhum alerta novo. As regras rodam a cada varredura do diagnóstico.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {naoVistos.map((d) => (
            <li key={d.id} className="rounded-xl border border-red-100 bg-white p-2.5">
              <p className="text-sm text-stone-800">
                <span className="font-semibold">{d.concorrente_nome}</span> — {resumo(d)}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {REGRA_LABEL[d.regra]} · {formatDateShort(d.data)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {historico.length > 0 && naoVistos.length === 0 ? (
        <ul className="mt-2 space-y-1">
          {historico.map((d) => (
            <li key={d.id} className="text-xs text-stone-400">
              {d.concorrente_nome} — {resumo(d)} · {formatDateShort(d.data)}
            </li>
          ))}
        </ul>
      ) : null}

      {editando ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-xs font-medium text-stone-500">
            Regras deste cliente (valem pra todos os <Rotulo termo="concorrentes" lower /> dele):
          </p>
          <ul className="mt-2 space-y-1.5">
            {regras.map((r, i) => (
              <li key={r.tipo} className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.ativo}
                    onChange={(e) =>
                      setRegras((prev) => prev.map((x, j) => (j === i ? { ...x, ativo: e.target.checked } : x)))
                    }
                    className="h-4 w-4 accent-red-600"
                  />
                  {REGRA_LABEL[r.tipo]}
                </label>
                {r.tipo === "anuncios_variacao" || r.tipo === "nota_caiu" || r.tipo === "vagas_variacao" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                    limiar
                    <input
                      type="number"
                      min={r.tipo === "nota_caiu" ? 0.1 : 1}
                      max={r.tipo === "nota_caiu" ? 10 : 500}
                      step={r.tipo === "nota_caiu" ? 0.1 : 1}
                      value={r.limiar ?? (r.tipo === "nota_caiu" ? 0.5 : 50)}
                      onChange={(e) =>
                        setRegras((prev) =>
                          prev.map((x, j) =>
                            j === i
                              ? { ...x, limiar: Number(e.target.value) || (r.tipo === "nota_caiu" ? 0.5 : 50) }
                              : x,
                          ),
                        )
                      }
                      className="w-16 rounded-lg border border-stone-200 px-2 py-0.5 text-xs"
                    />
                    {r.tipo === "nota_caiu" ? "pts" : "%"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={salvarRegras}
              disabled={salvando}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar regras"}
            </button>
            {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
