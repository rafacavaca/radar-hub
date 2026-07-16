"use client";

/**
 * VocabProvider / useRotulo — o resolvedor de rótulos no lado CLIENTE. O
 * servidor carrega o mapa da org (loadVocab) e semeia aqui; qualquer
 * componente-cliente resolve um termo com `useRotulo()("concorrentes")`,
 * pelo MESMO mapa que o servidor usa. Importa só o núcleo puro (sem fs).
 */

import { createContext, useContext } from "react";

import { rotulo, rotuloSingular, type VocabKey, type VocabMap } from "@/lib/vocab-terms";

const VocabCtx = createContext<VocabMap>({});

export function VocabProvider({ vocab, children }: { vocab: VocabMap; children: React.ReactNode }) {
  return <VocabCtx.Provider value={vocab}>{children}</VocabCtx.Provider>;
}

/** Devolve uma função `(termo) => rótulo` resolvida pelo vocabulário da org. */
export function useRotulo(): (key: VocabKey) => string {
  const vocab = useContext(VocabCtx);
  return (key) => rotulo(vocab, key);
}

/** Como useRotulo, mas no SINGULAR (coluna/campo de um item só). */
export function useRotuloSingular(): (key: VocabKey) => string {
  const vocab = useContext(VocabCtx);
  return (key) => rotuloSingular(vocab, key);
}
