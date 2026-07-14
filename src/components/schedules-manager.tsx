"use client";

/**
 * RELATÓRIOS AGENDADOS (F10) — o painel client onde o Rafael cria uma REGRA
 * recorrente ("toda segunda, o relatório comercial dos concorrentes"). A
 * execução é do timer do sistema; aqui só se define/pausa/apaga a regra.
 *
 * Renderiza SEMPRE de `schedules` (props do server); cada mutação bate em
 * /api/schedules e chama router.refresh(). De @/lib/schedules importa só tipos.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { Cadence, Schedule } from "@/lib/schedules";

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

const WEEKDAY_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function cadenceLabel(c: Cadence): string {
  return c.kind === "daily" ? "todo dia" : `toda ${WEEKDAY_LABEL[c.weekday]}`;
}

type Body =
  | { action: "create"; clientName: string; request: string; cadence: Cadence }
  | { action: "toggle"; id: string; enabled: boolean };

async function post(body: Body): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const p = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: p?.error ?? "Não foi possível salvar o agendamento." };
  } catch {
    return { ok: false, error: "Falha de conexão." };
  }
}

export function SchedulesManager({
  schedules,
  clients,
}: {
  schedules: Schedule[];
  clients: string[];
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm font-semibold text-stone-900">Relatórios agendados</p>
      <p className="mt-0.5 text-xs text-stone-400">
        Defina uma vez e o Radar gera sozinho — o relatório aparece aqui na lista no dia marcado.
      </p>

      <CreateForm clients={clients} />

      {schedules.length > 0 ? (
        <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
          {schedules.map((s) => (
            <ScheduleRow key={s.id} schedule={s} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-500">
          Nenhum agendamento ainda.
        </p>
      )}
    </div>
  );
}

function CreateForm({ clients }: { clients: string[] }) {
  const router = useRouter();
  const [client, setClient] = useState(clients[0] ?? "");
  const [request, setRequest] = useState("");
  const [freq, setFreq] = useState<"daily" | "weekly">("weekly");
  const [weekday, setWeekday] = useState(1); // segunda
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !request.trim()) return;
    setPending(true);
    setError(null);
    const cadence: Cadence = freq === "daily" ? { kind: "daily" } : { kind: "weekly", weekday };
    const result = await post({ action: "create", clientName: client, request: request.trim(), cadence });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setRequest("");
    router.refresh();
    setPending(false);
  }

  return (
    <form onSubmit={submit} data-testid="schedule-create" className="mt-3">
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-2 md:grid-cols-2">
        {clients.length > 1 ? (
          <select value={client} onChange={(e) => setClient(e.target.value)} className={INPUT_CLASS}>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex gap-2">
          <select
            value={freq}
            onChange={(e) => setFreq(e.target.value as "daily" | "weekly")}
            className={INPUT_CLASS}
          >
            <option value="weekly">Semanal</option>
            <option value="daily">Todo dia</option>
          </select>
          {freq === "weekly" ? (
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className={INPUT_CLASS}
              aria-label="Dia da semana"
            >
              {WEEKDAY_LABEL.map((label, i) => (
                <option key={i} value={i}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <textarea
        data-testid="schedule-request"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder="Ex.: relatório comercial dos concorrentes desta semana"
        className={INPUT_CLASS + " mt-2 min-h-[64px]"}
      />
      <button
        type="submit"
        disabled={pending || !request.trim()}
        className="mt-2 inline-flex min-h-[40px] items-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "Agendando…" : "Agendar relatório"}
      </button>
    </form>
  );
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "toggle" | "delete">(null);
  const paused = !schedule.enabled;

  async function toggle() {
    if (busy) return;
    setBusy("toggle");
    const result = await post({ action: "toggle", id: schedule.id, enabled: paused });
    if (result.ok) router.refresh();
    setBusy(null);
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm("Apagar este agendamento?")) return;
    setBusy("delete");
    try {
      await fetch(`/api/schedules?id=${encodeURIComponent(schedule.id)}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <li data-testid="schedule-row" className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className={"font-medium " + (paused ? "text-stone-400" : "text-stone-900")}>
            {cadenceLabel(schedule.cadence)}
          </span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-600">{schedule.clientName}</span>
          {paused ? (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">pausado</span>
          ) : null}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{schedule.request}</p>
        {schedule.lastRunAt ? (
          <p className="mt-0.5 text-xs text-stone-400">
            última: {new Date(schedule.lastRunAt).toLocaleDateString("pt-BR")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          data-testid="schedule-toggle"
          onClick={toggle}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {busy === "toggle" ? "…" : paused ? "Retomar" : "Pausar"}
        </button>
        <button
          type="button"
          data-testid="schedule-delete"
          onClick={remove}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          {busy === "delete" ? "…" : "Apagar"}
        </button>
      </div>
    </li>
  );
}
