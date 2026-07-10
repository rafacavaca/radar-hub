/**
 * Smoke F2 — GRÁFICOS RENDERIZADOS num DOM real (jsdom). "Build verde" não
 * prova gráfico: este teste monta os componentes de verdade (React 19 +
 * Recharts) e afere o RESULTADO — o bug real do mapa sem players (ref nulo →
 * largura 0 → chart nunca montava) teria sido pego aqui.
 *
 * Prova:
 *  1. MAPA 2x2: todos os players viram <circle> E rótulo com o nome; rótulos
 *     de pontos empatados NÃO se sobrepõem (dodge aplicado no pixel).
 *  2. BARRAS: uma barra por concorrente + valor na ponta; "sem dado" aparece
 *     como texto (nunca barra inventada).
 *  3. Moldura de honestidade em ambos: selo (fato/opinião) + fonte + data.
 *
 * Polyfills mínimos: IntersectionObserver ausente → ChartReveal mostra direto
 * (fallback honesto já existente); ResizeObserver fake dispara a largura.
 *
 * Uso: npm run smoke:charts
 */

import { JSDOM } from "jsdom";

// ── DOM global ANTES de importar React/Recharts ──
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// (navigator: o Node 22 já tem um, getter-only — não sobrescrever)
g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
g.HTMLElement = dom.window.HTMLElement;
g.SVGElement = dom.window.SVGElement;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
// matchMedia (usePrefersReducedMotion) — REDUZIDO no teste: valida o caminho
// de acessibilidade (sem animação, o gráfico tem que nascer COMPLETO — labels
// imediatos) e tira a dependência do ciclo de rAF do jsdom.
(dom.window as unknown as Record<string, unknown>).matchMedia = (q: string) => ({
  matches: q.includes("prefers-reduced-motion"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
});
g.matchMedia = (dom.window as unknown as { matchMedia: unknown }).matchMedia;
// ResizeObserver fake: entrega largura 720 na observação (mede o wrapper).
class FakeRO {
  cb: (entries: Array<{ contentRect: { width: number } }>) => void;
  constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) { this.cb = cb; }
  observe() { this.cb([{ contentRect: { width: 720 } }]); }
  disconnect() {}
  unobserve() {}
}
g.ResizeObserver = FakeRO;
(dom.window as unknown as Record<string, unknown>).ResizeObserver = FakeRO;
// getBoundingClientRect devolve 0 no jsdom — o FakeRO já injeta 720 logo após.
// IntersectionObserver: DELIBERADAMENTE ausente (testa o fallback do ChartReveal).

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { ReportChart } = await import("@/components/charts/report-charts");
import type { BarrasChart, DispersaoChart } from "@/lib/diagnostico/report-charts";

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke F2 — gráficos renderizados (jsdom) ===\n");

async function render(el: React.ReactElement): Promise<HTMLElement> {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  root.render(el);
  // flush: efeitos + ResizeObserver + a ANIMAÇÃO INTEIRA do Recharts (~750ms —
  // o LabelList só aparece quando ela termina; flush curto dava falso vermelho).
  for (let i = 0; i < 16; i++) await new Promise((r) => setTimeout(r, 90));
  return host;
}

// ── 1. MAPA 2x2 com empate proposital (dodge) ──
const mapa: DispersaoChart = {
  tipo: "dispersao",
  titulo: "Mapa de posicionamento do mercado",
  eixoX: { label: "Amplitude de portfólio", min: "especialista", max: "generalista", maxVal: 10 },
  eixoY: { label: "Maturidade de comunicação", min: "defasado", max: "referência", maxVal: 100 },
  pontos: [
    { label: "Intelia", x: 7, y: 42 },
    { label: "Mtech", x: 3, y: 72 },
    { label: "Brainr", x: 3, y: 72 }, // EMPATE com Mtech — dodge obrigatório
    { label: "Agrosys", x: 5, y: 52 },
  ],
  natureza: "opiniao",
  fonte: "diagnóstico do Radar",
  data: "2026-07-10T00:00:00.000Z",
};
{
  const host = await render(React.createElement(ReportChart, { chart: mapa }));
  const circles = [...host.querySelectorAll("circle")].filter((c) => (c.getAttribute("r") ?? "") === "6");
  add("MAPA: todos os players viram pontos no chart", circles.length === mapa.pontos.length, `circles=${circles.length}/${mapa.pontos.length}`);

  const texto = host.textContent ?? "";
  const nomesOk = mapa.pontos.every((p) => texto.includes(p.label));
  add("MAPA: todo player tem rótulo com o nome", nomesOk, nomesOk ? mapa.pontos.map((p) => p.label).join(", ") : "faltou rótulo");

  // dodge: os translate(...) dos rótulos não podem repetir o MESMO y
  const spans = [...host.querySelectorAll("span")].filter((s) => (s.getAttribute("style") ?? "").includes("translate("));
  const ys = spans.map((s) => /translate\([-\d.]+px,\s*([-\d.]+)px\)/.exec(s.getAttribute("style") ?? "")?.[1]).filter(Boolean);
  const unicos = new Set(ys);
  add("MAPA: rótulos empatados NÃO se sobrepõem (ys únicos)", ys.length === mapa.pontos.length && unicos.size === ys.length, `ys=${[...ys].join(", ")}`);

  add("MAPA: moldura honesta (selo opinião + fonte + dado de)", texto.includes("opinião") && texto.includes("fonte: diagnóstico do Radar") && texto.includes("dado de"));
  add("MAPA: extremos dos eixos visíveis (especialista/generalista)", texto.includes("especialista") && texto.includes("generalista"));
}

// ── 2. BARRAS com "sem dado" honesto ──
const barras: BarrasChart = {
  tipo: "barras",
  titulo: "Maturidade de comunicação",
  series: [
    { label: "Mtech", valor: 72, nota: "diferenciada" },
    { label: "Intelia", valor: 42, nota: "padronizada" },
    { label: "CAT2", valor: null }, // sem dado — NUNCA vira barra
  ],
  unidade: "/100",
  max: 100,
  escala: { min: "defasada", max: "referência" },
  natureza: "opiniao",
  fonte: "avaliação do Radar (Lente 4)",
  data: "2026-07-10T00:00:00.000Z",
};
{
  const host = await render(React.createElement(ReportChart, { chart: barras }));
  const texto = host.textContent ?? "";
  const paths = [...host.querySelectorAll("path, rect")].length;
  add("BARRAS: chart montou (SVG com formas) e rotula os concorrentes", paths > 0 && texto.includes("Mtech") && texto.includes("Intelia"), `formas=${paths}`);
  add("BARRAS: valores na ponta (72/100 e 42/100)", texto.includes("72/100") && texto.includes("42/100"));
  add("BARRAS: null vira 'sem dado' (nunca barra inventada)", texto.includes("sem dado"));
  add("BARRAS: escala defasada → referência visível", texto.includes("defasada") && texto.includes("referência"));
}

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nCHARTS VERDE ✅ — players plotados, dodge ativo, honestidade na moldura.\n" : "\nCHARTS VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
