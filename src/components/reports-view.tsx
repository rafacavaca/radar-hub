"use client";

/**
 * RELATÓRIOS (view) — o painel client da tela /relatorios.
 *
 * De cima pra baixo: (1) o COMPOSITOR "montar sob medida" — um pedido em
 * linguagem natural vira um relatório (POST /api/reports action="compose",
 * LENTO: chama o LLM); (2) a LISTA dos relatórios guardados, cada um com corpo
 * colapsável (markdown leve, sem lib), fontes citáveis e as ações "Gerar no
 * Formare" e "Apagar".
 *
 * Renderiza SEMPRE a partir de `reports` (props do server component); cada
 * mutação chama a API e `router.refresh()`. Estado local só pra: o form do
 * compositor, "ver tudo" por card, e o loading/resultado das ações por card.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

type ReportKind = "chat" | "sob-medida" | "agendado";
type Fonte = { titulo: string; url: string; concorrente?: string };
type Report = {
  id: string;
  clientName: string;
  kind: ReportKind;
  titulo: string;
  corpo: string;
  fontes: Fonte[];
  origem?: string;
  createdAt: string;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

export function ReportsView({ reports, clients }: { reports: Report[]; clients: string[] }) {
  return (
    <div className="space-y-6">
      <Composer clients={clients} />
      <ReportsList reports={reports} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compositor "montar sob medida" — pedido em linguagem natural -> relatório
// ─────────────────────────────────────────────────────────────────────────────

function Composer({ clients }: { clients: string[] }) {
  const router = useRouter();
  const [client, setClient] = useState(clients[0] ?? "");
  const [request, setRequest] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compose() {
    const req = request.trim();
    if (!req || composing) return;
    setComposing(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compose", clientName: client, request: req }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: Report;
        error?: string;
      } | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível montar o relatório.");
        return;
      }
      setRequest("");
      router.refresh(); // o relatório novo aparece na lista abaixo
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setComposing(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void compose();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-red-500" />
        <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">
          Montar relatório sob medida
        </h2>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Descreva em linguagem natural o que você quer — o Radar reúne o material coletado + o Brain
        do cliente e redige. Honesto: só usa o que coletou.
      </p>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {clients.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Cliente</span>
            <select
              value={client}
              onChange={(event) => setClient(event.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none sm:w-auto"
            >
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <textarea
          data-testid="compose-request"
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Ex.: relatório comercial + produto comparando os 3 concorrentes desta semana"
          className={"min-h-[96px] resize-y text-[15px] " + INPUT_CLASS}
        />

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="compose-run"
            disabled={composing || !request.trim()}
            className="min-h-[40px] rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-50"
          >
            {composing ? "Montando o relatório…" : "Montar relatório"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista de relatórios
// ─────────────────────────────────────────────────────────────────────────────

function ReportsList({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
        <p className="text-base font-medium text-stone-700">Nenhum relatório ainda.</p>
        <p className="mt-1 text-sm text-stone-500">
          Capture uma resposta no Pergunte ao Radar ou monte um acima.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const [expanded, setExpanded] = useState(false);

  const bodyLines = report.corpo.split("\n").filter((l) => l.trim().length > 0).length;
  const isLong = report.corpo.length > 360 || bodyLines > 8;
  const collapsed = isLong && !expanded;

  const kindLabel =
    report.kind === "chat" ? "do chat" : report.kind === "agendado" ? "agendado" : "sob medida";
  const date = new Date(report.createdAt).toLocaleDateString("pt-BR");

  return (
    <article
      data-testid="report-card"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
        <h2 className="font-semibold text-stone-900">{report.titulo}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
          <span>{report.clientName}</span>
          <span aria-hidden>·</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">{kindLabel}</span>
          <span aria-hidden>·</span>
          <span>{date}</span>
        </p>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className={"relative " + (collapsed ? "max-h-44 overflow-hidden" : "")}>
          <div className="text-sm leading-relaxed text-stone-700">
            {renderLightMarkdown(report.corpo)}
          </div>
          {collapsed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
          ) : null}
        </div>
        {isLong ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
          >
            {expanded ? "ver menos" : "ver tudo"}
          </button>
        ) : null}
      </div>

      {report.fontes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-100 px-4 py-3 sm:px-5">
          <span className="text-xs font-medium text-stone-400">Fontes:</span>
          {report.fontes.map((fonte, i) => (
            <a
              key={`${fonte.url}-${i}`}
              href={fonte.url}
              target="_blank"
              rel="noreferrer"
              title={fonte.url}
              className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 underline-offset-2 hover:bg-stone-200 hover:underline"
            >
              {fonteLabel(fonte)}
            </a>
          ))}
        </div>
      ) : null}

      <ReportActions report={report} />
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ações do rodapé: Gerar no Formare (porta estreita) e Apagar
// ─────────────────────────────────────────────────────────────────────────────

function ReportActions({ report }: { report: Report }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "formare" | "delete">(null);
  const [sent, setSent] = useState<null | { url?: string }>(null);
  const [error, setError] = useState<string | null>(null);

  async function toFormare() {
    if (busy) return;
    setBusy("formare");
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "to-formare", reportId: report.id }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { mode?: string; ok?: boolean; cardUrl?: string; error?: string };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data?.ok) {
        // o erro da porta pode vir aninhado (data.error) ou no topo (error).
        setError(payload?.data?.error ?? payload?.error ?? "Não deu pra mandar ao Formare.");
        return;
      }
      setSent({ url: payload.data.mode === "live" ? payload.data.cardUrl : undefined });
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm("Apagar este relatório?")) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/reports?id=${encodeURIComponent(report.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Não deu pra apagar.");
        setBusy(null);
        return;
      }
      router.refresh(); // o card some da lista no refresh do server component
    } catch {
      setError("Falha de conexão. Tente de novo.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 py-3 sm:px-5">
      {sent ? (
        <p className="text-xs font-medium text-emerald-700">
          {sent.url ? (
            <>
              ✓ Criado no Formare —{" "}
              <a href={sent.url} target="_blank" rel="noreferrer" className="underline">
                abrir ↗
              </a>
            </>
          ) : (
            <>✓ Preparado — porta desligada</>
          )}
        </p>
      ) : (
        <button
          type="button"
          data-testid="report-to-formare"
          onClick={toFormare}
          disabled={busy !== null}
          className="rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "formare" ? "Enviando…" : "Gerar no Formare"}
        </button>
      )}

      <button
        type="button"
        data-testid="report-delete"
        onClick={remove}
        disabled={busy !== null}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        {busy === "delete" ? "Apagando…" : "Apagar"}
      </button>

      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown LEVE — só o que o corpo usa: "## " -> <h3>, "- " -> <li>,
// **negrito** inline, resto -> <p>; [n] fica literal. Sem lib externa.
// ─────────────────────────────────────────────────────────────────────────────

/** Aplica **negrito** dentro de uma linha; mantém [n] e o resto como texto. */
function renderInline(text: string): ReactNode {
  const parts = text.split("**");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-stone-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function renderLightMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="ml-0.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-[7px] h-1 w-1 flex-none rounded-full bg-stone-400" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s+/.test(line)) {
      flushBullets();
      blocks.push(
        <h3
          key={`h-${key++}`}
          className="mt-3 text-sm font-semibold text-stone-900 first:mt-0"
        >
          {renderInline(line.replace(/^#{1,6}\s+/, ""))}
        </h3>,
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushBullets();
    if (line === "") continue;
    blocks.push(<p key={`p-${key++}`}>{renderInline(line)}</p>);
  }
  flushBullets();

  if (blocks.length === 0) return <p>{text}</p>;
  return <div className="space-y-1.5">{blocks}</div>;
}

/** Rótulo do chip de fonte: "concorrente · titulo", truncado ~60 chars. */
function fonteLabel(fonte: Fonte): string {
  const base = fonte.concorrente ? `${fonte.concorrente} · ${fonte.titulo}` : fonte.titulo;
  return base.length > 60 ? `${base.slice(0, 59).trimEnd()}…` : base;
}
