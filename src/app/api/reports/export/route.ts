/**
 * GET /api/reports/export?id=<reportId>&format=pdf|pptx — download do relatório
 * (gated pelo proxy: só o dono logado). Gera o binário na hora (pdf-lib/pptxgenjs).
 */

import { type NextRequest } from "next/server";

import { loadReport } from "@/lib/reports";
import { reportToPdf, reportToPptx } from "@/lib/reports-export";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "relatorio";
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const format = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
  const report = id ? await loadReport(id) : null;
  if (!report) return new Response(JSON.stringify({ error: "relatório não encontrado" }), { status: 404, headers: { "Content-Type": "application/json" } });

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
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao exportar";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
