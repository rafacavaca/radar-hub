/**
 * GRÁFICOS SVG do dossiê (F2 redesign) — SVG server-side, vetorial (nítido no
 * PDF), temado ao design system. HONESTIDADE: gráfico SÓ com dado real; o
 * "encaixe" é DERIVADO (regra transparente), marcado como tal — nunca um número
 * inventado. Sem dado suficiente → o chamador não desenha (diz "sem dado").
 */

import { CHART_THEME } from "@/lib/diagnostico/chart-theme";
import type { EncaixeProspect } from "@/lib/prospects/schema";

export type NivelEncaixe = { nivel: "forte" | "médio" | "fraco" | "sem dado"; pct: number; nota: string };

/**
 * Nível de encaixe DERIVADO (transparente): a partir do Brain (a nossa oferta)
 * e de quantos ganchos/dores o cruzamento produziu. NÃO é um score preciso
 * inventado — é um resumo qualitativo, rotulado, com a regra na `nota`.
 */
export function nivelEncaixe(e: EncaixeProspect): NivelEncaixe {
  if (e.brain_mode === "none") return { nivel: "sem dado", pct: 0, nota: "sem base deste cliente" };
  const n = e.ganchos.length + e.dores.length;
  const base = e.brain_mode === "live" ? "Base real" : "Base de rascunho";
  if (n === 0) return { nivel: "fraco", pct: 22, nota: `${base}, sem ganchos/dores claros` };
  if (n <= 2) return { nivel: "médio", pct: 52, nota: `${base}, ${n} sinal(is) de aderência` };
  if (n <= 4) return { nivel: "forte", pct: 78, nota: `${base}, ${n} sinais de aderência` };
  return { nivel: "forte", pct: 92, nota: `${base}, ${n} sinais de aderência` };
}

const COR_NIVEL: Record<NivelEncaixe["nivel"], string> = {
  forte: CHART_THEME.positive,
  médio: CHART_THEME.opinion,
  fraco: CHART_THEME.ink400,
  "sem dado": CHART_THEME.absent,
};

/** ponto na circunferência (gauge semicircular, 180° → 0°). */
function ponto(cx: number, cy: number, r: number, frac: number): [number, number] {
  const ang = Math.PI * (1 - frac); // 1=esquerda(180°) .. 0=direita(0°)
  return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
}

/**
 * GAUGE de encaixe (medidor semicircular) — arco de fundo + arco preenchido até
 * `pct` + ponteiro + rótulo do nível. Derivado e honesto (o chamador põe o selo).
 */
export function gaugeEncaixeSvg(nv: NivelEncaixe): string {
  const W = 200;
  const H = 120;
  const cx = W / 2;
  const cy = 100;
  const r = 78;
  const frac = Math.max(0, Math.min(1, nv.pct / 100));
  const cor = COR_NIVEL[nv.nivel];

  const [bx0, by0] = ponto(cx, cy, r, 0);
  const [bx1, by1] = ponto(cx, cy, r, 1);
  const arcoFundo = `M ${bx1.toFixed(1)} ${by1.toFixed(1)} A ${r} ${r} 0 0 1 ${bx0.toFixed(1)} ${by0.toFixed(1)}`;
  const [fx, fy] = ponto(cx, cy, r, frac);
  const grande = frac > 0.5 ? 1 : 0;
  const arcoFill = `M ${bx1.toFixed(1)} ${by1.toFixed(1)} A ${r} ${r} 0 ${grande} 1 ${fx.toFixed(1)} ${fy.toFixed(1)}`;
  const [px, py] = ponto(cx, cy, r - 16, frac);

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="aderência ${nv.nivel}">
    <path d="${arcoFundo}" fill="none" stroke="${CHART_THEME.grid}" stroke-width="14" stroke-linecap="round"/>
    ${nv.nivel !== "sem dado" ? `<path d="${arcoFill}" fill="none" stroke="${cor}" stroke-width="14" stroke-linecap="round"/>` : ""}
    ${nv.nivel !== "sem dado" ? `<line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${CHART_THEME.ink}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4" fill="${CHART_THEME.ink}"/>` : ""}
    <text x="${cx}" y="${cy - 24}" text-anchor="middle" font-family="Archivo, sans-serif" font-size="20" font-weight="700" fill="${cor}">${nv.nivel === "sem dado" ? "—" : nv.nivel.toUpperCase()}</text>
  </svg>`;
}
