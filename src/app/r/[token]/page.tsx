/**
 * LINK COMPARTILHÁVEL do relatório (G) — página PÚBLICA de leitura, aberta no
 * proxy pela capability do token. Snapshot vivo com data: quem tem o link vê o
 * relatório (gráficos + narrativa + fontes) e pode baixar PDF/PPTX. Sem senha.
 *
 * Server component: lê o relatório pelo token direto do store (sem API).
 */

import { notFound } from "next/navigation";

import { getReportByShareToken } from "@/lib/reports";
import { formatDateTimePtBR } from "@/lib/format";

import { ReportCharts } from "@/components/charts/report-charts";
import { ReportMarkdown } from "@/components/report-markdown";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = getReportByShareToken(token);
  if (!report) notFound();

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-[880px] px-5 py-10 sm:px-8">
        {/* faixa de marca */}
        <div className="mb-6 flex items-center justify-between border-b border-stone-200 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">Radar · Relatório</p>
            <p className="mt-0.5 text-xs text-stone-400">
              {report.clientName} · gerado em {formatDateTimePtBR(report.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/reports/shared-export?token=${encodeURIComponent(token)}&format=pdf`}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              PDF
            </a>
            <a
              href={`/api/reports/shared-export?token=${encodeURIComponent(token)}&format=pptx`}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              PPTX
            </a>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{report.titulo}</h1>

        {report.charts && report.charts.length > 0 ? (
          <div className="mt-6">
            <ReportCharts charts={report.charts} />
          </div>
        ) : null}

        <div className="mt-6 text-[15px] leading-relaxed text-stone-700">
          <ReportMarkdown corpo={report.corpo} />
        </div>

        {report.fontes.length > 0 ? (
          <div className="mt-8 border-t border-stone-200 pt-4">
            <p className="text-xs font-medium text-stone-400">Fontes</p>
            <ul className="mt-2 space-y-1">
              {report.fontes.map((f, i) => (
                <li key={i} className="text-xs text-stone-500">
                  <a href={f.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {f.concorrente ? `${f.concorrente} · ` : ""}{f.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-10 text-center text-[11px] text-stone-400">
          Compartilhado via Radar · snapshot de {formatDateTimePtBR(report.createdAt)}
        </p>
      </div>
    </main>
  );
}
