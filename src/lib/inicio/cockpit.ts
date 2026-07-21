/**
 * ZONA B da Home — COCKPIT "Meus clientes" (ORG-SCOPED, todo mundo vê o SEU).
 * Uma linha por cliente que a agência atende, respondendo "o que precisa de
 * mim, e onde": ação pendente, novidades do dia, última varredura e saúde da
 * coleta. Ordenado por quem pede mais ação primeiro.
 *
 * REUSO (não duplica o Hoje): a contagem de AÇÃO vem do MESMO `ensureDigest`
 * que o Hoje usa (cache-only, nunca coleta) — aqui é o ROLLUP por cliente; o
 * Hoje é a lista chapada dos itens. A saúde (varredura/coleta) vem do cache do
 * loop; a cadência, das Automações.
 */

import { ensureDigest } from "@/lib/digest";
import { loadRadarForRender } from "@/lib/loop";
import { loadAutomacoes, cadenciaLabel, type Automacao } from "@/lib/automacoes";
import { localDayKey } from "@/lib/schedules";
import { loadWatchlist } from "@/lib/watchlist";

export type ClienteSaude = {
  name: string;
  mode: string;
  /** home do cliente conforme o modo (pra o link "abrir"). */
  href: string;
  /** itens pendentes de ação (rollup do digest do Hoje). */
  acao: number;
  /** sinais novos hoje (coletados hoje, fuso Brasil). */
  novos: number;
};

export type Cockpit = {
  clientes: ClienteSaude[];
  /** ISO da última varredura do loop (org), ou null se nunca rodou. */
  ultimaVarredura: string | null;
  /** falhas de coleta na última rodada (0 = ok). */
  falhasColeta: number;
  /** cache de hoje ausente → a tela pede aquecimento em background. */
  needsRefresh: boolean;
  /** varredura automática de concorrentes (org): ligada? com que cadência? */
  cadencia: { ligada: boolean; label: string };
  /** transparência do dia (falhas/cortes) — honesto, não esconde. */
  observacoes: string[];
};

function homeDoCliente(mode: string, name: string): string {
  const base = mode === "carteira" ? "/carteira" : "/visao";
  return `${base}?cliente=${encodeURIComponent(name)}`;
}

function cadenciaTexto(a: Automacao): string {
  return a.enabled ? `varredura automática ${cadenciaLabel(a.cadencia)}` : "varredura automática desligada";
}

export async function loadCockpit(now: Date = new Date()): Promise<Cockpit> {
  const watchlist = await loadWatchlist();
  const [render, digest, auto] = await Promise.all([
    loadRadarForRender(), // ranAt + needsRefresh + itens (mais recente, nunca coleta)
    ensureDigest(now), // itens pendentes por cliente (rollup do Hoje)
    loadAutomacoes(),
  ]);

  const hoje = localDayKey(now);
  const acaoPorCliente = new Map<string, number>();
  for (const item of digest.itens) {
    acaoPorCliente.set(item.clientName, (acaoPorCliente.get(item.clientName) ?? 0) + 1);
  }
  const novosPorCliente = new Map<string, number>();
  for (const it of render.items) {
    const quando = it.collectedAt ?? it.createdAt;
    if (quando && localDayKey(new Date(quando)) === hoje) {
      novosPorCliente.set(it.clientName, (novosPorCliente.get(it.clientName) ?? 0) + 1);
    }
  }

  const clientes: ClienteSaude[] = watchlist.clients
    .map((c) => {
      const mode = c.mode ?? "concorrentes";
      return {
        name: c.name,
        mode,
        href: homeDoCliente(mode, c.name),
        acao: acaoPorCliente.get(c.name) ?? 0,
        novos: novosPorCliente.get(c.name) ?? 0,
      };
    })
    .sort((a, b) => b.acao - a.acao || b.novos - a.novos || a.name.localeCompare(b.name));

  return {
    clientes,
    ultimaVarredura: render.ranAt || null,
    falhasColeta: render.failures?.length ?? 0,
    needsRefresh: Boolean(render.needsRefresh),
    cadencia: { ligada: auto.diagnostico.enabled, label: cadenciaTexto(auto.diagnostico) },
    observacoes: digest.observacoes ?? [],
  };
}
