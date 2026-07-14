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

import { fetchClientBrain } from "@/lib/brain";
import { sendReportToFormare } from "@/lib/formare-door";
import { runRadarLoop } from "@/lib/loop";
import {
  composeContaReport,
  composeDiagnosticoReport,
  composeMovimentosReport,
  composeReport,
  removeReport,
  ensureShareTokenAsync,
  revokeShareTokenAsync,
  loadReport,
  loadReports,
  persistReport,
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
  return NextResponse.json({ data: { reports: await loadReports(cliente) } });
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
      const report = await persistReport({
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
      const report = await persistReport({
        clientName,
        kind: "sob-medida",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        origem: request,
      });
      return NextResponse.json({ data: report });
    }

    if (action === "compose-diagnostico") {
      if (!clientName) return badRequest("Escolha o cliente do relatório.");
      const draft = await composeDiagnosticoReport(clientName);
      const report = await persistReport({
        clientName,
        kind: "diagnostico",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        charts: draft.charts,
        origem: "Relatório de diagnóstico competitivo",
      });
      return NextResponse.json({ data: report });
    }

    if (action === "compose-movimentos") {
      if (!clientName) return badRequest("Escolha o cliente do relatório.");
      const diasRaw = Number(body.dias);
      const dias = Number.isInteger(diasRaw) && diasRaw > 0 && diasRaw <= 365 ? diasRaw : 90;
      const draft = await composeMovimentosReport(clientName, dias);
      const report = await persistReport({
        clientName,
        kind: "movimentos",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        charts: draft.charts,
        origem: `O que mudou — últimos ${dias} dias`,
      });
      return NextResponse.json({ data: report });
    }

    if (action === "share") {
      const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
      if (!reportId) return badRequest("reportId obrigatório");
      const report = await ensureShareTokenAsync(reportId);
      return NextResponse.json({ data: { shareToken: report.shareToken, path: `/r/${report.shareToken}`, expiresAt: report.shareExpiresAt } });
    }

    if (action === "revoke-share") {
      const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
      if (!reportId) return badRequest("reportId obrigatório");
      await revokeShareTokenAsync(reportId); // limpa o token — o link para de funcionar na hora
      return NextResponse.json({ data: { revoked: true } });
    }

    if (action === "compose-conta") {
      const conta = typeof body.conta === "string" ? body.conta.trim() : "";
      if (!clientName) return badRequest("Escolha o cliente.");
      if (!conta) return badRequest("Diga qual conta-chave.");
      // as jogadas da conta vêm do resultado do dia (cache); a oferta, do Brain.
      const loop = await runRadarLoop();
      const plays = (loop.relationshipPlays ?? []).filter(
        (p) => p.clientName === clientName && p.conta === conta,
      );
      const brain = await fetchClientBrain(clientName);
      const draft = await composeContaReport(clientName, conta, plays, brain.context);
      const report = await persistReport({
        clientName,
        kind: "conta",
        titulo: draft.titulo,
        corpo: draft.corpo,
        fontes: draft.fontes,
        origem: `Conta: ${conta}`,
      });
      return NextResponse.json({ data: report });
    }

    if (action === "to-formare") {
      const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
      const report: Report | null = reportId ? await loadReport(reportId) : null;
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
    await removeReport(id);
    return NextResponse.json({ data: { deleted: id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao apagar";
    return badRequest(message);
  }
}
