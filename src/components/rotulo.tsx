"use client";

/**
 * <Rotulo termo="concorrentes" /> — resolve UM termo do vocabulário da agência
 * (P13) pelo contexto já semeado no layout. Componente client minúsculo pra usar
 * DENTRO de páginas server (eyebrows/títulos) sem carregar vocab nem passar props
 * — o mesmo mapa que a nav usa. O contexto SSR-a com o valor da org, sem flash.
 */

import { useRotulo, useRotuloSingular } from "@/components/vocab-context";
import type { VocabKey } from "@/lib/vocab-terms";

/**
 * `singular` para slots de um item só (coluna, campo): "Concorrente" vs "Concorrentes".
 * `lower` para o MEIO de frase ("4 concorrentes monitorados") — o rótulo é guardado
 * em Caixa-Título (bom pra chrome/eyebrow), então minusculiza aqui quando é corpo de texto.
 */
export function Rotulo({ termo, singular, lower }: { termo: VocabKey; singular?: boolean; lower?: boolean }) {
  const plural = useRotulo();
  const sing = useRotuloSingular();
  const v = singular ? sing(termo) : plural(termo);
  return <>{lower ? v.toLocaleLowerCase("pt-BR") : v}</>;
}
