"use client";

/**
 * BOAS-VINDAS (orientação, 1º acesso) — a porta de entrada. Um banner enxuto no
 * topo, dispensável (localStorage), que encarna a narrativa da landing dentro do
 * app: "acorde sabendo o que mudou e o que fazer". Não infantiliza — é uma linha
 * + dois caminhos (Comece pelo Hoje / Ver como funciona). "Ver como funciona"
 * abre um resumo de 3 passos em ~60s. Some para sempre depois de dispensado.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "radar:welcomed";

const PASSOS: Array<{ n: string; titulo: string; texto: string }> = [
  {
    n: "1",
    titulo: "Comece pelo Hoje",
    texto: "Todo dia, o Radar cruza seus clientes e destila o que mudou desde ontem e o que precisa de você — com fonte e data.",
  },
  {
    n: "2",
    titulo: "Abra um sinal",
    texto: "Cada item diz por que importa (a leitura por área) e a ação sugerida. Você decide: atuar, adiar ou ignorar.",
  },
  {
    n: "3",
    titulo: "Aja",
    texto: "Gere o conteúdo no Formare, prepare um dossiê pra reunião ou monte um relatório — sem sair do fluxo.",
  },
];

export function WelcomePanel() {
  const [show, setShow] = useState(false);
  const [comoFunciona, setComoFunciona] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1");
    } catch {
      /* localStorage indisponível — simplesmente não mostra */
    }
  }, []);

  function dispensar() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignora */
    }
    setShow(false);
    setComoFunciona(false);
  }

  if (!show) return null;

  return (
    <div className="border-b border-stone-200 bg-gradient-to-b from-white to-stone-50 px-5 py-3.5 md:px-6">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-stone-900">Bem-vindo ao Radar</p>
          <p className="mt-0.5 text-[13px] leading-snug text-stone-600">
            O Radar monitora seus concorrentes, clientes e mercado — e te diz o que fazer. Comece pelo Hoje.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/hoje"
            onClick={dispensar}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-700"
          >
            Comece pelo Hoje
          </Link>
          <button
            type="button"
            onClick={() => setComoFunciona(true)}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-100"
          >
            Ver como funciona
          </button>
          <button
            type="button"
            onClick={dispensar}
            aria-label="Dispensar"
            className="rounded-md px-2 py-1.5 text-[13px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            Dispensar
          </button>
        </div>
      </div>

      {comoFunciona ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          onClick={() => setComoFunciona(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-700">Como funciona</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-900">
              Do que mudou à ação, em três passos
            </h2>
            <ol className="mt-4 space-y-3.5">
              {PASSOS.map((p) => (
                <li key={p.n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[12px] font-semibold text-white">
                    {p.n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-stone-900">{p.titulo}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComoFunciona(false)}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
              >
                Fechar
              </button>
              <Link
                href="/hoje"
                onClick={dispensar}
                className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
              >
                Ir pro Hoje
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
