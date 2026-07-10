/**
 * PDF do dossiê (F2) — o one-pager que vai por e-mail antes da reunião. pdf-lib
 * (vetor, A4, papel do design-system), server-safe (sem browser — a VPS não
 * comporta Chromium). Honestidade preservada: cada ponto leva o selo de
 * natureza (fato/inferência/não-encontrado) e as fontes viram uma lista no fim.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { CHART_THEME } from "@/lib/diagnostico/chart-theme";
import { formatDateTimePtBR } from "@/lib/format";
import { NATUREZA_LABEL, type ConcorrenteExibido, type Dossie, type Natureza, type Ponto, type Prospect } from "@/lib/prospects/schema";

const A4 = { w: 595, h: 842 };
const M = 48;

function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
/** StandardFonts é WinAnsi (latin1); acentos PT passam, o resto vira ascii. */
function ansi(s: string): string {
  return s.replace(/[—–]/g, "-").replace(/[""]/g, '"').replace(/['']/g, "'").replace(/…/g, "...").replace(/→/g, "->").replace(/[^\x00-\xFF]/g, "");
}

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont };

function novaPagina(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([A4.w, A4.h]);
  ctx.page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: hex(CHART_THEME.paper) });
  ctx.y = A4.h - M;
}
function espaco(ctx: Ctx, h: number): void {
  if (ctx.y - h < M) novaPagina(ctx);
}
function wrap(font: PDFFont, s: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  let atual = "";
  for (const p of s.split(/\s+/)) {
    const t = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(t, size) > maxW && atual) {
      out.push(atual);
      atual = p;
    } else atual = t;
  }
  if (atual) out.push(atual);
  return out;
}
function texto(ctx: Ctx, s: string, o: { size: number; bold?: boolean; cor?: string; gap?: number; indent?: number }): void {
  const font = o.bold ? ctx.bold : ctx.font;
  const x = M + (o.indent ?? 0);
  const maxW = A4.w - M - x;
  for (const linha of wrap(font, ansi(s), o.size, maxW)) {
    espaco(ctx, o.size + 4);
    ctx.page.drawText(linha, { x, y: ctx.y - o.size, size: o.size, font, color: hex(o.cor ?? CHART_THEME.ink) });
    ctx.y -= o.size + 3;
  }
  ctx.y -= o.gap ?? 0;
}
function secao(ctx: Ctx, titulo: string): void {
  espaco(ctx, 26);
  ctx.y -= 6;
  ctx.page.drawRectangle({ x: M, y: ctx.y - 12, width: 3, height: 12, color: hex(CHART_THEME.brand) });
  texto(ctx, titulo.toUpperCase(), { size: 10, bold: true, cor: CHART_THEME.ink700, indent: 8, gap: 4 });
}
/** um ponto: texto + [natureza] + (fonte). */
function ponto(ctx: Ctx, p: Ponto, indent = 0): void {
  const selo = ` [${NATUREZA_LABEL[p.natureza as Natureza]}]`;
  texto(ctx, `- ${p.texto}${selo}`, { size: 9, indent, gap: 0 });
  if (p.fonte_url) texto(ctx, `  fonte: ${p.fonte_url}`, { size: 7, cor: CHART_THEME.ink400, indent, gap: 2 });
}

export async function dossieToPdf(dossie: Dossie, prospect: Prospect, concorrentes: ConcorrenteExibido[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: null as unknown as PDFPage, y: 0, font, bold };
  novaPagina(ctx);

  // cabeçalho
  texto(ctx, "DOSSIÊ DE PROSPECT - RADAR", { size: 8, bold: true, cor: CHART_THEME.brand, gap: 4 });
  texto(ctx, dossie.nome, { size: 20, bold: true, gap: 2 });
  texto(ctx, dossie.siteUrl.replace(/^https?:\/\//, ""), { size: 9, cor: CHART_THEME.ink400, gap: 2 });
  const meta = [prospect.reuniaoEm ? `Reunião: ${formatDateTimePtBR(prospect.reuniaoEm)}` : "", prospect.contato ? `Contato: ${prospect.contato}` : "", `Gerado ${formatDateTimePtBR(dossie.geradoEm)}`].filter(Boolean).join("  |  ");
  texto(ctx, meta, { size: 8, cor: CHART_THEME.ink400, gap: 8 });

  // perfil
  secao(ctx, "Perfil da empresa");
  ponto(ctx, dossie.perfil.resumo);
  if (dossie.perfil.tagline) ponto(ctx, dossie.perfil.tagline);
  if (dossie.perfil.porte) ponto(ctx, dossie.perfil.porte);
  if (dossie.perfil.produtos.length) {
    texto(ctx, "Soluções:", { size: 9, bold: true, gap: 1 });
    for (const p of dossie.perfil.produtos) ponto(ctx, p, 6);
  }

  // concorrentes (curados)
  secao(ctx, "Concorrentes dela");
  if (concorrentes.length === 0) texto(ctx, "- nenhum indicado/confirmado", { size: 9, cor: CHART_THEME.ink400, gap: 0 });
  for (const c of concorrentes) {
    const origem = c.origem === "manual" ? "você indicou" : c.estado === "confirmado" ? "confirmado" : "sugestão (validar)";
    texto(ctx, `- ${c.nome} [${origem}]`, { size: 9, bold: true, gap: 0 });
    texto(ctx, `  ${c.nota.texto}`, { size: 8, cor: CHART_THEME.ink700, indent: 6, gap: 2 });
  }

  // sinais
  secao(ctx, "Sinais recentes");
  if (dossie.sinais.length === 0) texto(ctx, "- sem movimentos públicos encontrados", { size: 9, cor: CHART_THEME.ink400, gap: 0 });
  for (const s of dossie.sinais) {
    texto(ctx, `- [${s.tipo}] ${s.titulo}${s.data ? ` (${s.data})` : ""}`, { size: 9, gap: 0 });
    texto(ctx, `  fonte: ${s.fonte_url}`, { size: 7, cor: CHART_THEME.ink400, indent: 6, gap: 2 });
  }

  // encaixe
  secao(ctx, "Como nós encaixamos");
  if (dossie.encaixe.angulo) {
    texto(ctx, "Ângulo de abertura:", { size: 9, bold: true, cor: CHART_THEME.brand, gap: 1 });
    texto(ctx, dossie.encaixe.angulo.texto, { size: 10, indent: 6, gap: 4 });
  }
  if (dossie.encaixe.ganchos.length) {
    texto(ctx, "Ganchos:", { size: 9, bold: true, gap: 1 });
    for (const g of dossie.encaixe.ganchos) texto(ctx, `- ${g.texto}`, { size: 9, indent: 6, gap: 1 });
  }
  if (dossie.encaixe.dores.length) {
    texto(ctx, "Dores prováveis:", { size: 9, bold: true, gap: 1 });
    for (const d of dossie.encaixe.dores) texto(ctx, `- ${d.texto}`, { size: 9, indent: 6, gap: 1 });
  }

  // munição
  secao(ctx, "Munição de reunião");
  if (dossie.municao.perguntas.length) {
    texto(ctx, "Perguntas:", { size: 9, bold: true, gap: 1 });
    dossie.municao.perguntas.forEach((p, i) => texto(ctx, `${i + 1}. ${p.texto}`, { size: 9, indent: 6, gap: 1 }));
  }
  if (dossie.municao.objecoes.length) {
    texto(ctx, "Objeções & resposta:", { size: 9, bold: true, gap: 1 });
    for (const o of dossie.municao.objecoes) {
      texto(ctx, `"${o.objecao}"`, { size: 9, cor: CHART_THEME.ink700, indent: 6, gap: 0 });
      texto(ctx, `-> ${o.resposta}`, { size: 9, indent: 10, gap: 2 });
    }
  }

  // rodapé de honestidade
  ctx.y -= 6;
  texto(ctx, "Honestidade: [fato] = fonte pública; [inferência] = derivado/cruzamento; [não encontrado] = o Radar não achou. Confira antes de usar na reunião.", {
    size: 7,
    cor: CHART_THEME.ink400,
    gap: 0,
  });

  return doc.save();
}
