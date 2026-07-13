/**
 * PDF do dossiê (F2 redesign) — a VIRADA: HTML/CSS desenhado → Chrome headless
 * (não mais gerador de texto). `dossieToPdf` mantém a assinatura de sempre, então
 * as rotas de download e o e-mail da véspera herdam o documento bonito sem mudar.
 */

import { dossieFooterHtml, dossieToHtml } from "@/lib/prospects/pdf-template";
import { htmlToPdf } from "@/lib/prospects/render-pdf";
import type { ConcorrenteExibido, ContextoItem, Dossie, Prospect } from "@/lib/prospects/schema";

export async function dossieToPdf(dossie: Dossie, prospect: Prospect, concorrentes: ConcorrenteExibido[], contexto: ContextoItem[] = []): Promise<Uint8Array> {
  const html = dossieToHtml(dossie, prospect, concorrentes, contexto);
  return htmlToPdf(html, { footerHtml: dossieFooterHtml() });
}
