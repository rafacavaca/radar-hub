"use client";

/**
 * IDENTIDADE (view) — o painel client do nó Visão.
 *
 * Um card por concorrente com site. O Rafael clica "Analisar identidade" e o
 * Radar tira o print da página pública, extrai a paleta, lê a mensagem de topo
 * e (da 2ª captura em diante) compara com a anterior pra dizer se a IDENTIDADE
 * mudou — cores/visual (rebranding) ou mensagem/posicionamento.
 *
 * A chamada é LENTA (~20-60s: print + visão por IA), então enquanto roda o
 * botão avisa e fica desabilitado. Ao terminar: guardamos o report retornado em
 * estado local (mostra na hora) E chamamos router.refresh() (o server re-lê os
 * relatórios). Sem análise ainda -> mostramos o último report do server, se
 * houver; senão, a linha "ainda não analisado".
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { VisualReport, VisualVerdict } from "@/lib/visual";

type CompetitorEntry = {
  competitorId: string;
  competitorName: string;
  clientName: string;
  siteUrl: string;
};

type VerdictStyle = { label: string; className: string };

/** Selo de veredito — a cor comunica o estado sem exigir leitura. */
const VERDICT: Record<VisualVerdict, VerdictStyle> = {
  linha_de_base: {
    label: "Linha de base",
    className: "border-stone-200 bg-stone-50 text-stone-600",
  },
  estavel: {
    label: "Identidade estável",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  mudou: {
    label: "Mudou — atenção",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  sem_print: {
    label: "Sem print",
    className: "border-stone-200 bg-stone-50 text-stone-500",
  },
};

export function IdentidadeView({
  competitors,
  initialReports,
}: {
  competitors: CompetitorEntry[];
  initialReports: Record<string, VisualReport>;
}) {
  return (
    <div className="space-y-5">
      {competitors.map((competitor) => (
        <IdentidadeCard
          key={`${competitor.clientName}::${competitor.competitorId}`}
          competitor={competitor}
          initialReport={initialReports[competitor.competitorId] ?? null}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de um concorrente: cabeçalho + botão + resultado
// ─────────────────────────────────────────────────────────────────────────────

function IdentidadeCard({
  competitor,
  initialReport,
}: {
  competitor: CompetitorEntry;
  initialReport: VisualReport | null;
}) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<VisualReport | null>(null);

  // o resultado mostrado: o recém-analisado tem prioridade sobre o do server.
  const report = fresh ?? initialReport;

  async function analyze() {
    if (analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorId: competitor.competitorId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: VisualReport;
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível analisar a identidade.");
        return;
      }
      setFresh(payload.data);
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div
      data-testid="identidade-card"
      className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
    >
      {/* Cabeçalho: concorrente, cliente, site */}
      <div className="min-w-0">
        <p className="font-semibold text-stone-900">{competitor.competitorName}</p>
        <p className="text-xs text-stone-400">{competitor.clientName}</p>
        <a
          href={competitor.siteUrl}
          target="_blank"
          rel="noreferrer"
          title={competitor.siteUrl}
          className="mt-0.5 block max-w-full truncate text-xs text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
        >
          {competitor.siteUrl}
        </a>
      </div>

      {/* Botão de análise (lento — avisa e desabilita enquanto roda) */}
      <div className="mt-3">
        <button
          type="button"
          data-testid="analisar"
          onClick={analyze}
          disabled={analyzing}
          className="inline-flex min-h-[40px] items-center justify-center whitespace-normal rounded-full bg-stone-900 px-4 py-2 text-sm text-stone-50 disabled:opacity-50"
        >
          {analyzing
            ? "Analisando a identidade… (pode levar até 1 min)"
            : "Analisar identidade"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {report ? (
        <IdentidadeResult report={report} />
      ) : !analyzing ? (
        <p className="mt-3 text-sm text-stone-500">
          Ainda não analisado — clique para a primeira captura (linha de base).
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado: veredito, mudança visual, paleta, mensagem, resumo da IA e print
// ─────────────────────────────────────────────────────────────────────────────

function IdentidadeResult({ report }: { report: VisualReport }) {
  const [imgOk, setImgOk] = useState(true);

  const verdict = VERDICT[report.verdict];
  const capturedAt = new Date(report.capturedAt).toLocaleString("pt-BR");

  return (
    <div className="mt-4 space-y-3 border-t border-stone-100 pt-4">
      {/* Selos: veredito + mudança visual + quando foi capturado */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "rounded-full border px-2 py-0.5 text-xs font-medium " + verdict.className
          }
        >
          {verdict.label}
        </span>
        {typeof report.mudancaVisualPct === "number" ? (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-500">
            assinatura visual mudou ~{report.mudancaVisualPct}%
          </span>
        ) : null}
        <span className="text-xs text-stone-400">{capturedAt}</span>
      </div>

      {/* Paleta de cores dominantes */}
      {report.paletteAtual.length > 0 ? (
        <div data-testid="palette" className="flex flex-wrap gap-2">
          {report.paletteAtual.map((swatch, index) => (
            <div key={`${swatch.hex}-${index}`} className="flex flex-col items-center gap-1">
              <span
                aria-hidden
                title={swatch.hex}
                style={{ backgroundColor: swatch.hex }}
                className="h-8 w-8 rounded-md border border-stone-200"
              />
              <span className="text-[10px] text-stone-400">{swatch.hex}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Mensagem de topo capturada */}
      {report.mensagemAtual ? (
        <p className="text-sm italic text-stone-600">“{report.mensagemAtual}”</p>
      ) : null}

      {/* Leitura da IA sobre a identidade / mudança */}
      {report.resumoIA ? (
        <p className="text-sm leading-relaxed text-stone-700">{report.resumoIA}</p>
      ) : null}

      {/* Print da página pública */}
      {report.screenshotUrl && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- print externo (Firecrawl), não otimizável por next/image
        <img
          src={report.screenshotUrl}
          alt="print"
          onError={() => setImgOk(false)}
          className="mt-2 max-h-64 w-full rounded-xl border border-stone-200 object-cover object-top"
        />
      ) : null}
    </div>
  );
}
