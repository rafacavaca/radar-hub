/**
 * HOJE (ritual diário, F1) — a tela que abre o dia: o digest matinal da AGÊNCIA
 * (cruza os clientes da org), processável como inbox e com cara de COCKPIT.
 *
 * Server: gera/carrega o digest (ensureDigest — cache-only, não dispara coleta),
 * AGRUPA por sinal (uma manchete, lentes aninhadas) e entrega à HojeView, que
 * cuida do topo glanceável, do não-lido e da interação (estados via /api/briefing).
 */

import { agruparPorSinal, ensureDigest } from "@/lib/digest";

import { HojeView } from "@/components/hoje/hoje-view";

export const dynamic = "force-dynamic";

function tituloDoDia(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(now);
}

export default async function HojePage() {
  const now = new Date();
  const digest = await ensureDigest(now);

  return (
    <HojeView
      grupos={agruparPorSinal(digest.itens)}
      adiados={agruparPorSinal(digest.adiados)}
      tranquilo={digest.tranquilo}
      observacoes={digest.observacoes}
      clientesCount={digest.clientes.length}
      geradoEm={digest.geradoEm}
      tituloDia={tituloDoDia(now)}
      now={now.toISOString()}
    />
  );
}
