/**
 * G — gráficos do relatório em SVG puro (server-safe; sem dependência de chart
 * lib). Render do ChartSpec no design-system: papel quente, Archivo, vermelho de
 * marca. Todo gráfico exibe FONTE + DATA + selo de natureza (fato/opinião).
 * O mesmo SVG aparece na tela, no link compartilhável e no print.
 */

import type { BarrasChart, ChartSpec, DispersaoChart, GradeChart, LinhaChart, RoscaChart } from "@/lib/diagnostico/report-charts";
import { CHART_THEME, corPorNatureza } from "@/lib/diagnostico/chart-theme";
import { formatDateShort } from "@/lib/format";

function Selo({ natureza }: { natureza: "fato" | "opiniao" }) {
  const op = natureza === "opiniao";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: op ? CHART_THEME.opinionSoft : CHART_THEME.factSoft,
        color: op ? CHART_THEME.opinion : CHART_THEME.fact,
      }}
    >
      {op ? "opinião" : "fato"}
    </span>
  );
}

function Moldura({ c, children }: { c: ChartSpec; children: React.ReactNode }) {
  return (
    <figure className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
      <figcaption className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-stone-900">{c.titulo}</h4>
          <Selo natureza={c.natureza} />
        </div>
        {c.subtitulo ? <p className="mt-0.5 text-xs text-stone-500">{c.subtitulo}</p> : null}
      </figcaption>
      {children}
      <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
        fonte: {c.fonte} · dado de {formatDateShort(c.data) ?? c.data.slice(0, 10)}
      </p>
    </figure>
  );
}

function Barras({ c }: { c: BarrasChart }) {
  const max = c.max ?? Math.max(1, ...c.series.map((s) => s.valor ?? 0));
  const cor = corPorNatureza(c.natureza);
  return (
    <Moldura c={c}>
      <div className="space-y-2">
        {c.series.map((s, i) => {
          const pct = s.valor === null ? 0 : Math.round((s.valor / max) * 100);
          return (
            <div key={i} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
              <span className="truncate text-xs text-stone-600" title={s.label}>{s.label}</span>
              <span className="h-5 rounded bg-stone-100" role="img" aria-label={`${s.label}: ${s.valor ?? "sem dado"}`}>
                <span className="block h-5 rounded" style={{ width: `${pct}%`, background: s.valor === null ? CHART_THEME.absent : cor }} />
              </span>
              <span className="w-20 text-right text-xs tabular-nums text-stone-700">
                {s.valor === null ? <span className="text-stone-400">sem dado</span> : `${s.valor}${c.unidade ?? ""}`}
                {s.nota ? <span className="block text-[10px] text-stone-400">{s.nota}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </Moldura>
  );
}

function Grade({ c }: { c: GradeChart }) {
  return (
    <Moldura c={c}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1.5" />
              {c.colunas.map((col) => (
                <th key={col} className="p-1.5 text-center font-medium text-stone-500">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.label}>
                <td className="p-1.5 font-medium text-stone-700">{l.label}</td>
                {l.celulas.map((cel, i) => (
                  <td key={i} className="p-1.5 text-center">
                    <span
                      className="inline-block h-4 w-4 rounded"
                      style={{ background: cel === "sim" ? CHART_THEME.positive : cel === "parcial" ? CHART_THEME.opinion : CHART_THEME.grid }}
                      title={cel === "sim" ? "presente" : cel === "parcial" ? "parcial" : "ausente"}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Moldura>
  );
}

function Rosca({ c }: { c: RoscaChart }) {
  const total = c.fatias.reduce((s, f) => s + (f.valor ?? 0), 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Moldura c={c}>
      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label={c.titulo}>
          <circle cx="70" cy="70" r={R} fill="none" stroke={CHART_THEME.grid} strokeWidth="16" />
          {c.fatias.map((f, i) => {
            const frac = (f.valor ?? 0) / total;
            const dash = frac * C;
            const el = (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={CHART_THEME.categoric[i % CHART_THEME.categoric.length]}
                strokeWidth="16"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <ul className="space-y-1 text-xs">
          {c.fatias.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CHART_THEME.categoric[i % CHART_THEME.categoric.length] }} />
              <span className="text-stone-700">{f.label}</span>
              <span className="tabular-nums text-stone-400">{f.valor}</span>
            </li>
          ))}
        </ul>
      </div>
    </Moldura>
  );
}

function Linha({ c }: { c: LinhaChart }) {
  const W = 460;
  const H = 140;
  const pad = { l: 28, r: 12, t: 12, b: 24 };
  const maxY = Math.max(1, ...c.pontos.map((p) => p.y));
  const n = c.pontos.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const linha = c.pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(" ");
  return (
    <Moldura c={c}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={c.titulo}>
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={CHART_THEME.grid} />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={CHART_THEME.grid} />
        {n === 1 ? (
          <circle cx={x(0)} cy={y(c.pontos[0].y)} r="3.5" fill={CHART_THEME.brand} />
        ) : (
          <path d={linha} fill="none" stroke={CHART_THEME.brand} strokeWidth="2" />
        )}
        {c.pontos.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.y)} r="2.5" fill={CHART_THEME.brand} />
            <text x={x(i)} y={H - pad.b + 14} textAnchor="middle" fontSize="8" fill={CHART_THEME.ink400}>{p.x.slice(5)}</text>
          </g>
        ))}
        <text x={pad.l - 6} y={y(maxY) + 3} textAnchor="end" fontSize="8" fill={CHART_THEME.ink400}>{maxY}</text>
      </svg>
    </Moldura>
  );
}

function Dispersao({ c }: { c: DispersaoChart }) {
  const W = 460;
  const H = 300;
  const pad = { l: 44, r: 16, t: 16, b: 40 };
  const px = (v: number) => pad.l + (v / c.eixoX.maxVal) * (W - pad.l - pad.r);
  const py = (v: number) => H - pad.b - (v / c.eixoY.maxVal) * (H - pad.t - pad.b);
  const midX = pad.l + (W - pad.l - pad.r) / 2;
  const midY = pad.t + (H - pad.t - pad.b) / 2;

  return (
    <Moldura c={c}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={c.titulo}>
        {/* quadrantes */}
        <line x1={midX} y1={pad.t} x2={midX} y2={H - pad.b} stroke={CHART_THEME.grid} strokeDasharray="3 3" />
        <line x1={pad.l} y1={midY} x2={W - pad.r} y2={midY} stroke={CHART_THEME.grid} strokeDasharray="3 3" />
        {/* eixos */}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={CHART_THEME.ink400} strokeWidth="1" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={CHART_THEME.ink400} strokeWidth="1" />
        {/* rótulos dos extremos */}
        <text x={pad.l} y={H - 6} fontSize="9" fill={CHART_THEME.ink400}>{c.eixoX.min}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="9" fill={CHART_THEME.ink400}>{c.eixoX.max}</text>
        <text x={pad.l + 3} y={H - pad.b - 4} fontSize="9" fill={CHART_THEME.ink400}>{c.eixoY.min}</text>
        <text x={pad.l + 3} y={pad.t + 10} fontSize="9" fill={CHART_THEME.ink400}>{c.eixoY.max}</text>
        {/* pontos */}
        {c.pontos.map((p, i) => {
          const x = px(p.x);
          const y = py(p.y);
          const anchor = x > W - 90 ? "end" : "start";
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5" fill={CHART_THEME.brand} fillOpacity="0.85" />
              <text x={anchor === "end" ? x - 8 : x + 8} y={y + 3} textAnchor={anchor} fontSize="10" fontWeight="600" fill={CHART_THEME.ink}>
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-stone-400">
        <span>X: {c.eixoX.label}</span>
        <span>Y: {c.eixoY.label}</span>
      </div>
      {c.ausentes && c.ausentes.length > 0 ? (
        <p className="mt-1 text-[11px] text-stone-400">Fora do mapa: {c.ausentes.join(", ")}</p>
      ) : null}
    </Moldura>
  );
}

export function ReportChart({ chart }: { chart: ChartSpec }) {
  switch (chart.tipo) {
    case "barras":
      return <Barras c={chart} />;
    case "grade":
      return <Grade c={chart} />;
    case "rosca":
      return <Rosca c={chart} />;
    case "linha":
      return <Linha c={chart} />;
    case "dispersao":
      return <Dispersao c={chart} />;
  }
}

export function ReportCharts({ charts }: { charts: ChartSpec[] }) {
  if (charts.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {charts.map((c, i) => (
        <div key={i} className={c.tipo === "dispersao" || c.tipo === "grade" ? "sm:col-span-2" : ""}>
          <ReportChart chart={c} />
        </div>
      ))}
    </div>
  );
}
