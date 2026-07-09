/**
 * G — EXPORTAÇÃO do relatório: PDF (pdf-lib, gráficos VETORIAIS nativos) e PPTX
 * (pptxgenjs, 1 seção por slide + charts nativos). Server-only.
 *
 * Os gráficos usam a MESMA paleta do design-system (chart-theme) que o SVG da
 * tela — o export lê como o mesmo sistema. Fonte + data + natureza (fato/opinião)
 * acompanham cada gráfico (guardrail do G: nada sem origem).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import PptxGenJS from "pptxgenjs";

import { CHART_THEME } from "@/lib/diagnostico/chart-theme";
import type { ChartSpec } from "@/lib/diagnostico/report-charts";
import { formatDateShort } from "@/lib/format";
import type { Report } from "@/lib/reports";

// ── util ─────────────────────────────────────────────────────────────────────

/** hex "#rrggbb" -> rgb() do pdf-lib (0-1). */
function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
/** hex sem "#" pro pptxgenjs. */
function bare(h: string): string {
  return h.replace("#", "");
}

const PAPER_HEX = bare(CHART_THEME.paper);

/** Helvetica (StandardFonts) usa WinAnsi — troca chars fora dela pra não quebrar. */
function ansi(s: string): string {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/[^\x00-\xFF]/g, "");
}

type Bloco = { tipo: "h1" | "h2" | "p" | "li"; texto: string };

/** Markdown enxuto -> blocos (título/seção/parágrafo/item). */
function mdToBlocos(corpo: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const raw of corpo.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    if (/^#\s+/.test(l)) blocos.push({ tipo: "h1", texto: l.replace(/^#\s+/, "") });
    else if (/^#{2,3}\s+/.test(l)) blocos.push({ tipo: "h2", texto: l.replace(/^#{2,3}\s+/, "") });
    else if (/^[-*]\s+/.test(l)) blocos.push({ tipo: "li", texto: l.replace(/^[-*]\s+/, "") });
    else blocos.push({ tipo: "p", texto: l });
  }
  // limpa marcações inline (**bold**, `code`)
  return blocos.map((b) => ({ ...b, texto: b.texto.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1") }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF (pdf-lib) — vetor, A4, papel do design-system
// ─────────────────────────────────────────────────────────────────────────────

const A4 = { w: 595, h: 842 };
const M = 48; // margem

type PdfCtx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont };

function novaPagina(ctx: PdfCtx): void {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: hex(CHART_THEME.paper) });
  ctx.y = A4.h - M;
}

function garanteEspaco(ctx: PdfCtx, altura: number): void {
  if (ctx.y - altura < M) novaPagina(ctx);
}

function wrap(font: PDFFont, texto: string, size: number, maxW: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tent = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(tent, size) > maxW && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = tent;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function texto(ctx: PdfCtx, s: string, opts: { size: number; bold?: boolean; cor?: string; gap?: number; indent?: number }): void {
  const font = opts.bold ? ctx.bold : ctx.font;
  const cor = hex(opts.cor ?? CHART_THEME.ink);
  const x = M + (opts.indent ?? 0);
  const maxW = A4.w - M - x;
  for (const linha of wrap(font, ansi(s), opts.size, maxW)) {
    garanteEspaco(ctx, opts.size + 4);
    ctx.page.drawText(linha, { x, y: ctx.y - opts.size, size: opts.size, font, color: cor });
    ctx.y -= opts.size + 3;
  }
  ctx.y -= opts.gap ?? 0;
}

function rodapeChart(ctx: PdfCtx, c: ChartSpec): void {
  const nat = c.natureza === "opiniao" ? "opiniao" : "fato";
  texto(ctx, `[${nat}] fonte: ${c.fonte} - dado de ${formatDateShort(c.data) ?? c.data.slice(0, 10)}`, {
    size: 7.5,
    cor: CHART_THEME.ink400,
    gap: 14,
  });
}

/** desenha um gráfico como VETOR (barras/grade/rosca->barras/linha). */
function desenhaChart(ctx: PdfCtx, c: ChartSpec): void {
  garanteEspaco(ctx, 40);
  texto(ctx, c.titulo, { size: 11, bold: true, gap: 2 });
  if (c.subtitulo) texto(ctx, c.subtitulo, { size: 8, cor: CHART_THEME.ink400, gap: 4 });

  if (c.tipo === "barras" || c.tipo === "rosca") {
    const series = c.tipo === "barras" ? c.series : c.fatias;
    const max = c.tipo === "barras" ? c.max ?? Math.max(1, ...series.map((s) => s.valor ?? 0)) : Math.max(1, ...series.map((s) => s.valor ?? 0));
    const cor = c.natureza === "opiniao" ? CHART_THEME.opinion : CHART_THEME.brand;
    const barMaxW = A4.w - M - M - 150;
    for (const s of series) {
      garanteEspaco(ctx, 16);
      const w = s.valor === null ? 0 : (s.valor / max) * barMaxW;
      ctx.page.drawText(ansi(s.label).slice(0, 22), { x: M, y: ctx.y - 10, size: 8, font: ctx.font, color: hex(CHART_THEME.ink700) });
      ctx.page.drawRectangle({ x: M + 110, y: ctx.y - 12, width: barMaxW, height: 9, color: hex(CHART_THEME.grid) });
      if (w > 0) ctx.page.drawRectangle({ x: M + 110, y: ctx.y - 12, width: w, height: 9, color: hex(c.tipo === "rosca" ? CHART_THEME.fact : cor) });
      const valTxt = s.valor === null ? "sem dado" : `${s.valor}${c.tipo === "barras" ? c.unidade ?? "" : ""}`;
      ctx.page.drawText(valTxt, { x: M + 114 + barMaxW, y: ctx.y - 10, size: 7.5, font: ctx.font, color: hex(CHART_THEME.ink400) });
      ctx.y -= 15;
    }
    ctx.y -= 4;
  } else if (c.tipo === "grade") {
    const colW = Math.min(46, (A4.w - M - M - 110) / c.colunas.length);
    garanteEspaco(ctx, 16);
    c.colunas.forEach((col, i) => {
      ctx.page.drawText(ansi(col).slice(0, 7), { x: M + 112 + i * colW, y: ctx.y - 8, size: 6.5, font: ctx.font, color: hex(CHART_THEME.ink400) });
    });
    ctx.y -= 12;
    for (const l of c.linhas) {
      garanteEspaco(ctx, 14);
      ctx.page.drawText(ansi(l.label).slice(0, 22), { x: M, y: ctx.y - 9, size: 8, font: ctx.font, color: hex(CHART_THEME.ink700) });
      l.celulas.forEach((cel, i) => {
        const cor = cel === "sim" ? CHART_THEME.positive : cel === "parcial" ? CHART_THEME.opinion : CHART_THEME.grid;
        ctx.page.drawRectangle({ x: M + 112 + i * colW, y: ctx.y - 11, width: 10, height: 10, color: hex(cor) });
      });
      ctx.y -= 14;
    }
    ctx.y -= 4;
  } else if (c.tipo === "dispersao") {
    const W = A4.w - M - M;
    const H = 150;
    garanteEspaco(ctx, H + 18);
    const x0 = M;
    const y0 = ctx.y - H;
    const px = (v: number) => x0 + (v / c.eixoX.maxVal) * W;
    const py = (v: number) => y0 + (v / c.eixoY.maxVal) * H;
    const midX = x0 + W / 2;
    const midY = y0 + H / 2;
    // quadrantes + eixos
    ctx.page.drawLine({ start: { x: midX, y: y0 }, end: { x: midX, y: y0 + H }, thickness: 0.4, color: hex(CHART_THEME.grid), dashArray: [2, 2] });
    ctx.page.drawLine({ start: { x: x0, y: midY }, end: { x: x0 + W, y: midY }, thickness: 0.4, color: hex(CHART_THEME.grid), dashArray: [2, 2] });
    ctx.page.drawLine({ start: { x: x0, y: y0 }, end: { x: x0 + W, y: y0 }, thickness: 0.6, color: hex(CHART_THEME.ink400) });
    ctx.page.drawLine({ start: { x: x0, y: y0 }, end: { x: x0, y: y0 + H }, thickness: 0.6, color: hex(CHART_THEME.ink400) });
    ctx.page.drawText(ansi(c.eixoX.min), { x: x0, y: y0 - 9, size: 6.5, font: ctx.font, color: hex(CHART_THEME.ink400) });
    ctx.page.drawText(ansi(c.eixoX.max), { x: x0 + W - 40, y: y0 - 9, size: 6.5, font: ctx.font, color: hex(CHART_THEME.ink400) });
    // dots na posição real
    for (const p of c.pontos) ctx.page.drawCircle({ x: px(p.x), y: py(p.y), size: 3, color: hex(CHART_THEME.brand) });
    // labels desempilhados por LADO (y do PDF cresce pra cima): garante gap vertical
    const LH = 9;
    for (const side of ["dir", "esq"] as const) {
      const grupo = c.pontos
        .map((p) => ({ label: p.label, x: px(p.x), y: py(p.y) }))
        .filter((p) => (side === "dir" ? p.x > x0 + W * 0.62 : p.x <= x0 + W * 0.62))
        .sort((a, b) => b.y - a.y); // de cima pra baixo
      let prevY = Infinity;
      for (const p of grupo) {
        let ly = Math.min(p.y, prevY - LH);
        if (ly < y0 + 2) ly = y0 + 2;
        prevY = ly;
        const lx = side === "dir" ? p.x + 5 : Math.max(x0, p.x - 5 - ctx.bold.widthOfTextAtSize(ansi(p.label).slice(0, 16), 6.5));
        if (Math.abs(ly - p.y) > 1) ctx.page.drawLine({ start: { x: p.x, y: p.y }, end: { x: lx, y: ly + 2 }, thickness: 0.4, color: hex(CHART_THEME.grid) });
        ctx.page.drawText(ansi(p.label).slice(0, 16), { x: lx, y: ly, size: 6.5, font: ctx.bold, color: hex(CHART_THEME.ink) });
      }
    }
    ctx.y = y0 - 14;
    texto(ctx, `X: ${c.eixoX.label} · Y: ${c.eixoY.label}${c.ausentes?.length ? ` · fora do mapa: ${c.ausentes.join(", ")}` : ""}`, { size: 7, cor: CHART_THEME.ink400, gap: 2 });
  } else {
    // linha
    const W = A4.w - M - M;
    const H = 90;
    garanteEspaco(ctx, H + 10);
    const x0 = M;
    const y0 = ctx.y - H;
    const maxY = Math.max(1, ...c.pontos.map((p) => p.y));
    const n = c.pontos.length;
    ctx.page.drawLine({ start: { x: x0, y: y0 }, end: { x: x0 + W, y: y0 }, thickness: 0.5, color: hex(CHART_THEME.grid) });
    const px = (i: number) => x0 + (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const py = (v: number) => y0 + (v / maxY) * (H - 10);
    for (let i = 0; i < n; i++) {
      const p = c.pontos[i];
      if (i > 0) {
        ctx.page.drawLine({ start: { x: px(i - 1), y: py(c.pontos[i - 1].y) }, end: { x: px(i), y: py(p.y) }, thickness: 1.5, color: hex(CHART_THEME.brand) });
      }
      ctx.page.drawCircle({ x: px(i), y: py(p.y), size: 2, color: hex(CHART_THEME.brand) });
      ctx.page.drawText(ansi(p.x).slice(5), { x: px(i) - 10, y: y0 - 10, size: 6, font: ctx.font, color: hex(CHART_THEME.ink400) });
    }
    ctx.y = y0 - 16;
  }

  rodapeChart(ctx, c);
}

export async function reportToPdf(report: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: PdfCtx = { doc, page: null as unknown as PDFPage, y: 0, font, bold };
  novaPagina(ctx);

  // cabeçalho
  ctx.page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: hex(CHART_THEME.brand) });
  texto(ctx, "RADAR - RELATORIO DE DIAGNOSTICO", { size: 8, bold: true, cor: CHART_THEME.brand, gap: 4 });
  texto(ctx, report.titulo, { size: 18, bold: true, gap: 2 });
  texto(ctx, `${report.clientName} - gerado em ${formatDateShort(report.createdAt) ?? report.createdAt.slice(0, 10)}`, {
    size: 9,
    cor: CHART_THEME.ink400,
    gap: 12,
  });

  // gráficos primeiro (o dado), narrativa depois
  for (const c of report.charts ?? []) desenhaChart(ctx, c);

  if (report.charts && report.charts.length) {
    garanteEspaco(ctx, 20);
    ctx.page.drawLine({ start: { x: M, y: ctx.y }, end: { x: A4.w - M, y: ctx.y }, thickness: 0.5, color: hex(CHART_THEME.grid) });
    ctx.y -= 12;
  }

  // narrativa
  for (const b of mdToBlocos(report.corpo)) {
    if (b.tipo === "h1") continue; // já é o título
    if (b.tipo === "h2") texto(ctx, b.texto, { size: 12, bold: true, gap: 3 });
    else if (b.tipo === "li") texto(ctx, `- ${b.texto}`, { size: 9.5, indent: 8, gap: 2 });
    else texto(ctx, b.texto, { size: 9.5, cor: CHART_THEME.ink700, gap: 5 });
  }

  // fontes
  if (report.fontes.length) {
    texto(ctx, "Fontes", { size: 11, bold: true, gap: 3 });
    for (const f of report.fontes) texto(ctx, `- ${f.titulo} (${f.url})`, { size: 8, cor: CHART_THEME.ink400, indent: 8, gap: 1 });
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// PPTX (pptxgenjs) — 1 seção por slide, charts nativos
// ─────────────────────────────────────────────────────────────────────────────

export async function reportToPptx(report: Report): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "RADAR", width: 10, height: 5.63 });
  pptx.layout = "RADAR";
  const PAPER = bare(CHART_THEME.paper);
  const INK = bare(CHART_THEME.ink);
  const INK4 = bare(CHART_THEME.ink400);

  // slide de capa
  const capa = pptx.addSlide();
  capa.background = { color: PAPER };
  capa.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.12, fill: { color: bare(CHART_THEME.brand) } });
  capa.addText("RADAR - RELATÓRIO DE DIAGNÓSTICO", { x: 0.5, y: 1.4, w: 9, h: 0.4, fontFace: "Arial", fontSize: 12, bold: true, color: bare(CHART_THEME.brand) });
  capa.addText(report.titulo, { x: 0.5, y: 1.9, w: 9, h: 1, fontFace: "Arial", fontSize: 30, bold: true, color: INK });
  capa.addText(`${report.clientName} · gerado em ${formatDateShort(report.createdAt) ?? report.createdAt.slice(0, 10)}`, {
    x: 0.5, y: 3.0, w: 9, h: 0.4, fontFace: "Arial", fontSize: 14, color: INK4,
  });

  // 1 slide por gráfico (chart nativo)
  for (const c of report.charts ?? []) {
    const s = pptx.addSlide();
    s.background = { color: PAPER };
    const nat = c.natureza === "opiniao" ? "OPINIÃO" : "FATO";
    s.addText(`${c.titulo}  ·  ${nat}`, { x: 0.5, y: 0.3, w: 9, h: 0.5, fontFace: "Arial", fontSize: 18, bold: true, color: INK });
    if (c.subtitulo) s.addText(c.subtitulo, { x: 0.5, y: 0.75, w: 9, h: 0.3, fontFace: "Arial", fontSize: 11, color: INK4 });
    addChartToSlide(pptx, s, c);
    s.addText(`fonte: ${c.fonte} · dado de ${formatDateShort(c.data) ?? c.data.slice(0, 10)}`, {
      x: 0.5, y: 5.15, w: 9, h: 0.3, fontFace: "Arial", fontSize: 9, color: INK4,
    });
  }

  // slide de narrativa
  const narr = pptx.addSlide();
  narr.background = { color: PAPER };
  narr.addText("Leitura & recomendações", { x: 0.5, y: 0.3, w: 9, h: 0.5, fontFace: "Arial", fontSize: 18, bold: true, color: INK });
  const blocos = mdToBlocos(report.corpo).filter((b) => b.tipo !== "h1");
  const runs = blocos.map((b) => ({
    text: b.texto,
    options: {
      fontFace: "Arial",
      bold: b.tipo === "h2",
      fontSize: b.tipo === "h2" ? 13 : 10,
      color: b.tipo === "p" ? bare(CHART_THEME.ink700) : INK,
      bullet: b.tipo === "li" ? true : false,
      breakLine: true,
      paraSpaceAfter: 4,
    },
  }));
  narr.addText(runs.length ? runs : [{ text: "—", options: { fontFace: "Arial", fontSize: 10 } }], { x: 0.5, y: 0.9, w: 9, h: 4.2, valign: "top" });

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}

function addChartToSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, c: ChartSpec): void {
  const area = { x: 0.5, y: 1.2, w: 9, h: 3.7 };
  if (c.tipo === "barras" || c.tipo === "rosca") {
    const series = c.tipo === "barras" ? c.series : c.fatias;
    const labels = series.map((s) => s.label);
    const values = series.map((s) => s.valor ?? 0);
    const cor = c.natureza === "opiniao" ? bare(CHART_THEME.opinion) : bare(CHART_THEME.brand);
    if (c.tipo === "rosca") {
      slide.addChart(pptx.ChartType.doughnut, [{ name: c.titulo, labels, values }], {
        ...area, showLegend: true, legendPos: "r", chartColors: CHART_THEME.categoric.map(bare), holeSize: 55,
      });
    } else {
      slide.addChart(pptx.ChartType.bar, [{ name: c.titulo, labels, values }], {
        ...area, barDir: "bar", showValue: true, chartColors: [cor], valAxisMaxVal: c.max, catAxisLabelColor: bare(CHART_THEME.ink700), showLegend: false,
      });
    }
  } else if (c.tipo === "linha") {
    slide.addChart(pptx.ChartType.line, [{ name: c.titulo, labels: c.pontos.map((p) => p.x.slice(5)), values: c.pontos.map((p) => p.y) }], {
      ...area, chartColors: [bare(CHART_THEME.brand)], showLegend: false, lineSize: 2, lineDataSymbol: "circle",
    });
  } else if (c.tipo === "dispersao") {
    // 2x2 como tabela (scatter do pptx rotula mal os pontos) — quadrante calculado
    const midX = c.eixoX.maxVal / 2;
    const quad = (p: { x: number; y: number }) =>
      `${p.x >= midX ? c.eixoX.max : c.eixoX.min} · ${p.y >= 50 ? c.eixoY.max : c.eixoY.min}`;
    const head = [
      { text: "Concorrente", options: { bold: true, fontSize: 10, color: bare(CHART_THEME.ink700) } },
      { text: c.eixoX.label, options: { bold: true, fontSize: 10, color: bare(CHART_THEME.ink700) } },
      { text: c.eixoY.label, options: { bold: true, fontSize: 10, color: bare(CHART_THEME.ink700) } },
      { text: "Quadrante", options: { bold: true, fontSize: 10, color: bare(CHART_THEME.ink700) } },
    ];
    const rows = c.pontos.map((p) => [
      { text: p.label, options: { bold: true, fontSize: 10, color: bare(CHART_THEME.ink) } },
      { text: p.notaX ?? String(p.x), options: { fontSize: 10, color: bare(CHART_THEME.ink700) } },
      { text: `${p.y}${p.notaY ? ` (${p.notaY})` : ""}`, options: { fontSize: 10, color: bare(CHART_THEME.ink700) } },
      { text: quad(p), options: { fontSize: 10, color: bare(CHART_THEME.brand) } },
    ]);
    slide.addTable([head, ...rows], { ...area, fontFace: "Arial", border: { type: "solid", pt: 0.5, color: bare(CHART_THEME.grid) } });
  } else {
    // grade -> tabela de presença
    const head = [{ text: "", options: { fill: { color: PAPER_HEX } } }, ...c.colunas.map((col) => ({ text: col, options: { bold: true, fontSize: 9, color: bare(CHART_THEME.ink700) } }))];
    const rows = c.linhas.map((l) => [
      { text: l.label, options: { bold: true, fontSize: 9, color: bare(CHART_THEME.ink700) } },
      ...l.celulas.map((cel) => ({ text: cel === "sim" ? "●" : "·", options: { align: "center" as const, fontSize: 12, color: cel === "sim" ? bare(CHART_THEME.positive) : bare(CHART_THEME.absent) } })),
    ]);
    slide.addTable([head, ...rows], { ...area, fontFace: "Arial", border: { type: "solid", pt: 0.5, color: bare(CHART_THEME.grid) } });
  }
}
