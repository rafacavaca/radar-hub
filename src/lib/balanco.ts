/**
 * BALANÇO do ritual (colher o histórico) — transforma os estados marcados no Hoje
 * em NÚMEROS de prova de valor: quantos sinais você processou numa janela, e de
 * quantos você ATUOU (a taxa de ação). Puro — agrega os registros do histórico
 * (durável), sem rede. É a base do track-record e da calibração (Lote 2).
 */

import type { BriefingEstado, EstadoRegistro } from "@/lib/briefing-estado";
import type { DigestItemKind } from "@/lib/digest";

export type BalancoContagem = { atuado: number; adiado: number; ignorado: number; arquivado: number; total: number };
export type BalancoLinha = { label: string; contagem: BalancoContagem };
export type Balanco = {
  dias: number;
  desde: string;
  total: BalancoContagem;
  /** de todos os processados, a fração que você ATUOU (0..1) — a prova de valor. */
  taxaAcao: number;
  porCliente: BalancoLinha[];
  porTipo: BalancoLinha[];
};

const KIND_LABEL: Record<DigestItemKind, string> = {
  leitura: "Leituras de área",
  gatilho: "Gatilhos de venda",
  jogada: "Jogadas de relacionamento",
  alerta: "Alertas de concorrente",
  relatorio: "Relatórios",
  reuniao: "Reuniões",
};

function zero(): BalancoContagem {
  return { atuado: 0, adiado: 0, ignorado: 0, arquivado: 0, total: 0 };
}
function bump(c: BalancoContagem, e: BriefingEstado): void {
  c[e]++;
  c.total++;
}

/** Agrega os registros numa janela de `dias` (a partir de `now`, pelo `em`). */
export function calcularBalanco(regs: EstadoRegistro[], dias: number, now: Date): Balanco {
  const desde = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
  const janela = regs.filter((r) => r.em >= desde);

  const total = zero();
  const cli = new Map<string, BalancoContagem>();
  const tipo = new Map<DigestItemKind, BalancoContagem>();
  for (const r of janela) {
    bump(total, r.estado);
    const c = cli.get(r.item.clientName) ?? zero();
    bump(c, r.estado);
    cli.set(r.item.clientName, c);
    const t = tipo.get(r.item.kind) ?? zero();
    bump(t, r.estado);
    tipo.set(r.item.kind, t);
  }

  const linhas = (m: Map<string, BalancoContagem>, label: (k: string) => string): BalancoLinha[] =>
    [...m.entries()].map(([k, contagem]) => ({ label: label(k), contagem })).sort((a, b) => b.contagem.total - a.contagem.total);

  return {
    dias,
    desde,
    total,
    taxaAcao: total.total > 0 ? total.atuado / total.total : 0,
    porCliente: linhas(cli, (k) => k),
    porTipo: linhas(tipo as Map<string, BalancoContagem>, (k) => KIND_LABEL[k as DigestItemKind] ?? k),
  };
}

/**
 * CALIBRAÇÃO (colher o histórico) — a régua NOTA o que você ignora/atua de forma
 * sistemática e sugere um ajuste. É o princípio 30/60/90: a leitura vira sinal, o
 * HUMANO decide (nada re-rankeia sozinho). Só dispara com volume mínimo (senão é
 * ruído) e taxa alta num sentido. Puro — deriva do Balanço.
 */
export type CalibracaoInsight = {
  dimensao: "cliente" | "tipo";
  label: string;
  padrao: "ignora" | "atua";
  n: number;
  total: number;
  pct: number;
  sugestao: string;
};

const MIN_VOLUME = 4; // abaixo disso é ruído, não padrão
const LIMIAR = 0.7; // 70%+ num sentido = padrão claro

export function calibrar(b: Balanco): CalibracaoInsight[] {
  const out: CalibracaoInsight[] = [];
  const scan = (linhas: BalancoLinha[], dim: "cliente" | "tipo") => {
    for (const l of linhas) {
      const c = l.contagem;
      if (c.total < MIN_VOLUME) continue;
      const ign = c.ignorado / c.total;
      const act = c.atuado / c.total;
      if (ign >= LIMIAR) {
        const pct = Math.round(ign * 100);
        out.push({
          dimensao: dim, label: l.label, padrao: "ignora", n: c.ignorado, total: c.total, pct,
          sugestao:
            dim === "cliente"
              ? `Você ignorou ${c.ignorado} de ${c.total} (${pct}%) sinais de ${l.label}. Se não é foco, reveja o que vigia em Concorrentes — ou pause a coleta em Automações.`
              : `Você ignorou ${c.ignorado} de ${c.total} (${pct}%) de "${l.label}". Talvez o peso dessa área esteja alto pro seu foco — ajuste em Áreas.`,
        });
      } else if (act >= LIMIAR) {
        const pct = Math.round(act * 100);
        out.push({
          dimensao: dim, label: l.label, padrao: "atua", n: c.atuado, total: c.total, pct,
          sugestao:
            dim === "cliente"
              ? `Você atuou em ${c.atuado} de ${c.total} (${pct}%) sinais de ${l.label} — o Radar está no alvo aqui.`
              : `Você atuou em ${c.atuado} de ${c.total} (${pct}%) de "${l.label}" — essa área tem rendido.`,
        });
      }
    }
  };
  scan(b.porCliente, "cliente");
  scan(b.porTipo, "tipo");
  return out.sort((a, z) => z.total - a.total);
}
