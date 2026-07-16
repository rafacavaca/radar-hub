"use client";

/**
 * <Rotulo termo="concorrentes" /> — resolve UM termo do vocabulário da agência
 * (P13) pelo contexto já semeado no layout. Componente client minúsculo pra usar
 * DENTRO de páginas server (eyebrows/títulos) sem carregar vocab nem passar props
 * — o mesmo mapa que a nav usa. O contexto SSR-a com o valor da org, sem flash.
 */

import { useRotulo, useRotuloSingular } from "@/components/vocab-context";
import type { VocabKey } from "@/lib/vocab-terms";

/** `singular` para slots de um item só (coluna, campo): "Concorrente" vs "Concorrentes". */
export function Rotulo({ termo, singular }: { termo: VocabKey; singular?: boolean }) {
  const plural = useRotulo();
  const sing = useRotuloSingular();
  return <>{singular ? sing(termo) : plural(termo)}</>;
}
