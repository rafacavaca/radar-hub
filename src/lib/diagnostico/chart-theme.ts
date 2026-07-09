/**
 * Paleta ÚNICA dos gráficos do relatório — a MESMA em SVG (tela), vetor (PDF) e
 * chart nativo (PPTX), pra o relatório ler como um sistema só. Espelha os tokens
 * do design-system (globals.css): papel quente, vermelho de marca, tinta stone.
 */

export const CHART_THEME = {
  paper: "#f6f4ef",
  ink: "#14130f",
  ink700: "#3a362e",
  ink400: "#8c8578",
  grid: "#e7e2d8",
  brand: "#b8443c", // radar-500
  brandSoft: "#e7c9c6",
  fact: "#2a6fdb", // info — fato
  factSoft: "#e7effb",
  opinion: "#c07a12", // âmbar — opinião
  opinionSoft: "#f6ecd8",
  positive: "#1f8a4c",
  absent: "#d8d2c6",
  /** rotação categórica (mix de canais) — quente, coerente com o papel. */
  categoric: ["#b8443c", "#2a6fdb", "#1f8a4c", "#c07a12", "#7a5cc0", "#3a9db0", "#a0526d", "#5a7d3a"],
} as const;

/** Cor da barra conforme a natureza do dado (fato azul / opinião âmbar). */
export function corPorNatureza(natureza: "fato" | "opiniao"): string {
  return natureza === "opiniao" ? CHART_THEME.opinion : CHART_THEME.brand;
}
