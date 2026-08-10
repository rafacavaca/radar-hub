"use client";

/**
 * BASE DE CONHECIMENTO — a Revisar/Curadoria (D14). Mostra o que sabemos de um
 * cliente agrupado nos 5 tipos, com fonte + data. A IA propõe (inferido); o
 * humano confirma como Verdade/Referência ou descarta. Só o confirmado alimenta
 * as análises — o rótulo "aguardando você" é honesto sobre a dúvida da IA.
 *
 * Curar é barato: cada ação vai pra /api/base e o server re-renderiza. Descobrir
 * do site reusa a Lente 1 (Firecrawl+LLM) — daí o estado "Lendo o site…".
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SourceRef } from "@/components/signal-meta";
import { formatDateShort } from "@/lib/format";
import {
  BRAIN_TIPOS,
  BRAIN_TIPO_LABEL,
  type BrainAutoridade,
  type BrainItem,
  type BrainStats,
} from "@/lib/brain-nativo/schema";

type Filtro = "aguardando" | "tudo";
type Resposta = { data?: { ok?: boolean; added?: number; encontrados?: number; erro?: string }; error?: string };

async function postBase(payload: Record<string, unknown>): Promise<Resposta> {
  const res = await fetch("/api/base", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (res.json().catch(() => ({ error: "resposta inválida" }))) as Promise<Resposta>;
}

export function BaseView({
  cliente,
  itens,
  stats,
  site,
}: {
  cliente: string;
  itens: BrainItem[];
  stats: BrainStats;
  site: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState(site);
  const [descobrindo, setDescobrindo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>(stats.aguardando > 0 ? "aguardando" : "tudo");

  async function acaoItem(a: "confirmar" | "descartar", id: string, autoridade?: BrainAutoridade) {
    setBusy(a + id);
    try {
      await postBase({ acao: a, cliente, id, autoridade });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function descobrir() {
    if (!siteUrl.trim()) {
      setAviso({ tipo: "erro", texto: "Informe o site do cliente." });
      return;
    }
    setDescobrindo(true);
    setAviso(null);
    try {
      const r = await postBase({ acao: "descobrir", cliente, siteUrl: siteUrl.trim() });
      if (r.error) {
        setAviso({ tipo: "erro", texto: r.error });
      } else if (r.data?.ok && (r.data.added ?? 0) > 0) {
        setAviso({ tipo: "ok", texto: `${r.data.added} item(ns) novo(s) do site — revise abaixo e confirme.` });
        setFiltro("aguardando");
      } else if (r.data?.ok && (r.data.encontrados ?? 0) > 0) {
        setAviso({ tipo: "ok", texto: "Nada novo — o site não trouxe fatos além do que já está aqui." });
      } else {
        setAviso({ tipo: "erro", texto: r.data?.erro || "O site não trouxe fatos claros (nada foi inventado)." });
      }
      router.refresh();
    } finally {
      setDescobrindo(false);
    }
  }

  const aguardando = itens.filter((i) => i.status === "inferido");
  const visiveis = filtro === "aguardando" ? aguardando : itens;
  const grupos = BRAIN_TIPOS.map((t) => ({ tipo: t, itens: visiveis.filter((i) => i.tipo === t) })).filter(
    (g) => g.itens.length > 0,
  );

  return (
    <div>
      {/* cabeçalho */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Base de conhecimento</p>
      <h1 className="mt-1 text-[22px] font-bold tracking-tight text-stone-900">{cliente}</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-stone-500">
        O que sabemos deste cliente, com fonte. A IA <b className="font-semibold text-stone-700">infere</b> do site; você{" "}
        <b className="font-semibold text-stone-700">confirma</b> o que é verdade. Só o confirmado alimenta as análises.
      </p>

      {/* contadores honestos */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-stone-500">
        <Contador n={stats.tipos} label="tipos" />
        <Sep />
        <Contador n={stats.fontes} label="fontes" />
        <Sep />
        <Contador n={stats.itens} label="itens" />
        <Sep />
        <span className={stats.aguardando > 0 ? "font-semibold text-amber-700" : "text-stone-500"}>
          {stats.aguardando} aguardando você
        </span>
      </div>

      {/* descobrir do site */}
      <div className="mt-5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-[13px] font-semibold text-stone-900">Descobrir do site</p>
        <p className="mt-0.5 text-[12px] text-stone-500">
          O Radar lê o site do cliente e propõe fatos (posicionamento, oferta, provas) — cada um com fonte, pra você revisar.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://site-do-cliente.com"
            className="min-w-0 flex-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-stone-500"
          />
          <button
            onClick={descobrir}
            disabled={descobrindo}
            className="rounded-md bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {descobrindo ? "Lendo o site…" : "Descobrir"}
          </button>
        </div>
        {aviso ? (
          <p className={"mt-2 text-[12px] " + (aviso.tipo === "ok" ? "text-emerald-700" : "text-amber-700")}>{aviso.texto}</p>
        ) : null}
      </div>

      {/* filtro */}
      {itens.length > 0 ? (
        <div className="mt-6 flex items-center gap-1.5">
          <FiltroBtn ativo={filtro === "aguardando"} onClick={() => setFiltro("aguardando")}>
            Aguardando ({aguardando.length})
          </FiltroBtn>
          <FiltroBtn ativo={filtro === "tudo"} onClick={() => setFiltro("tudo")}>
            Tudo ({itens.length})
          </FiltroBtn>
        </div>
      ) : null}

      {/* lista agrupada pelos 5 tipos */}
      {itens.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">Ainda não há conhecimento deste cliente.</p>
          <p className="mt-1 text-sm text-stone-500">Descubra do site acima pra começar — a IA propõe, você confirma.</p>
        </div>
      ) : grupos.length === 0 ? (
        <p className="mt-6 text-sm text-stone-400">Nada aguardando — tudo já foi revisado. Veja “Tudo”.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {grupos.map((g) => (
            <section key={g.tipo}>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-500">
                {BRAIN_TIPO_LABEL[g.tipo]} <span className="text-stone-400">({g.itens.length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {g.itens.map((it) => (
                  <ItemRow
                    key={it.id}
                    it={it}
                    busy={busy}
                    onConfirmar={(aut) => acaoItem("confirmar", it.id, aut)}
                    onDescartar={() => acaoItem("descartar", it.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  it,
  busy,
  onConfirmar,
  onDescartar,
}: {
  it: BrainItem;
  busy: string | null;
  onConfirmar: (a: BrainAutoridade) => void;
  onDescartar: () => void;
}) {
  const confirmado = it.status === "confirmado";
  return (
    <li className="rounded-lg border border-stone-200 bg-white px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug text-stone-800">{it.texto}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
            {confirmado ? (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 font-semibold " +
                  (it.autoridade === "verdade" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")
                }
              >
                confirmado · {it.autoridade === "verdade" ? "Verdade" : "Referência"}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">aguardando você</span>
            )}
            {it.fonte_url ? <SourceRef url={it.fonte_url} titulo={it.fonte_titulo} /> : <span>sem fonte</span>}
            {it.data ? <span>{formatDateShort(it.data)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {confirmado ? (
            <button
              onClick={onDescartar}
              disabled={busy !== null}
              title="Remover da base"
              className="rounded-md px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
            >
              ×
            </button>
          ) : (
            <>
              <button
                onClick={() => onConfirmar("verdade")}
                disabled={busy !== null}
                title="Confirmar como verdade institucional"
                className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[12px] font-medium text-emerald-700 hover:border-emerald-500 disabled:opacity-50"
              >
                ✓ Verdade
              </button>
              <button
                onClick={() => onConfirmar("referencia")}
                disabled={busy !== null}
                title="Confirmar como referência (apoio)"
                className="rounded-md border border-stone-300 bg-white px-2 py-1 text-[12px] font-medium text-blue-700 hover:border-blue-500 disabled:opacity-50"
              >
                ✓ Referência
              </button>
              <button
                onClick={onDescartar}
                disabled={busy !== null}
                title="Descartar (lixo/duplicado)"
                className="rounded-md px-1.5 py-1 text-[12px] font-medium text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Contador({ n, label }: { n: number; label: string }) {
  return (
    <span>
      <b className="font-semibold text-stone-800">{n}</b> {label}
    </span>
  );
}

function Sep() {
  return <span className="text-stone-300">·</span>;
}

function FiltroBtn({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-[12px] font-medium " +
        (ativo ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100")
      }
    >
      {children}
    </button>
  );
}
