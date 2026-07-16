"use client";

/**
 * <Rotulo termo="concorrentes" /> — resolve UM termo do vocabulário da agência
 * (P13) pelo contexto já semeado no layout. Componente client minúsculo pra usar
 * DENTRO de páginas server (eyebrows/títulos) sem carregar vocab nem passar props
 * — o mesmo mapa que a nav usa. O contexto SSR-a com o valor da org, sem flash.
 */

import { useRotulo } from "@/components/vocab-context";
import type { VocabKey } from "@/lib/vocab-terms";

export function Rotulo({ termo }: { termo: VocabKey }) {
  return <>{useRotulo()(termo)}</>;
}
