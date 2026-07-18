/**
 * NOVIDADES — o changelog do Radar, mostrado na Central de Treinamento
 * (/treinamento → "Novidades"). É o que faz o treinamento ser VIVO: cada
 * feature que entra ganha uma linha aqui, e todo mundo vê na hora.
 *
 * COMO ADICIONAR UMA ENTRADA (um commit):
 *   1. Copie o bloco de baixo e cole NO TOPO da lista (mais recente primeiro).
 *   2. `data` em ISO (AAAA-MM-DD); o formato bonito ("14 de julho de 2026") é
 *      calculado na tela.
 *   3. `titulo` curto; `descricao` numa frase, na língua da agência (o que MUDA
 *      pra quem usa — não o detalhe técnico).
 *
 *     { data: "2026-07-20", titulo: "…", descricao: "…" },
 *
 * Honestidade: só entra aqui o que REALMENTE está no ar. Nada de "em breve".
 */

export type Novidade = {
  /** ISO AAAA-MM-DD. A tela formata pra pt-BR. */
  data: string;
  titulo: string;
  descricao: string;
};

/** Mais recente no topo. */
export const NOVIDADES: Novidade[] = [
  {
    data: "2026-07-14",
    titulo: "A sua língua",
    descricao:
      "O Radar passou a usar os termos da sua agência, definidos na sua implantação — se você chama de “rivais” em vez de “concorrentes”, é assim que ele fala com você.",
  },
  {
    data: "2026-07-13",
    titulo: "Automações no seu controle",
    descricao:
      "A varredura de concorrentes e o resumo diário agora ligam e desligam num painel só. Nada roda sozinho sem você mandar — o Radar é silencioso por padrão.",
  },
  {
    data: "2026-07-13",
    titulo: "Contexto privado nos dossiês",
    descricao:
      "Suba uma proposta, uma ata ou uma nota sua e o Radar funde no dossiê da empresa — marcado como “interno”, pra você saber que aquilo é seu, não algo que o cliente publicou.",
  },
  {
    data: "2026-07-10",
    titulo: "Dossiê de reunião",
    descricao:
      "Adicione uma empresa que você vai visitar e o Radar monta o briefing completo — perfil, concorrentes, sinais e a munição pra conversa —, com um PDF pronto pra levar.",
  },
];
