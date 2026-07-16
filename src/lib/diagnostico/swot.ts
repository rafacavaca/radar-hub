/**
 * Onda 3 · F — SWOT VIVO por concorrente. Frame estratégico clássico, montado
 * do que JÁ foi coletado (zero scrape novo). Distinto do battlecard (que é
 * sales-enablement "como ganhar deles"): o SWOT é a leitura estratégica DO
 * concorrente.
 *
 * HONESTIDADE POR CONSTRUÇÃO:
 * - Forças/Fraquezas = INTERNAS, ancoradas em EVIDÊNCIA numerada (dado real com
 *   fonte). Índice inválido → item descartado em código.
 * - Oportunidades/Ameaças = EXTERNAS, SÍNTESE rascunhada (o estrategista decide);
 *   podem citar movimento/notícia real quando existir, mas são interpretação.
 * - Rotulado tipo:"derivado". Brain (nosso cliente) entra só pra ancorar a
 *   leitura externa; brain "none" ⇒ leitura externa mais conservadora.
 */

import { fetchClientBrain } from "@/lib/brain";
import { completeViaGateway } from "@/lib/gateway";
import { montarEvidencias } from "@/lib/diagnostico/battlecard";
import type { DiagnosticoConcorrente, Swot, SwotItem } from "@/lib/diagnostico/schema";

const SYSTEM =
  "Você monta uma análise SWOT de UM concorrente, para o dono da agência do NOSSO cliente. " +
  "Recebe: (a) EVIDÊNCIAS numeradas (E1, E2…) — fatos coletados sobre o concorrente; (b) CONTEXTO DO BRAIN do nosso cliente (para a leitura externa). " +
  "REGRAS INVIOLÁVEIS: " +
  "(1) FORÇAS e FRAQUEZAS são internas do concorrente e CADA uma aponta 'evidencia' = número de UMA evidência que a sustenta — sem evidência, não afirme; " +
  "(2) OPORTUNIDADES e AMEAÇAS são externas (mercado/movimento) — são SÍNTESE; podem referenciar uma evidência quando houver (campo 'evidencia' opcional), mas não invente fatos; enquadre como leitura, não como certeza; " +
  "(3) máx 4 itens por quadrante; frases curtas; português do Brasil; " +
  "(4) 'ameaças' são ameaças AO CONCORRENTE (o que o coloca em risco), não ao nosso cliente. " +
  'Responda SÓ JSON: {"forcas":[{"texto":"...","evidencia":1}],"fraquezas":[{"texto":"...","evidencia":2}],"oportunidades":[{"texto":"...","evidencia":3|null}],"ameacas":[{"texto":"...","evidencia":null}]}';

type RawItem = { texto?: unknown; evidencia?: unknown };
type RawSwot = { forcas?: RawItem[]; fraquezas?: RawItem[]; oportunidades?: RawItem[]; ameacas?: RawItem[] };

export async function gerarSwot(diag: DiagnosticoConcorrente): Promise<Swot> {
  const agora = new Date().toISOString();
  const evidencias = montarEvidencias(diag);
  const brain = await fetchClientBrain(diag.clientName);

  const evLista = evidencias.map((e, i) => `E${i + 1}. ${e.texto}${e.citacao ? ` — "${e.citacao.slice(0, 120)}"` : ""}`).join("\n");
  const brainBloco =
    brain.mode === "none"
      ? "CONTEXTO DO BRAIN: nenhum — seja conservador na leitura externa (oportunidades/ameaças mais genéricas)."
      : `CONTEXTO DO BRAIN do nosso cliente (${brain.mode === "live" ? "real" : brain.mode === "local" ? "base local da implantação" : "rascunho local"}):\n${brain.context.slice(0, 3000)}`;

  let content = "";
  try {
    content = await completeViaGateway({
      system: SYSTEM,
      prompt: `CONCORRENTE: ${diag.concorrente_nome} (${diag.site_url})\nNOSSO CLIENTE: ${diag.clientName}\n\nEVIDÊNCIAS:\n${evLista}\n\n${brainBloco}\n\nMonte o SWOT do concorrente, honesto.`,
    });
  } catch {
    content = "";
  }

  let parsed: RawSwot = {};
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      parsed = JSON.parse(m[0]) as RawSwot;
    } catch {
      parsed = {};
    }
  }

  const evDe = (evidencia: unknown): { fonte_url?: string } | null => {
    const idx = Number(evidencia);
    return Number.isInteger(idx) && idx >= 1 && idx <= evidencias.length ? evidencias[idx - 1] : null;
  };

  /** interno: exige evidência válida (senão descarta). */
  const interno = (arr: RawItem[] | undefined): SwotItem[] => {
    const out: SwotItem[] = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
      const texto = typeof raw.texto === "string" ? raw.texto.trim() : "";
      const e = evDe(raw.evidencia);
      if (texto && e) out.push(e.fonte_url ? { texto, fonte_url: e.fonte_url } : { texto });
    }
    return out.slice(0, 4);
  };

  /** externo: evidência OPCIONAL (síntese); sem evidência, sem fonte. */
  const externo = (arr: RawItem[] | undefined): SwotItem[] => {
    const out: SwotItem[] = [];
    for (const raw of Array.isArray(arr) ? arr : []) {
      const texto = typeof raw.texto === "string" ? raw.texto.trim() : "";
      if (!texto) continue;
      const e = evDe(raw.evidencia);
      out.push(e?.fonte_url ? { texto, fonte_url: e.fonte_url } : { texto });
    }
    return out.slice(0, 4);
  };

  return {
    forcas: interno(parsed.forcas),
    fraquezas: interno(parsed.fraquezas),
    oportunidades: externo(parsed.oportunidades),
    ameacas: externo(parsed.ameacas),
    brain_mode: brain.mode,
    gerado_em: agora,
    tipo: "derivado",
  };
}
