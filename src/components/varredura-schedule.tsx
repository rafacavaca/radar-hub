"use client";

/**
 * 0a — controle da VARREDURA SEMANAL automática do diagnóstico (na tela
 * /diagnostico). Liga/desliga + escolhe o dia. Quando ligada, o timer horário
 * do Radar re-varre os concorrentes já diagnosticados 1x/semana — e a timeline
 * de Movimentos + o inbox de Alertas passam a viver sozinhos.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { DiagScheduleClient } from "@/lib/diagnostico/schedule";
import { Rotulo } from "@/components/rotulo";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function VarreduraSchedule({
  cliente,
  config,
  alvos,
}: {
  cliente: string;
  config: DiagScheduleClient;
  alvos: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config.enabled);
  const [weekday, setWeekday] = useState(config.weekday);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(next: { enabled: boolean; weekday: number }) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/diagnostico/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: cliente, ...next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
      // reverte o otimismo local
      setEnabled(config.enabled);
      setWeekday(config.weekday);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={salvando}
          onChange={(e) => {
            setEnabled(e.target.checked);
            salvar({ enabled: e.target.checked, weekday });
          }}
          className="h-4 w-4 accent-red-600"
        />
        <span className="font-medium text-stone-700">Varredura semanal automática</span>
      </label>

      <span className="inline-flex items-center gap-1 text-stone-500">
        toda
        <select
          value={weekday}
          disabled={!enabled || salvando}
          onChange={(e) => {
            const w = Number(e.target.value);
            setWeekday(w);
            salvar({ enabled, weekday: w });
          }}
          className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-sm text-stone-700 disabled:opacity-50"
        >
          {WEEKDAYS.map((d, i) => (
            <option key={i} value={i}>
              {d}-feira
            </option>
          ))}
        </select>
      </span>

      <span className="text-xs text-stone-400">
        {alvos > 0 ? <>{alvos} <Rotulo termo="concorrentes" singular={alvos === 1} lower /> na varredura</> : <>nenhum <Rotulo termo="concorrentes" singular lower /> diagnosticado ainda</>}
        {" · "}
        {config.lastRunDay ? `última: ${config.lastRunDay}` : "ainda não rodou"}
      </span>
      {erro ? <span className="text-xs text-red-600">{erro}</span> : null}
    </div>
  );
}
