/**
 * G — CHARTS do relatório de diagnóstico. Modelo de gráfico EXPORT-AGNÓSTICO
 * (o mesmo spec alimenta SVG na tela, vetor no PDF e chart nativo no PPTX) +
 * construtor DETERMINÍSTICO a partir dos diagnósticos salvos.
 *
 * HONESTIDADE (guardrail do G): todo gráfico carrega `natureza` (fato|opiniao)
 * + `fonte` + `data`. Nada é plotado sem origem. Concorrente sem o dado entra
 * como null/ausente (nunca um valor inventado pra "completar" a barra).
 */

import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

export type Natureza = "fato" | "opiniao";

export type Serie = { label: string; valor: number | null; nota?: string };

/** Barras horizontais (maturidade, reputação, nº de produtos…). */
export type BarrasChart = {
  tipo: "barras";
  titulo: string;
  subtitulo?: string;
  series: Serie[];
  unidade?: string;
  /** teto do eixo (pra escala estável); auto se ausente. */
  max?: number;
  natureza: Natureza;
  fonte: string;
  data: string;
};

/** Grade de presença (concorrentes × canais): célula = sim/não/parcial. */
export type GradeChart = {
  tipo: "grade";
  titulo: string;
  subtitulo?: string;
  colunas: string[];
  linhas: Array<{ label: string; celulas: Array<"sim" | "nao" | "parcial"> }>;
  natureza: Natureza;
  fonte: string;
  data: string;
};

/** Rosca (mix/participação — ex.: presença por canal no mercado). */
export type RoscaChart = {
  tipo: "rosca";
  titulo: string;
  subtitulo?: string;
  fatias: Serie[];
  natureza: Natureza;
  fonte: string;
  data: string;
};

/** Linha (evolução temporal — ex.: movimentos por varredura). */
export type LinhaChart = {
  tipo: "linha";
  titulo: string;
  subtitulo?: string;
  pontos: Array<{ x: string; y: number }>;
  unidade?: string;
  natureza: Natureza;
  fonte: string;
  data: string;
};

/** E1 — Dispersão / mapa 2x2 (concorrentes plotados em dois eixos). */
export type DispersaoPonto = { label: string; x: number; y: number; notaX?: string; notaY?: string };
export type EixoDef = { label: string; min: string; max: string; maxVal: number };
export type DispersaoChart = {
  tipo: "dispersao";
  titulo: string;
  subtitulo?: string;
  eixoX: EixoDef;
  eixoY: EixoDef;
  pontos: DispersaoPonto[];
  /** concorrentes fora do mapa por falta de dado (honesto), com o motivo. */
  ausentes?: string[];
  natureza: Natureza;
  fonte: string;
  data: string;
};

export type ChartSpec = BarrasChart | GradeChart | RoscaChart | LinhaChart | DispersaoChart;

const NIVEL_ORDER = ["icônica", "proprietária", "diferenciada", "padronizada", "clichê", "desestruturada", "defasada"];
function nivelRank(nivel: string | null | undefined): number {
  const i = NIVEL_ORDER.indexOf((nivel ?? "").toLowerCase());
  return i < 0 ? 99 : i;
}

const CANAIS: Array<{ key: keyof DiagnosticoConcorrente["canais"]; label: string }> = [
  { key: "site", label: "Site" },
  { key: "blog", label: "Blog" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** menor data de atualização entre os diagnósticos (transparência da fonte). */
function dataDoConjunto(diags: DiagnosticoConcorrente[]): string {
  return diags.map((d) => d.atualizado_em).sort().at(-1) ?? new Date(0).toISOString();
}

/**
 * Constrói os gráficos do relatório a partir dos diagnósticos de um cliente.
 * Só entra gráfico com dado real; cada um traz natureza/fonte/data. Ausência de
 * dado num concorrente vira valor null (barra vazia rotulada), nunca inventado.
 */
export function buildDiagnosticoCharts(diags: DiagnosticoConcorrente[]): ChartSpec[] {
  if (diags.length === 0) return [];
  const charts: ChartSpec[] = [];
  const data = dataDoConjunto(diags);
  const fonteSites = "sites oficiais dos concorrentes (diagnóstico do Radar)";

  // 1. Maturidade (OPINIÃO) — ranqueada da melhor pra pior
  const comMaturidade = diags.filter((d) => d.maturidade?.status === "avaliado");
  if (comMaturidade.length > 0) {
    charts.push({
      tipo: "barras",
      titulo: "Maturidade de comunicação",
      subtitulo: "régua da Lente 4 — quanto maior, mais madura",
      series: [...comMaturidade]
        .sort((a, b) => nivelRank(a.maturidade?.nivel) - nivelRank(b.maturidade?.nivel))
        .map((d) => ({ label: d.concorrente_nome, valor: d.maturidade?.score ?? null, nota: d.maturidade?.nivel ?? undefined })),
      unidade: "/100",
      max: 100,
      natureza: "opiniao",
      fonte: "avaliação do Radar (Lente 4)",
      data,
    });
  }

  // 2. Presença por canal (FATO) — grade concorrentes × canais
  charts.push({
    tipo: "grade",
    titulo: "Presença por canal",
    subtitulo: "onde cada concorrente está presente",
    colunas: CANAIS.map((c) => c.label),
    linhas: diags.map((d) => ({
      label: d.concorrente_nome,
      celulas: CANAIS.map((c) => (d.canais[c.key]?.presente ? "sim" : "nao")),
    })),
    natureza: "fato",
    fonte: fonteSites,
    data,
  });

  // 3. Reputação (FATO) — melhor nota coletada por concorrente, normalizada 0-100
  const comReputacao = diags
    .map((d) => {
      const fontes = (d.reputacao?.fontes ?? []).filter((f) => f.status === "coletado" && f.nota !== null);
      if (fontes.length === 0) return null;
      // normaliza pra 0-100 (RA 0-10, demais 0-5) e pega a melhor pra ranquear
      const norm = fontes.map((f) => ({ v: (f.nota as number) / (f.escala === "0-10" ? 10 : 5) * 100, fonte: f.fonte, nota: f.nota as number, escala: f.escala }));
      const melhor = norm.sort((a, b) => b.v - a.v)[0];
      return { nome: d.concorrente_nome, valor: Math.round(melhor.v), nota: `${melhor.nota} em ${melhor.fonte}` };
    })
    .filter((x): x is { nome: string; valor: number; nota: string } => Boolean(x));
  if (comReputacao.length > 0) {
    charts.push({
      tipo: "barras",
      titulo: "Reputação (melhor nota pública)",
      subtitulo: "notas de Reclame Aqui / G2 / Capterra, normalizadas a 100",
      series: comReputacao.sort((a, b) => b.valor - a.valor).map((x) => ({ label: x.nome, valor: x.valor, nota: x.nota })),
      unidade: "/100",
      max: 100,
      natureza: "fato",
      fonte: "Reclame Aqui · G2 · Capterra",
      data,
    });
  }

  // 4. Mix de canais no mercado (FATO) — quantos concorrentes em cada canal
  const mix: Serie[] = CANAIS.map((c) => ({
    label: c.label,
    valor: diags.filter((d) => d.canais[c.key]?.presente).length,
  })).filter((s) => (s.valor ?? 0) > 0);
  if (mix.length > 0) {
    charts.push({
      tipo: "rosca",
      titulo: "Mix de canais no mercado",
      subtitulo: `de ${diags.length} concorrente(s), quantos estão em cada canal`,
      fatias: mix,
      natureza: "fato",
      fonte: fonteSites,
      data,
    });
  }

  // E1. Mapa de posicionamento 2x2 (síntese) — logo após maturidade.
  const mapa = buildMapaPosicionamento(diags);
  if (mapa) charts.push(mapa);

  // 5. Evolução (FATO) — movimentos por varredura (do histórico F1a). Honesto:
  // só aparece quando há ≥2 varreduras acumuladas (senão a série é uma linha reta).
  const maxSnaps = Math.max(...diags.map((d) => d.historico?.length ?? 0));
  if (maxSnaps >= 2) {
    // agrega por dia de detecção de movimento, no conjunto
    const porDia = new Map<string, number>();
    for (const d of diags) {
      for (const m of d.movimentos ?? []) {
        if (m.tipo === "primeira_coleta") continue;
        const dia = m.data_deteccao.slice(0, 10);
        porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
      }
    }
    const pontos = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, y]) => ({ x, y }));
    if (pontos.length >= 1) {
      charts.push({
        tipo: "linha",
        titulo: "Movimentos detectados ao longo do tempo",
        subtitulo: "mudanças reais entre varreduras (tagline, produto, preço, nota…)",
        pontos,
        unidade: "movimentos",
        natureza: "fato",
        fonte: "varreduras do diagnóstico (Radar)",
        data,
      });
    }
  }

  return charts;
}

/**
 * E1 — MAPA DE POSICIONAMENTO 2x2. Síntese sobre o que JÁ coletamos:
 *   eixo X = amplitude de portfólio (nº de produtos: especialista → generalista)
 *   eixo Y = maturidade de comunicação (Lente 4: defasado → referência)
 * Honesto: X é heurística transparente (contagem de produtos, rotulada); Y é
 * OPINIÃO (a régua da Lente 4). Concorrente sem maturidade avaliada NÃO é
 * plotado (fica em `ausentes` com o motivo) — nunca uma posição inventada.
 */
export function buildMapaPosicionamento(diags: DiagnosticoConcorrente[]): DispersaoChart | null {
  const data = dataDoConjunto(diags);
  const plotaveis = diags.filter((d) => d.maturidade?.status === "avaliado" && d.maturidade.score !== null);
  if (plotaveis.length < 2) return null; // 2x2 só faz sentido com ≥2 pontos

  const maxProdutos = Math.max(1, ...plotaveis.map((d) => d.posicionamento.produtos.length));
  const pontos: DispersaoPonto[] = plotaveis.map((d) => ({
    label: d.concorrente_nome,
    x: d.posicionamento.produtos.length,
    y: d.maturidade!.score as number,
    notaX: `${d.posicionamento.produtos.length} produto(s)`,
    notaY: d.maturidade!.nivel ?? undefined,
  }));
  const ausentes = diags
    .filter((d) => !(d.maturidade?.status === "avaliado" && d.maturidade.score !== null))
    .map((d) => `${d.concorrente_nome} (sem maturidade avaliada)`);

  return {
    tipo: "dispersao",
    titulo: "Mapa de posicionamento do mercado",
    subtitulo: "amplitude de portfólio × maturidade de comunicação",
    eixoX: { label: "Amplitude de portfólio", min: "especialista", max: "generalista", maxVal: maxProdutos },
    eixoY: { label: "Maturidade de comunicação", min: "defasado", max: "referência", maxVal: 100 },
    pontos,
    ausentes: ausentes.length ? ausentes : undefined,
    natureza: "opiniao", // Y é opinião (Lente 4); X é heurística de contagem
    fonte: "diagnóstico do Radar — nº de produtos (fato) × maturidade (opinião Lente 4)",
    data,
  };
}

/** Resumo textual dos gráficos — vira o "material" pro narrador do relatório. */
export function chartsToMaterial(charts: ChartSpec[]): string {
  return charts
    .map((c) => {
      const head = `[${c.natureza.toUpperCase()}] ${c.titulo} (fonte: ${c.fonte})`;
      if (c.tipo === "barras") return `${head}\n${c.series.map((s) => `  - ${s.label}: ${s.valor ?? "sem dado"}${c.unidade ?? ""}${s.nota ? ` (${s.nota})` : ""}`).join("\n")}`;
      if (c.tipo === "rosca") return `${head}\n${c.fatias.map((s) => `  - ${s.label}: ${s.valor}`).join("\n")}`;
      if (c.tipo === "linha") return `${head}\n${c.pontos.map((p) => `  - ${p.x}: ${p.y}`).join("\n")}`;
      if (c.tipo === "dispersao")
        return `${head} (X=${c.eixoX.label} ${c.eixoX.min}→${c.eixoX.max}; Y=${c.eixoY.label} ${c.eixoY.min}→${c.eixoY.max})\n${c.pontos.map((p) => `  - ${p.label}: ${c.eixoX.label}=${p.x}${p.notaX ? ` (${p.notaX})` : ""}, ${c.eixoY.label}=${p.y}${p.notaY ? ` (${p.notaY})` : ""}`).join("\n")}${c.ausentes?.length ? `\n  (fora do mapa: ${c.ausentes.join(", ")})` : ""}`;
      // grade
      return `${head}\n  colunas: ${c.colunas.join(", ")}\n${c.linhas.map((l) => `  - ${l.label}: ${l.celulas.map((v, i) => (v === "sim" ? c.colunas[i] : null)).filter(Boolean).join(", ") || "nenhum"}`).join("\n")}`;
    })
    .join("\n\n");
}

export { hostDe };
