"use client";

/**
 * PrioridadeProvider / useNivelPrioridade — os cortes de prioridade (P7) no lado
 * CLIENTE. O servidor carrega os cortes da org (loadPrioridade) e semeia aqui;
 * o ScoreBadge (e quem mais precise) resolve a palavra pelo MESMO corte que o
 * servidor usa. Importa só o núcleo puro (sem fs).
 */

import { createContext, useContext } from "react";

import { CORTE_PADRAO, nivelPorCorte, type CortePrioridade, type NivelPrioridade } from "@/lib/prioridade-core";

const CorteCtx = createContext<CortePrioridade>(CORTE_PADRAO);

export function PrioridadeProvider({ corte, children }: { corte: CortePrioridade; children: React.ReactNode }) {
  return <CorteCtx.Provider value={corte}>{children}</CorteCtx.Provider>;
}

/** Os cortes da agência (contexto). Padrão do sistema se não houver provider. */
export function useCortePrioridade(): CortePrioridade {
  return useContext(CorteCtx);
}

/** Função `(score) => "Alta"|"Média"|"Baixa"` pelos cortes da org. */
export function useNivelPrioridade(): (score: number) => NivelPrioridade {
  const corte = useContext(CorteCtx);
  return (score) => nivelPorCorte(score, corte);
}
