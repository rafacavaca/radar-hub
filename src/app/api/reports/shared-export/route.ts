/**
 * GET /api/reports/shared-export?token=<shareToken>&format=pdf|pptx — download
 * PÚBLICO do relatório compartilhado (aberto no proxy). A capability é o TOKEN:
 * quem tem o link do snapshot pode baixar o PDF/PPTX (sem senha do Radar).
 */

import { type NextRequest } from "next/server";

import { getReportByShareToken } from "@/lib/reports";
import { reportToPdf, reportToPptx } from "@/lib/reports-export";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "relatorio";
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  const format = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
  const report = token ? getReportByShareToken(token) : null;
  if (!report) return new Response(JSON.stringify({ error: "link inválido" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const nome = `${slug(report.clientName)}-${slug(report.titulo)}`;
  try {
    if (format === "pptx") {
      const buf = await reportToPptx(report);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="${nome}.pptx"`,
        },
      });
    }
    const bytes = await reportToPdf(report);
    return new Response(bytes as BodyInit, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}.pdf"` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao exportar";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
