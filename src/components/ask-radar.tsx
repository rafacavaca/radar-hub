"use client";

/**
 * PERGUNTE AO RADAR — o chat client da tela /perguntar.
 *
 * Conversa livre sobre o que o Radar realmente coletou (itens de inteligência +
 * Brain do cliente), SEMPRE com fontes e honesto quando não sabe. Cada pergunta
 * chama POST /api/ask com os últimos 6 turnos de contexto; a resposta vem em
 * markdown LEVE (negrito, listas com "- ", citações [n]) e é renderizada aqui
 * sem lib externa (função própria, pequena).
 *
 * Estado só de conversa: a lista de turnos, o rascunho do input, o "pensando"
 * e o erro (que some na tentativa seguinte). Sem persistência — recarregar zera.
 */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** Uma fonte citável devolvida pela resposta (espelha AskSource da API). */
type Fonte = { titulo: string; url: string; concorrente?: string };
type Turn = { role: "user" | "radar"; text: string; fontes?: Fonte[] };

const SUGGESTIONS = [
  "O que os concorrentes lançaram nos últimos dias?",
  "Qual o movimento mais importante pra Moovefy agora?",
  "Que ação você recomenda pra esta semana?",
] as const;

// Altura máxima do textarea (mantida em sincronia com a classe max-h-[120px]).
const MAX_TEXTAREA_PX = 120;

export function AskRadar({ clients }: { clients: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll pro fim a cada novo turno (ou quando entra em "pensando").
  useEffect(() => {
    if (turns.length === 0 && !pending) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  // Textarea cresce até 1-2 linhas e volta a encolher quando esvazia.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [draft]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;

    // history = estado ANTERIOR (sem o turno que estamos adicionando agora).
    const previous = turns;
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    setDraft("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: previous.map((t) => ({ role: t.role, text: t.text })).slice(-6),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { resposta: string; fontes: Fonte[]; materialItens: number };
        error?: string;
      } | null;

      if (!res.ok || !payload?.data) {
        setError(payload?.error ?? "Não foi possível responder agora.");
        return;
      }

      const { resposta, fontes } = payload.data;
      setTurns((prev) => [...prev, { role: "radar", text: resposta, fontes }]);
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(draft);
    }
  }

  const empty = turns.length === 0 && !pending;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Área de conversa (rola sozinha; começa com sugestões clicáveis). */}
      <div className="max-h-[60vh] min-h-[18rem] space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {empty ? (
          <Suggestions onPick={(s) => void ask(s)} />
        ) : (
          turns.map((turn, i) =>
            turn.role === "user" ? (
              <UserBubble key={i} text={turn.text} />
            ) : (
              <RadarBubble
                key={i}
                text={turn.text}
                fontes={turn.fontes ?? []}
                pergunta={turns[i - 1]?.role === "user" ? turns[i - 1].text : ""}
                clients={clients}
              />
            ),
          )
        )}
        {pending ? <ThinkingBubble /> : null}
        <div ref={endRef} />
      </div>

      {/* Input fixo no rodapé do card. Enter envia; Shift+Enter quebra linha. */}
      <form onSubmit={onSubmit} className="border-t border-stone-100 px-4 py-3 sm:px-5">
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            data-testid="ask-input"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte sobre concorrentes, movimentos, oportunidades…"
            className="max-h-[120px] min-h-[40px] w-full resize-none rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
          />
          <button
            type="submit"
            data-testid="ask-send"
            disabled={pending || !draft.trim()}
            className="min-h-[40px] flex-none rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "Perguntando…" : "Perguntar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Turnos e estados
// ─────────────────────────────────────────────────────────────────────────────

function Suggestions({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="py-6">
      <p className="text-sm text-stone-500">Comece por uma pergunta:</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-stone-200 bg-stone-50 px-3.5 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-900 px-4 py-2.5 text-sm text-stone-50">
        {text}
      </p>
    </div>
  );
}

function RadarBubble({
  text,
  fontes,
  pergunta,
  clients,
}: {
  text: string;
  fontes: Fonte[];
  pergunta: string;
  clients: string[];
}) {
  return (
    <div className="flex justify-start">
      <div
        data-testid="ask-answer"
        className="max-w-[92%] rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-800"
      >
        {renderLightMarkdown(text)}
        {fontes.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-stone-200/70 pt-2.5">
            <span className="text-xs font-medium text-stone-400">Fontes:</span>
            {fontes.map((fonte, i) => (
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

        <AproveitarActions text={text} pergunta={pergunta} fontes={fontes} clients={clients} />
      </div>
    </div>
  );
}

/**
 * "Aproveitar" (F8) — captura uma resposta boa do chat: guarda como relatório
 * no Radar OU manda pro Formare (vira card). O flywheel aplicado ao chat.
 */
function AproveitarActions({
  text,
  pergunta,
  fontes,
  clients,
}: {
  text: string;
  pergunta: string;
  fontes: Fonte[];
  clients: string[];
}) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(clients[0] ?? "");
  const [busy, setBusy] = useState<null | "radar" | "formare">(null);
  const [done, setDone] = useState<null | { kind: "radar" } | { kind: "formare"; url?: string }>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function guardarNoRadar() {
    if (busy) return;
    setBusy("radar");
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-from-chat",
          clientName: client,
          question: pergunta,
          answer: text,
          fontes,
        }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(p?.error ?? "Não deu pra guardar.");
        return;
      }
      setDone({ kind: "radar" });
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusy(null);
    }
  }

  async function gerarNoFormare() {
    if (busy) return;
    setBusy("formare");
    setError(null);
    try {
      // guarda primeiro (pra ter um id) e então manda ao Formare.
      const saved = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-from-chat",
          clientName: client,
          question: pergunta,
          answer: text,
          fontes,
        }),
      });
      const savedPayload = (await saved.json().catch(() => null)) as {
        data?: { id?: string };
        error?: string;
      } | null;
      if (!saved.ok || !savedPayload?.data?.id) {
        setError(savedPayload?.error ?? "Não deu pra preparar o relatório.");
        return;
      }
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "to-formare", reportId: savedPayload.data.id }),
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: { mode?: string; ok?: boolean; cardUrl?: string };
        error?: string;
      } | null;
      if (!res.ok || !payload?.data?.ok) {
        setError(payload?.error ?? "Não deu pra mandar ao Formare.");
        return;
      }
      setDone({
        kind: "formare",
        url: payload.data.mode === "live" ? payload.data.cardUrl : undefined,
      });
    } catch {
      setError("Falha de conexão.");
    } finally {
      setBusy(null);
    }
  }

  if (done?.kind === "radar") {
    return (
      <p className="mt-3 border-t border-stone-200/70 pt-2.5 text-xs font-medium text-emerald-700">
        ✓ Guardado em Relatórios ({client})
      </p>
    );
  }
  if (done?.kind === "formare") {
    return (
      <p className="mt-3 border-t border-stone-200/70 pt-2.5 text-xs font-medium text-emerald-700">
        {done.url ? (
          <>
            ✓ Criado no Formare —{" "}
            <a href={done.url} target="_blank" rel="noreferrer" className="underline">
              abrir ↗
            </a>
          </>
        ) : (
          <>✓ Preparado (porta desligada — guardado em Relatórios)</>
        )}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-stone-200/70 pt-2.5">
      {!open ? (
        <button
          type="button"
          data-testid="aproveitar"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
        >
          Aproveitar esta resposta →
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {clients.length > 1 ? (
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-700"
            >
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={guardarNoRadar}
            disabled={busy !== null}
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            {busy === "radar" ? "Guardando…" : "Guardar no Radar"}
          </button>
          <button
            type="button"
            onClick={gerarNoFormare}
            disabled={busy !== null}
            className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-50"
          >
            {busy === "formare" ? "Enviando…" : "Gerar no Formare"}
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      )}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[92%] items-center gap-2 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm text-stone-500">
        <span className="flex gap-1" aria-hidden>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-400 [animation-delay:300ms]" />
        </span>
        <span>consultando o material…</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown LEVE — só o que a resposta usa: **negrito**, listas "- " e [n] cru.
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

/** Quebra por linhas: "- " vira <li>; demais linhas viram <p>; vazias separam. */
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
