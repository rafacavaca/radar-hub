"use client";

/**
 * CONTEXTO PRIVADO (F1) — captura o ouro que só o vendedor tem: arquivos
 * (proposta, portfólio, edital…) e notas de reunião. Confidencial: os selos
 * dizem "interno" e nada disto é público. Arrastar-e-soltar + nota livre + lista
 * com remover. O que sobe aqui é fundido no dossiê (regere pra incorporar).
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { formatDateShort } from "@/lib/format";
import type { ContextoItem } from "@/lib/prospects/schema";

function tamanho(bytes?: number): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ContextoPrivado({ cliente, id, itens }: { cliente: string; id: string; itens: ContextoItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function enviarArquivo(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("cliente", cliente);
      fd.set("id", id);
      fd.set("file", file);
      const res = await fetch("/api/prospects/contexto", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { data?: { aviso?: string }; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha no upload");
      setMsg(body?.data?.aviso ? { tipo: "ok", texto: `Adicionado — ${body.data.aviso}` } : { tipo: "ok", texto: "Adicionado ao contexto." });
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "falha no upload" });
    } finally {
      setBusy(false);
    }
  }

  async function enviarNota() {
    if (!nota.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/prospects/contexto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente, id, nota: nota.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "falha ao salvar a nota");
      setNota("");
      router.refresh();
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "falha" });
    } finally {
      setBusy(false);
    }
  }

  async function remover(item: string) {
    setBusy(true);
    try {
      await fetch(`/api/prospects/contexto?cliente=${encodeURIComponent(cliente)}&id=${id}&item=${item}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <h2 className="text-[15px] font-semibold text-stone-900">Contexto privado</h2>
        <span className="rounded-full bg-[#efe7f6] px-2 py-0.5 text-[10px] font-semibold text-[#6b4a9c]">confidencial · interno</span>
      </div>
      <p className="mt-0.5 text-sm text-stone-500">
        O que você sabe e não está publicado: a proposta que enviou, o portfólio do prospect, um edital,
        algo ouvido numa reunião. Fica isolado na sua agência e afia o dossiê.
      </p>

      {/* dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) enviarArquivo(f);
        }}
        className={"mt-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors " + (drag ? "border-[#7a5cc0] bg-[#faf8fc]" : "border-stone-300 bg-stone-50/50")}
      >
        <p className="text-sm text-stone-600">
          Arraste um arquivo aqui, ou{" "}
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50">
            escolha do computador
          </button>
        </p>
        <p className="mt-1 text-[11px] text-stone-400">PDF, DOCX, TXT ou imagem · até 8 MB · extraímos o texto no upload</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviarArquivo(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* nota */}
      <div className="mt-3">
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ou escreva uma nota — ex.: 'na reunião, o diretor disse que o orçamento aprovado é R$ 50k e a dor é integração com o ERP SAP'."
          rows={2}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button onClick={enviarNota} disabled={busy || !nota.trim()} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50">
            {busy ? "…" : "Adicionar nota"}
          </button>
          {msg ? <span className={"text-xs " + (msg.tipo === "ok" ? "text-emerald-700" : "text-red-600")}>{msg.texto}</span> : null}
        </div>
      </div>

      {/* lista */}
      {itens.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-stone-100 pt-3">
          {itens.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-800">
                  <span aria-hidden>{c.tipo === "nota" ? "📝" : "📎"}</span>
                  {c.temArquivo ? (
                    <a href={`/api/prospects/arquivo?cliente=${encodeURIComponent(cliente)}&id=${id}&item=${c.id}`} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
                      {c.nome}
                    </a>
                  ) : (
                    <span className="truncate">{c.nome}</span>
                  )}
                  <span className="rounded-full bg-[#efe7f6] px-1.5 py-0.5 text-[10px] font-semibold text-[#6b4a9c]">interno</span>
                  {!c.legivel ? <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">não foi possível ler</span> : null}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-stone-500">
                  {c.tipo === "nota" ? c.texto.slice(0, 160) : (c.resumo || c.texto || "").slice(0, 160) || "sem texto extraído"}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">{[tamanho(c.tamanho), formatDateShort(c.criadoEm)].filter(Boolean).join(" · ")}</p>
              </div>
              <button onClick={() => remover(c.id)} disabled={busy} title="Remover" className="shrink-0 rounded-md px-1.5 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-red-600 disabled:opacity-50">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
