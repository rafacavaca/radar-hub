"use client";

/**
 * Controle "Rodar agora" — força uma rodada nova do loop (`/api/run?force=1`)
 * e recarrega os dados da página (server component) via `router.refresh()`.
 *
 * Barato e seguro: força o RACIOCÍNIO (1 chamada ao gateway), mas o Firecrawl
 * continua no cache diário. `testId` é opcional para não duplicar o data-testid
 * quando o controle aparece duas vezes (barra + estado vazio).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RodarAgora({
  testId,
  variant = "solid",
}: {
  testId?: string;
  variant?: "solid" | "ghost";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      await fetch("/api/run?force=1", { cache: "no-store" });
      router.refresh();
    } catch {
      // erro é reportado pela própria página no próximo render; nada a fazer aqui.
    } finally {
      setRunning(false);
    }
  }

  const base =
    "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  const look =
    variant === "solid"
      ? "bg-stone-900 text-stone-50 hover:bg-stone-700"
      : "border border-stone-300 text-stone-700 hover:bg-stone-100";

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={run}
      disabled={running}
      className={`${base} ${look}`}
    >
      <span
        aria-hidden
        className={running ? "inline-block h-2 w-2 animate-ping rounded-full bg-current" : ""}
      />
      {running ? "Rodando…" : "Rodar agora"}
    </button>
  );
}
