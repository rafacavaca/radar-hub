/**
 * HOJE (ritual diário, F1) — a tela que abre o dia: o digest matinal da
 * AGÊNCIA (cruza os clientes da org), processável como inbox.
 *
 *  - "Voltaram" primeiro (os adiados de ontem — trabalho que tu mesmo empurrou);
 *  - depois os itens do dia por relevância, cada um com origem + fonte + data
 *    e as ações Atuado / Amanhã / Ignorar;
 *  - DIA TRANQUILO é um estado de primeira classe: zero itens = "nada exige
 *    tua atenção", dito com calma — nunca urgência fabricada;
 *  - observações (falhas de coleta, cortes) sempre visíveis — honestidade.
 *
 * Server component: gera/carrega o digest do dia (ensureDigest — cache-only,
 * não dispara coleta). Os botões marcam estado via /api/briefing.
 */

import Link from "next/link";

import { ensureDigest, type DigestItem } from "@/lib/digest";
import { formatDateTimePtBR } from "@/lib/format";

import { AtualizarDigest } from "@/components/atualizar-digest";
import { BriefingItemActions } from "@/components/briefing-item-actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<DigestItem["kind"], string> = {
  leitura: "Leitura",
  gatilho: "Gatilho de venda",
  jogada: "Jogada",
  alerta: "Alerta",
  relatorio: "Relatório",
};

/** Onde cada tipo de item mora no painel (o deep-link do inbox). */
function painelDe(item: DigestItem): string {
  const q = `?cliente=${encodeURIComponent(item.clientName)}`;
  switch (item.kind) {
    case "alerta":
      return `/diagnostico${q}`;
    case "relatorio":
      return `/relatorios${q}`;
    case "gatilho":
      return `/carteira${q}`;
    case "jogada":
      return `/contas${q}`;
    default:
      return `/${q}`;
  }
}

function tituloDoDia(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(now);
}

function ItemCard({ item, voltou }: { item: DigestItem; voltou?: boolean }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
        <span>{item.clientName}</span>
        <span aria-hidden>·</span>
        <span>{voltou ? "Adiado ontem" : KIND_LABEL[item.kind]}</span>
        <span aria-hidden>·</span>
        <span className="normal-case tracking-normal">{item.origem}</span>
      </div>
      <h3 className="mt-1.5 text-[15px] font-semibold text-stone-900">{item.titulo}</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.detalhe}</p>
      {item.acao ? (
        <p className="mt-1.5 text-sm text-stone-700">
          <span className="font-medium">Ação:</span> {item.acao}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
        <p className="text-[12px] text-stone-400">
          {item.fonte?.url ? (
            <a href={item.fonte.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-stone-700 hover:underline">
              {item.fonte.titulo || new URL(item.fonte.url).hostname}
            </a>
          ) : (
            "sem fonte externa"
          )}
          {item.data ? ` · ${formatDateTimePtBR(item.data)}` : ""}
          {" · "}
          <Link href={painelDe(item)} className="underline-offset-2 hover:text-stone-700 hover:underline">
            abrir no painel
          </Link>
        </p>
        <BriefingItemActions item={item} />
      </div>
    </article>
  );
}

export default async function HojePage() {
  const now = new Date();
  const digest = await ensureDigest(now);

  return (
    <section className="mx-auto max-w-[860px] px-5 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Hoje</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-stone-900 first-letter:uppercase">
            {tituloDoDia(now)}
          </h1>
          <p className="mt-1 text-[12px] text-stone-400">
            Digest gerado às {formatDateTimePtBR(digest.geradoEm)} · {digest.clientes.length} cliente(s) na base
          </p>
        </div>
        <AtualizarDigest />
      </header>

      {digest.tranquilo ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-8 py-16 text-center">
          <p aria-hidden className="text-2xl">☀</p>
          <p className="mt-2 text-lg font-medium text-stone-800">Dia tranquilo.</p>
          <p className="mt-1 text-sm text-stone-500">
            Nada exige tua atenção agora — nenhum movimento forte, alerta novo ou item adiado.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {digest.adiados.length > 0 ? (
            <div>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                Voltaram · adiados por ti
              </h2>
              <div className="space-y-3">
                {digest.adiados.map((item) => (
                  <ItemCard key={`v-${item.id}`} item={item} voltou />
                ))}
              </div>
            </div>
          ) : null}

          {digest.itens.length > 0 ? (
            <div>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                O que merece tua atenção
              </h2>
              <div className="space-y-3">
                {digest.itens.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {digest.observacoes.length > 0 ? (
        <div className="mt-8 rounded-xl border border-stone-200 bg-stone-100/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
            Transparência da base
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-stone-500">
            {digest.observacoes.map((o, i) => (
              <li key={i}>· {o}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
