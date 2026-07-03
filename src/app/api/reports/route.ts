/**
 * /api/reports — os RELATÓRIOS do Radar (F8).
 *
 * GET  ?cliente=Nome           -> { data: { reports } } (todos, ou de um cliente)
 * POST { action, ... }:
 *   - "save-from-chat" { clientName, question, answer, fontes? } -> guarda a
 *      resposta boa do chat como relatório (forma 1: aproveitar do chat).
 *   - "compose" { clientName, request } -> compõe sob medida (forma 2) e guarda.
 *   - "to-formare" { reportId }  -> manda o relatório pro Formare (card),
 *      pela porta estreita (403 = escrita off -> caixa de saída, ok honesto).
 * DELETE ?id=<reportId>         -> apaga.
 *
 * Validação defensiva do corpo (sem zod). Erros da lib viram 400 pt-BR.
 */

import { NextResponse, type NextRequest } from "next/server";

import { sendReportToFormare } from "@/lib/formare-door";
import {
  composeReport,
  deleteReport,
  getReport,
  listReports,
  saveReport,
  type Report,
} from "@/lib/reports";
import type { AskSource } from "@/lib/ask";

export const dynamic = "force-dynamic";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Sanitiza fontes vindas do cliente (o chat manda as que exibiu). */
function cleanFontes(raw: unknown): AskSource[] {
  if (!Array.isArray(raw)) return [];
  const out: AskSource[] = [];
  for (const f of raw) {
    const titulo = (f as Record<string, unknown>)?.titulo;
    const url = (f as Record<string, unknown>)?.url;
    const concorrente = (f as Record<string, unknown>)?.concorrente;
    if (typeof titulo === "string" && typeof url === "string") {
      out.push({
        titulo,
        url,
        concorrente: typeof concorrente === "string" ? concorrente : undefined,
      });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente")?.trim() || undefined;
  return NextResponse.json({ data: { reports: listReports(cliente) } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return badRequest("Corpo inválido.");

  const action = body.action;
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";

  try {
    if (action === "save-from-chat") {
      const answer = typeof body.answer === "string" ? body.answer : "";
      const question = typeof body.question === "string" ? body.question : "";
      if (!clientName) return badRequest("Diga a qual cliente guardar o relatório.");
      if (!answer.trim()) return badRequest("Não há resposta para guardar.");
      const report = saveReport({
        clientName,
        kind: "chat",
        corpo: answer,
        fontes: cleanFontes(body.fontes),
        origem: question || undefined,
      });
      return NextResponse.json({ data: report });
    }

    if (action === "compose") {
      const request = typeof body.request === "string" ? body.request.trim() : "";
      if (!clientName) return badRequest("Escolha o cliente do relatório.");
      if (request.length < 5) return badRequest("Descreva o que o relatório deve cobrir.");
      const draft = await composeReport(clientName, request);
      const report = saveReport({
        clientName,
        kind: "sob-medida",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        origem: request,
      });
      return NextResponse.json({ data: report });
    }

    if (action === "to-formare") {
      const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
      const report: Report | null = reportId ? getReport(reportId) : null;
      if (!report) return NextResponse.json({ error: "relatório não encontrado" }, { status: 404 });
      const result = await sendReportToFormare({
        clientName: report.clientName,
        titulo: report.titulo,
        corpo: report.corpo,
      });
      return NextResponse.json({ data: result }, { status: result.ok ? 200 : 502 });
    }

    return badRequest("Ação desconhecida. Use save-from-chat, compose ou to-formare.");
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return badRequest("id obrigatório");
  try {
    deleteReport(id);
    return NextResponse.json({ data: { deleted: id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao apagar";
    return badRequest(message);
  }
}
