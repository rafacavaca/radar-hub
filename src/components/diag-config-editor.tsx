"use client";

/**
 * D — editor da CONFIG do diagnóstico por concorrente: fontes extras, temas a
 * vigiar e campos customizados. Fica recolhido por padrão (um "Personalizar" no
 * cabeçalho de cada concorrente). Salvar persiste; a próxima varredura aplica.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { DiagConfig } from "@/lib/diagnostico/config";

/** Modelos prontos de campo custom (o clique adiciona; o usuário ajusta). */
const CAMPO_TEMPLATES: Array<{ chave: string; pergunta: string }> = [
  { chave: "Tom de voz", pergunta: "Qual é o tom de voz da comunicação (formal, técnico, próximo, ousado)? Dê 1-2 evidências." },
  { chave: "Precificação", pergunta: "Como comunicam preço/modelo comercial (público, sob consulta, freemium, por módulo)?" },
  { chave: "Público-alvo", pergunta: "Qual público-alvo/segmento eles dizem atender explicitamente?" },
  { chave: "Prova de resultado", pergunta: "Que números ou resultados concretos de clientes aparecem (ex.: -X% de custo)?" },
];

export function DiagConfigEditor({
  cliente,
  competitorId,
  concorrenteNome,
  config,
}: {
  cliente: string;
  competitorId: string;
  concorrenteNome: string;
  config: DiagConfig;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [fontes, setFontes] = useState(config.fontesExtras.join("\n"));
  const [temas, setTemas] = useState(config.temas.join(", "));
  const [campos, setCampos] = useState<Array<{ chave: string; pergunta: string }>>(config.camposCustom);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const totalConfig = config.fontesExtras.length + config.temas.length + config.camposCustom.length;

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/diagnostico/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: cliente,
          competitorId,
          fontesExtras: fontes.split("\n").map((s) => s.trim()).filter(Boolean),
          temas: temas.split(",").map((s) => s.trim()).filter(Boolean),
          camposCustom: campos.filter((c) => c.chave.trim() && c.pergunta.trim()),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setMsg("Salvo. A próxima varredura aplica.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
      >
        {aberto ? "Fechar" : "Personalizar"}
        {totalConfig > 0 ? <span className="ml-1 rounded-full bg-stone-100 px-1.5 text-[10px] text-stone-500">{totalConfig}</span> : null}
      </button>

      {aberto ? (
        <div className="mt-2 space-y-4 rounded-xl border border-stone-200 bg-stone-50/50 p-3.5">
          <p className="text-xs text-stone-500">
            Configure o que o diagnóstico de <span className="font-medium text-stone-700">{concorrenteNome}</span> deve
            observar. Aplica na próxima varredura.
          </p>

          {/* Campos customizados */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Campos personalizados</p>
            <p className="mt-0.5 text-xs text-stone-500">Perguntas que o Radar responde do site (fato com fonte, ou “não encontrado”).</p>
            <div className="mt-2 space-y-2">
              {campos.map((c, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2">
                  <input
                    value={c.chave}
                    onChange={(e) => setCampos((prev) => prev.map((x, j) => (j === i ? { ...x, chave: e.target.value } : x)))}
                    placeholder="Rótulo (ex.: Tom de voz)"
                    className="w-40 rounded-lg border border-stone-200 px-2 py-1 text-xs"
                  />
                  <input
                    value={c.pergunta}
                    onChange={(e) => setCampos((prev) => prev.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)))}
                    placeholder="Pergunta de extração"
                    className="min-w-[200px] flex-1 rounded-lg border border-stone-200 px-2 py-1 text-xs"
                  />
                  <button onClick={() => setCampos((prev) => prev.filter((_, j) => j !== i))} className="px-1.5 py-1 text-xs text-red-600 hover:underline">
                    remover
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CAMPO_TEMPLATES.filter((t) => !campos.some((c) => c.chave.toLowerCase() === t.chave.toLowerCase())).map((t) => (
                <button
                  key={t.chave}
                  onClick={() => setCampos((prev) => [...prev, t])}
                  className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
                >
                  + {t.chave}
                </button>
              ))}
            </div>
          </div>

          {/* Temas a vigiar */}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Temas a monitorar</span>
            <input
              value={temas}
              onChange={(e) => setTemas(e.target.value)}
              placeholder="separados por vírgula (ex.: rastreabilidade, exportação, ESG)"
              className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            />
          </label>

          {/* Fontes extras */}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Fontes extras (URLs)</span>
            <textarea
              value={fontes}
              onChange={(e) => setFontes(e.target.value)}
              placeholder="uma URL por linha — páginas extras a incluir no diagnóstico"
              className="mt-1 min-h-[52px] w-full resize-y rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar configuração"}
            </button>
            {msg ? <span className="text-xs text-stone-500">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
