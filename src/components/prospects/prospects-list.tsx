"use client";

/**
 * LISTA DE PROSPECTS (F1) — a tela por cliente: adicionar (nome + site, um
 * clique; opcional data/contato/contexto) e a lista dos prospects, cada um
 * levando ao dossiê. On-demand: adicionar é barato; gerar o dossiê (na tela do
 * prospect) é a ação cara que debita crédito.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDateTimePtBR } from "@/lib/format";
import type { Prospect } from "@/lib/prospects/schema";

function statusBadge(s: Prospect["status"]) {
  if (s === "promovido") return { txt: "promovido", cls: "bg-emerald-50 text-emerald-700" };
  if (s === "arquivado") return { txt: "arquivado", cls: "bg-stone-100 text-stone-500" };
  return { txt: "ativo", cls: "bg-blue-50 text-blue-700" };
}

function AddForm({ cliente }: { cliente: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [site, setSite] = useState("");
  const [reuniao, setReuniao] = useState("");
  const [contato, setContato] = useState("");
  const [contexto, setContexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit() {
    if (!nome.trim() || !site.trim()) {
      setErro("Nome e site são obrigatórios.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cliente,
          nome: nome.trim(),
          siteUrl: site.trim(),
          reuniaoEm: reuniao ? new Date(reuniao).toISOString() : "",
          contato: contato.trim(),
          contexto: contexto.trim(),
        }),
      });
      const body = (await res.json().catch(() => null)) as { data?: { prospect?: { id: string } }; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao adicionar");
      const id = body?.data?.prospect?.id;
      if (id) router.push(`/prospects/${id}?cliente=${encodeURIComponent(cliente)}`);
      else router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "falha ao adicionar");
      setBusy(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
      >
        + Novo prospect
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm font-semibold text-stone-900">Novo prospect</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da empresa *" className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="site.com.br *" className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
          Reunião (opcional)
          <input type="datetime-local" value={reuniao} onChange={(e) => setReuniao(e.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none focus:border-stone-500" />
        </label>
        <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Contato (opcional)" className="self-end rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
        <textarea value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Contexto do negócio (opcional)" rows={2} className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500 sm:col-span-2" />
      </div>
      {erro ? <p className="mt-2 text-xs text-red-600">{erro}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={submit} disabled={busy} className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Adicionando…" : "Adicionar e abrir"}
        </button>
        <button onClick={() => setAberto(false)} disabled={busy} className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ProspectsList({ cliente, prospects }: { cliente: string; prospects: Prospect[] }) {
  const ativos = prospects.filter((p) => p.status !== "arquivado");
  const arquivados = prospects.filter((p) => p.status === "arquivado");

  return (
    <div className="space-y-5">
      <AddForm cliente={cliente} />

      {ativos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
          <p className="text-base font-medium text-stone-700">Nenhum prospect ainda.</p>
          <p className="mt-1 text-sm text-stone-500">Adicione uma empresa que vai visitar — o Radar monta o dossiê pra você entrar preparado.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {ativos.map((p) => {
            const b = statusBadge(p.status);
            return (
              <li key={p.id}>
                <Link href={`/prospects/${p.id}?cliente=${encodeURIComponent(cliente)}`} className="block rounded-lg border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
                        {p.nome}
                        <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + b.cls}>{b.txt}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-stone-400">{p.siteUrl.replace(/^https?:\/\//, "")}</p>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-stone-400">
                      {p.reuniaoEm ? <p className="font-medium text-stone-600">reunião {formatDateTimePtBR(p.reuniaoEm)}</p> : null}
                      <p>{p.dossieEm ? "dossiê pronto" : "sem dossiê"}</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {arquivados.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-400">Arquivados ({arquivados.length})</summary>
          <ul className="mt-2 space-y-1">
            {arquivados.map((p) => (
              <li key={p.id}>
                <Link href={`/prospects/${p.id}?cliente=${encodeURIComponent(cliente)}`} className="text-stone-500 hover:text-stone-800">{p.nome}</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
