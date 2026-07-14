"use client";

/**
 * G/F2 — gráficos do relatório em RECHARTS, temados ao design system (papel
 * quente, Archivo, vermelho de marca) com ANIMAÇÃO de entrada (ao entrar na
 * viewport; desligada em prefers-reduced-motion) e tooltip no hover.
 *
 * HONESTIDADE (inalterada): todo gráfico segue na Moldura com selo de natureza
 * (fato/opinião) + FONTE + DATA; concorrente sem dado aparece como "sem dado"
 * (nunca um valor inventado); o 2x2 mantém o desempilhamento de rótulos
 * (dodgeLabels) — beleza não apaga proveniência.
 *
 * O EXPORT (PDF/PPTX) é independente: consome o ChartSpec direto (reports-export).
 */

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BarrasChart, ChartSpec, DispersaoChart, GradeChart, LinhaChart, RoscaChart } from "@/lib/diagnostico/report-charts";
import { CHART_THEME, corPorNatureza } from "@/lib/diagnostico/chart-theme";
import { dodgeLabels } from "@/lib/diagnostico/label-dodge";
import { formatDateShort } from "@/lib/format";

import { ChartReveal, usePrefersReducedMotion } from "@/components/charts/reveal";

const FONT = "var(--font-archivo), ui-sans-serif, system-ui, sans-serif";
const AXIS_TICK = { fontSize: 11, fill: CHART_THEME.ink400, fontFamily: FONT } as const;
const ANIM_MS = 750;

// ── moldura de honestidade (selo + fonte + data) — igual à de sempre ────────

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
    <figure className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <figcaption className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-stone-900">{c.titulo}</h4>
          <Selo natureza={c.natureza} />
        </div>
        {c.subtitulo ? <p className="mt-0.5 text-xs text-stone-500">{c.subtitulo}</p> : null}
      </figcaption>
      {children}
      <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
        fonte: {c.fonte} · dado de {formatDateShort(c.data) || c.data.slice(0, 10)}
      </p>
    </figure>
  );
}

/** Tooltip custom — cartão papel/tinta, Archivo, hairline. */
function TipCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] leading-snug text-stone-700 shadow-md">
      {children}
    </div>
  );
}

// ── BARRAS (maturidade, reputação, movimentos) — horizontais, animadas ──────

type BarRow = { label: string; valor: number | null; valorPlot: number; rotulo: string; nota?: string };

function BarrasTooltip({ active, payload, unidade }: { active?: boolean; payload?: Array<{ payload: BarRow }>; unidade?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TipCard>
      <p className="font-semibold text-stone-900">{row.label}</p>
      <p>{row.valor === null ? "sem dado" : `${row.valor}${unidade ?? ""}`}{row.nota ? ` · ${row.nota}` : ""}</p>
    </TipCard>
  );
}

function Barras({ c }: { c: BarrasChart }) {
  const reduced = usePrefersReducedMotion();
  const max = c.max ?? Math.max(1, ...c.series.map((s) => s.valor ?? 0));
  const cor = corPorNatureza(c.natureza);
  // valorPlot: null vira 0 (trilho vazio, honesto) — o valor REAL fica em
  // `valor` (tooltip) e o rótulo pré-computado garante o "sem dado" na ponta
  // (LabelList pula entradas null; com dataKey de string, não pula).
  const rows: BarRow[] = c.series.map((s) => ({
    label: s.label,
    valor: s.valor,
    valorPlot: s.valor ?? 0,
    rotulo: s.valor === null ? "sem dado" : `${s.valor}${c.unidade ?? ""}`,
    nota: s.nota,
  }));
  const H = rows.length * 36 + 24;

  return (
    <Moldura c={c}>
      <ChartReveal height={H}>
        <ResponsiveContainer width="100%" height={H}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 4, left: 8 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke={CHART_THEME.grid} strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, max]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={118}
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: CHART_THEME.ink700 }}
            />
            <Tooltip content={<BarrasTooltip unidade={c.unidade} />} cursor={{ fill: CHART_THEME.paper }} />
            <Bar
              dataKey="valorPlot"
              radius={[3, 3, 3, 3]}
              isAnimationActive={!reduced}
              animationDuration={ANIM_MS}
              animationEasing="ease-out"
              background={{ fill: CHART_THEME.paper, radius: 3 }}
            >
              {rows.map((r, i) => (
                <Cell key={i} fill={cor} />
              ))}
              <LabelList
                dataKey="rotulo"
                position="right"
                style={{ fontSize: 11, fill: CHART_THEME.ink700, fontFamily: FONT, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartReveal>
      {c.escala ? (
        <div className="mt-1 flex justify-between pl-[126px] pr-14 text-[10px] text-stone-400">
          <span>← {c.escala.min}</span>
          <span>{c.escala.max} →</span>
        </div>
      ) : null}
      {/* honestidade: quem não tem o dado é DECLARADO (o trilho fica vazio; o
          LabelList pula barras de largura zero — a anotação garante o registro). */}
      {rows.some((r) => r.valor === null) ? (
        <p className="mt-1 text-[11px] text-stone-400">
          sem dado: {rows.filter((r) => r.valor === null).map((r) => r.label).join(", ")}
        </p>
      ) : null}
    </Moldura>
  );
}

// ── GRADE (presença por canal) — matriz polida, hover, entrada em cascata ───

function Grade({ c }: { c: GradeChart }) {
  const totais = c.colunas.map((_, i) => c.linhas.filter((l) => l.celulas[i] === "sim").length);
  return (
    <Moldura c={c}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-1.5" />
              {c.colunas.map((col) => (
                <th key={col} className="p-1.5 text-center font-medium text-stone-500">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l, li) => (
              <tr key={l.label} className="border-t border-stone-100">
                <td className="p-2 font-medium text-stone-700">{l.label}</td>
                {l.celulas.map((cel, i) => (
                  <td key={i} className="p-2 text-center">
                    <span
                      title={`${l.label} · ${c.colunas[i]}: ${cel === "sim" ? "presente" : cel === "parcial" ? "parcial" : "ausente"}`}
                      className={
                        "inline-block h-5 w-5 rounded-md transition-transform duration-150 hover:scale-125 motion-safe:animate-[grade-in_.45s_ease-out_both] " +
                        (cel === "sim"
                          ? "bg-emerald-600/90 ring-1 ring-emerald-700/20"
                          : cel === "parcial"
                            ? "bg-amber-400/80 ring-1 ring-amber-700/20"
                            : "bg-stone-100 ring-1 ring-inset ring-stone-200")
                      }
                      style={{ animationDelay: `${(li * c.colunas.length + i) * 22}ms` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-stone-200">
              <td className="p-2 text-[10px] font-semibold uppercase tracking-wide text-stone-400">no canal</td>
              {totais.map((t, i) => (
                <td key={i} className="p-2 text-center text-[11px] font-semibold tabular-nums text-stone-500">
                  {t}/{c.linhas.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <style>{`@keyframes grade-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }`}</style>
    </Moldura>
  );
}

// ── ROSCA (mix de canais) — donut animado + legenda com % ───────────────────

function RoscaTooltip({ active, payload, total }: { active?: boolean; payload?: Array<{ name: string; value: number }>; total: number }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <TipCard>
      <p className="font-semibold text-stone-900">{name}</p>
      <p>{value} · {Math.round((value / total) * 100)}%</p>
    </TipCard>
  );
}

function Rosca({ c }: { c: RoscaChart }) {
  const reduced = usePrefersReducedMotion();
  const total = c.fatias.reduce((s, f) => s + (f.valor ?? 0), 0) || 1;
  const data = c.fatias.map((f) => ({ name: f.label, value: f.valor ?? 0 }));
  const H = 190;

  return (
    <Moldura c={c}>
      <ChartReveal height={H}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative h-[190px] w-[190px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<RoscaTooltip total={total} />} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={86}
                  paddingAngle={2}
                  cornerRadius={3}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  isAnimationActive={!reduced}
                  animationDuration={ANIM_MS + 150}
                  animationEasing="ease-out"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={CHART_THEME.categoric[i % CHART_THEME.categoric.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums text-stone-900">{total}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">total</span>
            </div>
          </div>
          <ul className="min-w-[150px] flex-1 space-y-1.5 text-xs">
            {c.fatias.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CHART_THEME.categoric[i % CHART_THEME.categoric.length] }} />
                <span className="flex-1 truncate text-stone-700">{f.label}</span>
                <span className="tabular-nums font-semibold text-stone-700">{f.valor}</span>
                <span className="w-9 text-right tabular-nums text-stone-400">{Math.round(((f.valor ?? 0) / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </ChartReveal>
    </Moldura>
  );
}

// ── LINHA (evolução temporal) — área que se desenha ─────────────────────────

function LinhaTooltip({ active, payload, label, unidade }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; unidade?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <TipCard>
      <p className="font-semibold text-stone-900">{label}</p>
      <p>{payload[0].value} {unidade ?? ""}</p>
    </TipCard>
  );
}

function Linha({ c }: { c: LinhaChart }) {
  const reduced = usePrefersReducedMotion();
  const data = c.pontos.map((p) => ({ x: p.x.slice(5), full: p.x, y: p.y }));
  const H = 200;
  return (
    <Moldura c={c}>
      <ChartReveal height={H}>
        <ResponsiveContainer width="100%" height={H}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="radar-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_THEME.brand} stopOpacity={0.18} />
                <stop offset="100%" stopColor={CHART_THEME.brand} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART_THEME.grid} strokeDasharray="3 3" />
            <XAxis dataKey="x" tickLine={false} axisLine={{ stroke: CHART_THEME.grid }} tick={AXIS_TICK} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={34} />
            <Tooltip content={<LinhaTooltip unidade={c.unidade} />} cursor={{ stroke: CHART_THEME.grid }} />
            <Area
              type="monotone"
              dataKey="y"
              stroke={CHART_THEME.brand}
              strokeWidth={2}
              fill="url(#radar-area)"
              dot={{ r: 3, fill: CHART_THEME.brand, strokeWidth: 0 }}
              activeDot={{ r: 4.5, fill: CHART_THEME.brand, stroke: "#fff", strokeWidth: 1.5 }}
              isAnimationActive={!reduced}
              animationDuration={ANIM_MS + 250}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartReveal>
    </Moldura>
  );
}

// ── DISPERSÃO (mapa 2x2) — quadrantes + dots animados + rótulos desempilhados ─

function Dispersao({ c }: { c: DispersaoChart }) {
  const reduced = usePrefersReducedMotion();
  // CALLBACK REF, não useRef+useEffect: o wrapper só MONTA quando o ChartReveal
  // libera (viewport) — um effect de montagem do componente rodaria antes, com
  // ref nulo, e o observer nunca seria anexado (bug real: mapa sem players).
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width)); // mede já na montagem
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const H = 320;
  const m = { l: 46, r: 18, t: 14, b: 42 };
  const points = c.pontos.map((p) => ({ x: p.x, y: p.y, label: p.label, notaX: p.notaX, notaY: p.notaY }));

  // geometria explícita (mesmos domínios do chart) → dodge em pixels reais.
  const px = (v: number) => m.l + (v / c.eixoX.maxVal) * Math.max(0, w - m.l - m.r);
  const py = (v: number) => H - m.b - (v / c.eixoY.maxVal) * (H - m.t - m.b);
  const labels = w > 0 ? dodgeLabels(points.map((p) => ({ label: p.label, x: px(p.x), y: py(p.y) })), { width: w, lineHeight: 14, top: m.t + 8, bottom: H - m.b - 6 }) : [];

  return (
    <Moldura c={c}>
      <ChartReveal height={H}>
        <div ref={setEl} className="relative w-full" style={{ height: H }}>
          {w > 0 ? (
            <ScatterChart width={w} height={H} margin={{ top: m.t, right: m.r, bottom: m.b - 28, left: m.l - 34 }}>
              <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" domain={[0, c.eixoX.maxVal]} height={28} tickLine={false} axisLine={{ stroke: CHART_THEME.ink400 }} tick={AXIS_TICK} tickCount={5} />
              <YAxis type="number" dataKey="y" domain={[0, c.eixoY.maxVal]} tickLine={false} axisLine={{ stroke: CHART_THEME.ink400 }} tick={AXIS_TICK} width={34} tickCount={5} />
              <ReferenceLine x={c.eixoX.maxVal / 2} stroke={CHART_THEME.ink400} strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={c.eixoY.maxVal / 2} stroke={CHART_THEME.ink400} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof points)[number];
                  return (
                    <TipCard>
                      <p className="font-semibold text-stone-900">{p.label}</p>
                      <p>{c.eixoX.label}: {p.x}{p.notaX ? ` (${p.notaX})` : ""}</p>
                      <p>{c.eixoY.label}: {p.y}{p.notaY ? ` (${p.notaY})` : ""}</p>
                    </TipCard>
                  );
                }}
              />
              <Scatter
                data={points}
                fill={CHART_THEME.brand}
                isAnimationActive={!reduced}
                animationDuration={ANIM_MS}
                animationEasing="ease-out"
                shape={(props: unknown) => {
                  const { cx, cy } = props as { cx?: number; cy?: number };
                  if (cx === undefined || cy === undefined) return <g />;
                  return <circle cx={cx} cy={cy} r={6} fill={CHART_THEME.brand} fillOpacity={0.9} stroke="#fff" strokeWidth={1.5} />;
                }}
              />
            </ScatterChart>
          ) : null}

          {/* rótulos desempilhados (HTML sobreposto — nunca colidem) */}
          {labels.map((p, i) => (
            <span key={i} className="pointer-events-none absolute" style={{ left: 0, top: 0, transform: `translate(${p.side === "end" ? p.x - 10 : p.x + 10}px, ${p.labelY - 8}px)` }}>
              {p.deslocado ? (
                <svg className="absolute" style={{ left: p.side === "end" ? "auto" : -10, right: p.side === "end" ? -10 : "auto", top: 0 }} width="10" height="16">
                  <line x1={p.side === "end" ? 10 : 0} y1={p.y - p.labelY + 8} x2={p.side === "end" ? 0 : 10} y2={8} stroke={CHART_THEME.grid} />
                </svg>
              ) : null}
              <span className={"block text-[11px] font-semibold text-stone-800 " + (p.side === "end" ? "-translate-x-full" : "")}>{p.label}</span>
            </span>
          ))}

          {/* extremos dos eixos (a linguagem do 2x2) */}
          <span className="pointer-events-none absolute text-[10px] text-stone-400" style={{ left: m.l, bottom: 4 }}>← {c.eixoX.min}</span>
          <span className="pointer-events-none absolute text-[10px] text-stone-400" style={{ right: m.r, bottom: 4 }}>{c.eixoX.max} →</span>
          <span className="pointer-events-none absolute text-[10px] text-stone-400" style={{ left: 4, top: m.t, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>← {c.eixoY.min}</span>
          <span className="pointer-events-none absolute text-[10px] text-stone-400" style={{ left: 4, bottom: m.b, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{c.eixoY.max} →</span>
        </div>
      </ChartReveal>
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

// ── dispatcher (mesmo contrato de sempre) ───────────────────────────────────

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
    <div className="grid gap-4 md:grid-cols-2">
      {charts.map((c, i) => (
        <div key={i} className={c.tipo === "dispersao" || c.tipo === "grade" ? "sm:col-span-2" : ""}>
          <ReportChart chart={c} />
        </div>
      ))}
    </div>
  );
}
