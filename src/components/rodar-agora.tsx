"use client";

/**
 * Controle "Rodar agora" — dispara uma rodada e recarrega a página.
 *
 * F16 (rodada granular): com `cliente`, roda SÓ aquele cliente
 * (`/api/run?cliente=X` — mescla no resultado do dia, preserva o resto);
 * sem `cliente`, roda tudo (`?force=1`). O Firecrawl segue no cache diário.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RodarAgora({
  testId,
  variant = "solid",
  cliente,
}: {
  testId?: string;
  variant?: "solid" | "ghost";
  /** roda só este cliente (rodada parcial, mais rápida e barata). */
  cliente?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const url = cliente
        ? `/api/run?cliente=${encodeURIComponent(cliente)}`
        : "/api/run?force=1";
      await fetch(url, { cache: "no-store" });
      router.refresh();
    } catch {
      // erro é reportado pela própria página no próximo render; nada a fazer aqui.
    } finally {
      setRunning(false);
    }
  }

  const base =
    "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
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
      title={cliente ? `Roda só ${cliente} (o resto do dia fica como está)` : "Roda todos os clientes"}
    >
      <span
        aria-hidden
        className={running ? "inline-block h-2 w-2 animate-ping rounded-full bg-current" : ""}
      />
      {running ? "Coletando…" : cliente ? `Coletar ${cliente}` : "Coletar tudo"}
    </button>
  );
}
