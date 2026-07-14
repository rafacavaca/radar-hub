/**
 * AVISO "análise não completou" — mostrado quando o resultado do dia veio MORTO
 * (coletou, mas a leitura falhou: gateway/coleta caíram na rodada). Em vez de um
 * vazio que parece "dia calmo", diz a verdade e oferece a saída (Rodar de novo).
 *
 * Honestidade: separa "coletou os sinais" de "a leitura não rodou", sem despejar
 * stack técnica. Tom de indisponibilidade temporária (âmbar), não erro do usuário.
 */

import { RodarAgora } from "@/components/rodar-agora";

export function AnaliseFalhouAviso({
  failures = [],
  cliente,
}: {
  failures?: string[];
  cliente?: string;
}) {
  const coleta = failures.filter((f) => /coleta|firecrawl|cr[eé]dit/i.test(f)).length;
  const analise = failures.length - coleta;
  const partes: string[] = [];
  if (analise > 0) partes.push(`${analise} ${analise === 1 ? "leitura ficou indisponível" : "leituras ficaram indisponíveis"}`);
  if (coleta > 0) partes.push(`${coleta} ${coleta === 1 ? "fonte não respondeu" : "fontes não responderam"}`);
  const detalhe = partes.join(" · ");

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
      <p className="text-base font-semibold text-amber-900">A análise de hoje não completou.</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-amber-800">
        O Radar coletou os sinais, mas a leitura não rodou — provavelmente uma indisponibilidade
        temporária{detalhe ? ` (${detalhe})` : ""}. Rode de novo para gerar a análise do dia.
      </p>
      <div className="mt-5 flex justify-center">
        <RodarAgora cliente={cliente} variant="ghost" />
      </div>
    </div>
  );
}
