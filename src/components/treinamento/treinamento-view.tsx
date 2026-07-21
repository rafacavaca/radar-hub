"use client";

/**
 * CENTRAL DE TREINAMENTO (/treinamento) — material da agência-cliente pra
 * entender o Radar: o modelo mental, o dia a dia, como confiar no que ele diz e
 * o que foi configurado na implantação. Autônoma (chrome-less no AppShell): tem
 * a PRÓPRIA barra de conteúdo, no design system do Radar, com um "← Radar" de
 * volta.
 *
 * CAMADAS estável × volátil (a regra que rege esta tela):
 *  - ESTÁVEL (modelo mental, dia, confiança, implantação): conteúdo aprovado,
 *    escrito por inteiro.
 *  - VOLÁTIL (o passo a passo tela-a-tela com prints): STUB. O app ainda muda;
 *    entra quando a tela assentar. Não invente passo a passo que vai quebrar.
 *
 * BUSCA de verdade (não decorativa): todas as seções ficam montadas (só a ativa
 * aparece), e a busca lê o `textContent` de cada uma — full-text real, sem
 * índice duplicado que mente.
 *
 * VOCABULÁRIO: o texto usa os termos PADRÃO (Concorrentes, Áreas, Prioridade…).
 * Uma agência pode ter renomeado — por isso a <VocabNota> avisa, honesta, que o
 * "seu Radar pode usar outro nome, definido na implantação". Não resolvemos
 * vocabulário-por-agência aqui (é material genérico); só não mentimos.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Novidade } from "@/lib/treinamento/novidades";

// ── inline markup (mantém o conteúdo como strings legíveis + busca trivial) ──
// **negrito**, *itálico* e os selos [fato] / [inferência] / [interno].
const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[(?:fato|inferência|interno)\])/g;
function rich(s: string): React.ReactNode {
  const partes = s.split(TOKEN);
  return partes.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <B key={i}>{p.slice(2, -2)}</B>;
    if (p.startsWith("*") && p.endsWith("*")) return <i key={i}>{p.slice(1, -1)}</i>;
    if (p === "[fato]") return <Chip key={i} t="fato" />;
    if (p === "[inferência]") return <Chip key={i} t="inferência" />;
    if (p === "[interno]") return <Chip key={i} t="interno" />;
    return <span key={i}>{p}</span>;
  });
}

function B({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-stone-900">{children}</b>;
}

function Chip({ t }: { t: "fato" | "inferência" | "interno" }) {
  const cor =
    t === "fato"
      ? "bg-emerald-50 text-emerald-700"
      : t === "inferência"
        ? "bg-amber-50 text-amber-800"
        : "bg-blue-50 text-blue-700";
  return <span className={"mr-1.5 inline-block rounded px-2 py-0.5 text-[11px] font-semibold " + cor}>{t}</span>;
}

// ── blocos de conteúdo ──────────────────────────────────────────────────────
type Bloco =
  | { t: "h2"; s: string }
  | { t: "h3"; s: string }
  | { t: "p"; s: string }
  | { t: "why"; k: string; s: string }
  | { t: "cards"; items: { n: string; t: string; d: string }[] }
  | { t: "flow"; steps: { who: string; verb: string; ex: string }[] }
  | { t: "ul"; items: string[] }
  | { t: "vocab" }
  | { t: "nota"; s: string };

function VocabNota() {
  return (
    <div className="my-4 rounded-md bg-stone-100 px-4 py-3 text-[13px] leading-relaxed text-stone-600">
      <b className="font-semibold text-stone-800">Sobre os nomes.</b> Os termos aqui —{" "}
      <i>Concorrentes, Contas, Áreas, Prioridade, Oportunidade, Base de conhecimento</i> — são os
      padrão. <b className="font-semibold text-stone-800">O seu Radar pode usar os termos da sua
      agência</b>, definidos na sua implantação: se você renomeou &ldquo;concorrentes&rdquo; pra
      &ldquo;rivais&rdquo;, é &ldquo;rivais&rdquo; que aparece nas suas telas.
    </div>
  );
}

function Bloco({ b }: { b: Bloco }) {
  switch (b.t) {
    case "h2":
      return <h2 className="mt-8 mb-2.5 text-[20px] font-bold tracking-[-0.01em] text-stone-900">{rich(b.s)}</h2>;
    case "h3":
      return <h3 className="mt-5 mb-1.5 text-[14px] font-bold text-stone-900">{rich(b.s)}</h3>;
    case "p":
      return <p className="mb-3.5 leading-[1.6] text-stone-700">{rich(b.s)}</p>;
    case "nota":
      return <p className="mb-3.5 text-[13.5px] italic leading-relaxed text-stone-500">{rich(b.s)}</p>;
    case "vocab":
      return <VocabNota />;
    case "why":
      return (
        <div className="my-4 rounded-r-md border-l-[3px] border-red-500 bg-red-50 px-4 py-3">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-red-500">{b.k}</div>
          <p className="text-[14.5px] leading-relaxed text-stone-700">{rich(b.s)}</p>
        </div>
      );
    case "cards":
      return (
        <div className="my-4 grid gap-3 sm:grid-cols-2">
          {b.items.map((c) => (
            <div key={c.n} className="rounded-lg border border-stone-200 bg-white px-4 py-3.5">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-stone-400">{c.n}</div>
              <div className="mt-0.5 mb-1 text-[15px] font-bold text-stone-900">{c.t}</div>
              <div className="text-[13px] leading-relaxed text-stone-500">{c.d}</div>
            </div>
          ))}
        </div>
      );
    case "flow":
      return (
        <div className="my-4 flex divide-x divide-stone-200 overflow-hidden rounded-lg border border-stone-200 bg-white">
          {b.steps.map((s) => (
            <div key={s.verb} className="flex-1 p-4 text-center">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">{s.who}</div>
              <div className="text-[16px] font-extrabold text-red-500">{s.verb}</div>
              <div className="mt-1 text-[12px] leading-snug text-stone-500">{s.ex}</div>
            </div>
          ))}
        </div>
      );
    case "ul":
      return (
        <ul className="mb-3.5 space-y-2.5">
          {b.items.map((it, i) => (
            <li key={i} className="relative pl-5 leading-[1.55] text-stone-700">
              <span aria-hidden className="absolute left-0.5 top-[9px] h-1.5 w-1.5 rounded-full bg-red-500" />
              {rich(it)}
            </li>
          ))}
        </ul>
      );
  }
}

// ── conteúdo ────────────────────────────────────────────────────────────────
type Grupo = "COMECE AQUI" | "AS TELAS" | "A SUA CONFIGURAÇÃO" | "SEMPRE ATUAL";
type Item = { id: string; grupo: Grupo; label: string; selo?: "n1" | "soon" };

const TOC: Item[] = [
  { id: "modelo", grupo: "COMECE AQUI", label: "O modelo mental", selo: "n1" },
  { id: "dia", grupo: "COMECE AQUI", label: "Seu dia no Radar" },
  { id: "confianca", grupo: "COMECE AQUI", label: "Como confiar no que ele diz" },
  { id: "inicio", grupo: "AS TELAS", label: "Início" },
  { id: "hoje", grupo: "AS TELAS", label: "Hoje" },
  { id: "briefing", grupo: "AS TELAS", label: "Briefing" },
  { id: "feed", grupo: "AS TELAS", label: "Feed" },
  { id: "contas", grupo: "AS TELAS", label: "Contas" },
  { id: "prospects", grupo: "AS TELAS", label: "Prospects & dossiê" },
  { id: "concorrentes", grupo: "AS TELAS", label: "Concorrentes" },
  { id: "conhecimento", grupo: "AS TELAS", label: "Conhecimento" },
  { id: "relatorios", grupo: "AS TELAS", label: "Relatórios" },
  { id: "implantacao", grupo: "A SUA CONFIGURAÇÃO", label: "O que foi configurado pra você" },
  { id: "novidades", grupo: "SEMPRE ATUAL", label: "Novidades" },
  { id: "faq", grupo: "SEMPRE ATUAL", label: "Perguntas frequentes" },
];
const GRUPOS: Grupo[] = ["COMECE AQUI", "AS TELAS", "A SUA CONFIGURAÇÃO", "SEMPRE ATUAL"];
const labelDe = (id: string) => TOC.find((t) => t.id === id)?.label ?? id;

type Full = { kind: "full"; eyebrow: string; blocos: Bloco[]; prev?: string; next?: string };
type Stub = { kind: "stub"; eyebrow: string; texto: string };
type News = { kind: "novidades"; eyebrow: string; lead: string };

const CONTEUDO: Record<string, Full | Stub | News> = {
  modelo: {
    kind: "full",
    eyebrow: "COMECE AQUI",
    next: "dia",
    blocos: [
      { t: "p", s: "Antes de qualquer botão: o que o Radar faz, e por que ele faz assim. Cinco minutos aqui e o resto do sistema fica óbvio." },
      { t: "h2", s: "O Radar em uma frase" },
      { t: "p", s: "O Radar **vigia concorrentes, clientes e mercado por você**, cruza com o que você já sabe do seu negócio, e te entrega **o que fazer** — na hora certa, com a fonte e a data de cada coisa. Não é um feed de notícias: é inteligência que vira ação." },
      { t: "vocab" },
      { t: "h2", s: "De onde vem tudo: quatro bases" },
      { t: "p", s: "O Radar não inventa nada. Ele parte de quatro bases — e a mágica não está em nenhuma delas sozinha, está no **cruzamento**." },
      {
        t: "cards",
        items: [
          { n: "01", t: "O que você já sabe", d: "Seu negócio: o que você vende, pra quem, e por que ganha. Carregado na implantação." },
          { n: "02", t: "Seus clientes", d: "As contas que você não pode perder — o que se move nelas." },
          { n: "03", t: "Seus concorrentes", d: "Quem disputa o mesmo espaço — e o que mudou neles esta semana." },
          { n: "04", t: "O mercado", d: "Regulação, tendência, o número do setor que move a demanda." },
        ],
      },
      { t: "why", k: "Por que isso importa", s: "Cada base, sozinha, é só um relatório que envelhece. Quando o Radar liga um sinal do seu cliente ao movimento de um concorrente e a uma tendência de mercado, nasce uma recomendação que **não existia em lugar nenhum** — e que você levaria semanas pra enxergar sozinho." },
      { t: "h2", s: "O ciclo: sente, lembra, age" },
      {
        t: "flow",
        steps: [
          { who: "Radar", verb: "Sente", ex: "capta o sinal no momento em que acontece" },
          { who: "Base", verb: "Lembra", ex: "cruza com o que você sabe do negócio" },
          { who: "Você", verb: "Age", ex: "recebe a recomendação pronta pra usar" },
        ],
      },
      { t: "p", s: "Cada volta fortalece a próxima: quanto mais o Radar observa e quanto mais você marca o que foi útil, mais afiada fica a leitura." },
      { t: "h2", s: "Três coisas que fazem o Radar diferente" },
      { t: "h3", s: "1. Ele é honesto por construção" },
      { t: "p", s: "Toda afirmação vem com **a fonte e a data**. O Radar distingue o que é [fato] do que é [inferência] e do que é [interno] — e quando não sabe, ele **diz que não sabe**, em vez de inventar. Um “nada relevante hoje” é uma resposta válida." },
      { t: "why", k: "Por que isso importa pra você", s: "Você vai repetir o que o Radar diz **na frente de um cliente**. Por isso ele nunca chuta: um dado inventado te queimaria numa reunião. Quando ele afirma algo, você pode levar — a fonte está ali do lado." },
      { t: "h3", s: "2. O critério é o SEU" },
      { t: "p", s: "O que o Radar considera “importante”, o que ele ignora como ruído, as áreas que ele lê, os nomes que ele usa — **tudo isso foi definido na sua implantação**, a partir de como a sua operação pensa. O Radar não tem uma opinião genérica sobre o que importa; ele tem a **sua**." },
      { t: "h3", s: "3. Ele filtra com rigor" },
      { t: "p", s: "Uma recomendação excelente por dia vale mais que vinte mornas. O que está abaixo do seu critério **não sobe** — de propósito. Um sistema que grita o tempo todo é ignorado em uma semana." },
    ],
  },
  dia: {
    kind: "full",
    eyebrow: "COMECE AQUI",
    prev: "modelo",
    next: "confianca",
    blocos: [
      { t: "p", s: "O ritual é simples: você abre o Radar antes do dia começar, vê o que mudou, e trata cada coisa como se fosse uma caixa de entrada — até zerar." },
      { t: "h2", s: "Comece pelo **Hoje**" },
      { t: "p", s: "O Hoje é a sua primeira parada. Ele responde duas perguntas, no topo, em números: **o que precisa de você hoje** e **o que mudou desde ontem**. Você bate o olho e já sabe se o dia tem fogo — sem ler três parágrafos." },
      { t: "p", s: "Abaixo, os sinais aparecem em ordem de importância: os que pedem ação primeiro, os novos depois." },
      { t: "h2", s: "O ciclo de um sinal (menos de um minuto)" },
      { t: "p", s: "Cada sinal é um card. Você não precisa ler tudo de tudo — a ideia é a mesma de um e-mail:" },
      {
        t: "ul",
        items: [
          "**Leia a manchete.** Ela é o fato, curto. Se já basta, decida e siga.",
          "**Quer o porquê? Abra a análise.** Ali o Radar explica por que aquilo importa pra você e sugere a ação. A análise fica recolhida de propósito — você expande só quando quer.",
          "**Decida:** **Atuado** (já cuidei / vou cuidar), **Adiar** (me lembra amanhã) ou **Ignorar** (não é pra mim). O item sai da sua lista de “precisa de você”.",
        ],
      },
      { t: "why", k: "Por que “zerar”", s: "Marcar cada item é o que transforma o Radar de “mais um feed” em “uma caixa que eu esvazio”. É esse gesto que traz você de volta amanhã — e que ensina o Radar o que foi útil, afinando a régua com o tempo." },
      { t: "h2", s: "De sinal a ação" },
      { t: "p", s: "Quando um sinal vira oportunidade, o botão **Gerar no Formare** transforma a recomendação em um rascunho pronto — a abordagem, o e-mail, o próximo passo. O insight não morre num relatório; ele vira trabalho." },
      { t: "nota", s: "Quando a varredura automática e o resumo diário estiverem ligados (isso é definido na sua implantação), o Radar te avisa de manhã sozinho. Mesmo sem isso, o Hoje é sempre o seu ponto de partida." },
    ],
  },
  confianca: {
    kind: "full",
    eyebrow: "COMECE AQUI",
    prev: "dia",
    next: "implantacao",
    blocos: [
      { t: "p", s: "A regra de ouro: o Radar nunca te pede pra confiar nele “no escuro”. Toda afirmação vem com de onde veio e quando. Aprender a ler esses sinais é o que te deixa usar o Radar sem medo — e saber o que dá pra levar pra uma reunião." },
      { t: "h2", s: "Três tipos de informação" },
      {
        t: "ul",
        items: [
          "[fato] Veio de uma fonte pública e está citado. É o que você pode **repetir com segurança** — a fonte está do lado.",
          "[inferência] O Radar **deduziu** a partir de indícios. Trate como **hipótese forte**, não como verdade cravada — vale confirmar antes de usar numa reunião.",
          "[interno] Veio do que **você** carregou (a base, uma proposta, uma nota). É confiável, mas é privado — saiba que o cliente não publicou isso; você que sabia.",
        ],
      },
      { t: "why", k: "Por que isso importa", s: "Essa é a diferença entre “achei que” e “sei que”. Quando o Radar marca [fato] com a fonte, você leva pra reunião de cabeça erguida. Quando marca [inferência], você sabe que é seu palpite embasado — não a boca do cliente." },
      { t: "h2", s: "A data: o quão fresco é o sinal" },
      { t: "p", s: "Todo sinal mostra **quando foi coletado** e, quando existe, **quando foi publicado**. Um movimento de ontem pesa diferente de um de três meses atrás — e o Radar te deixa ver isso. Se não há data confiável, ele diz **“sem data”** — nunca chuta uma." },
      { t: "h2", s: "Quando ele não sabe, ele diz" },
      { t: "p", s: "Se o Radar não achou algo, aparece **“não encontrado”** — não um valor inventado pra preencher a lacuna. E quando não há nada relevante no dia, ele diz **“dia tranquilo”**, em vez de fabricar uma urgência." },
      { t: "why", k: "Isso é uma qualidade, não uma falha", s: "Um “não sei” honesto vale mais que um palpite confiante. É justamente porque o Radar admite quando não sabe que você pode confiar quando ele afirma. Se ele gritasse “urgente!” todo dia, você aprenderia a ignorá-lo em uma semana." },
    ],
  },
  implantacao: {
    kind: "full",
    eyebrow: "A SUA CONFIGURAÇÃO",
    prev: "confianca",
    blocos: [
      { t: "p", s: "O Radar não tem uma opinião genérica sobre o que importa. Ele tem a **sua**. Tudo que faz um sinal subir, o que ele ignora como ruído, as áreas que ele lê e os nomes que ele usa foram definidos na sua **implantação** — e ficam registrados numa tela só." },
      { t: "h2", s: "A tela Implantação" },
      { t: "p", s: "Ali você vê, em um lugar, o critério da sua operação dentro do Radar:" },
      {
        t: "ul",
        items: [
          "**O que é prioridade** — a partir de que ponto um sinal é “Alta”, “Média” ou ruído.",
          "**As áreas que leem** cada sinal (comercial, marketing, produto…) e a régua de cada uma.",
          "**Os seus nomes** — se a sua operação chama de “rivais” em vez de “concorrentes”, o Radar fala assim.",
          "**A cadência e quem recebe o quê.**",
        ],
      },
      { t: "p", s: "Cada definição mostra, discreto, **a frase que você disse na implantação que a gerou** — do tipo *“definido porque vocês disseram: ‘a gente age quando o cliente abre operação nova’”*. É a sua inteligência, escrita." },
      { t: "h2", s: "Por que é só leitura" },
      { t: "p", s: "Essa tela você **vê, mas não edita** — de propósito. O critério foi afinado com cuidado na implantação; mexer nele solto estragaria a qualidade do que o Radar te entrega. Quando algo precisa mudar, é rápido: fala com a gente, e a gente ajusta na revisão. (É também assim que o Radar melhora com o tempo — o que você marca como **Atuado** ou **Ignorar** vira insumo pra afinar a régua.)" },
      { t: "why", k: "Use isso a seu favor", s: "Quando um sinal aparecer (ou **não** aparecer) e você quiser entender por quê, esta tela é a resposta. E ela é a prova, num lugar só, de que o Radar não é uma ferramenta genérica: é a inteligência da sua operação, rodando sozinha." },
    ],
  },
  novidades: { kind: "novidades", eyebrow: "SEMPRE ATUAL", lead: "O que mudou no Radar. Esta página se atualiza sozinha — você não precisa procurar num PDF antigo." },
  inicio: {
    kind: "full",
    eyebrow: "AS TELAS",
    next: "hoje",
    blocos: [
      { t: "p", s: "A sua primeira tela ao entrar. Num relance ela responde: o que precisa de você hoje, em quais clientes — e se a operação está saudável." },
      { t: "h2", s: "O cockpit dos seus clientes" },
      { t: "p", s: "O corpo da Home é **um cartão por cliente que você atende**: quantos sinais **pedem ação**, quantos são **novos hoje**, e quando foi a **última varredura**. Fica ordenado por quem pede mais ação primeiro — você sabe por onde começar sem abrir cliente por cliente." },
      { t: "p", s: "Uma linha de saúde honesta acompanha: última varredura (com data), se a **coleta** correu bem ou falhou, e se a varredura automática está ligada. Se algo quebrou, aparece aqui — não fica escondido." },
      { t: "why", k: "Por que começar aqui", s: "Em vez de garimpar cliente a cliente pra achar o fogo, você vê tudo de cima e desce onde importa. O Início te dá o **mapa**; o Hoje e cada cliente te dão o **detalhe** — o botão “Ver o dia no Hoje” leva à lista do dia." },
      { t: "nota", s: "Se você administra a plataforma (a agência-mãe), aparece no topo uma faixa “O negócio” com os números do todo — agências, custo do mês, contas monitoradas, cota de coleta. Só quem administra vê." },
    ],
  },
  hoje: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "inicio",
    next: "briefing",
    blocos: [
      { t: "p", s: "O ritual da manhã. O Hoje junta, num lugar só, tudo que mudou nos seus clientes desde ontem — e você trata como uma caixa de entrada, até zerar." },
      { t: "h2", s: "O que você vê" },
      { t: "p", s: "No topo, dois números: **o que precisa de você** e **o que mudou desde ontem**. Abaixo, os sinais em ordem de importância — os que pedem ação primeiro. Quando vários vêm do **mesmo movimento**, aparecem agrupados; os que você **adiou ontem** voltam separados, no topo." },
      { t: "p", s: "Sem nada relevante, o Hoje diz **“dia tranquilo”** — uma resposta válida, nunca uma urgência fabricada." },
      { t: "why", k: "Como trabalhar cada item", s: "O passo a passo de decidir um sinal — **Atuado**, **Adiar** ou **Ignorar** — e por que “zerar” importa está escrito em **Seu dia no Radar** (lá em cima, em “Comece aqui”). O Hoje é a tela desse ritual." },
    ],
  },
  briefing: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "hoje",
    next: "feed",
    blocos: [
      { t: "p", s: "O jornal do dia de um cliente: os sinais que passaram na régua, já com a leitura e a ação — organizados por ótica." },
      { t: "h2", s: "Óticas: a mesma notícia, no idioma de cada time" },
      { t: "p", s: "No topo, um seletor: **Geral** (a sua visão — os mais fortes), **Comercial**, **Produto**, **Marketing** e **Recomendações**. Cada ótica lê o mesmo movimento com os olhos daquele time e sugere a ação certa pra ele." },
      { t: "p", s: "**Recomendações** é o cruzamento — o ouro: o movimento do concorrente × o que o cliente tem por dentro. Ele separa o **meio-pronto** (você começou e parou — reative), o **gap** (o mercado quer e você não tem) e o **já-temos** (arme vendas)." },
      { t: "h2", s: "Cada sinal, e o que fazer com ele" },
      { t: "p", s: "Todo sinal traz a **prioridade** (Alta · Média · Baixa), o **por que importa**, a **ação recomendada** e a **fonte com data**. O botão **Gerar no Formare** transforma a recomendação num rascunho pronto. **Rodar agora** força uma coleta nova; **Apresentar** abre uma versão limpa pra mostrar ao cliente." },
      { t: "why", k: "A régua é sua", s: "O que sobe aqui é o que passou no **seu** critério, definido na implantação. Se algo não apareceu, provavelmente ficou abaixo da régua — de propósito. Uma boa recomendação por dia vale mais que vinte mornas." },
    ],
  },
  feed: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "briefing",
    next: "contas",
    blocos: [
      { t: "p", s: "Tudo que o Radar coletou de um cliente, cru, sem análise — a matéria-prima do Briefing." },
      { t: "p", s: "O **Briefing** mostra o que **importa** (filtrado e lido). O **Feed** mostra **tudo** que entrou — posts, notícias, mudanças de site — na ordem em que chegou. Serve pra conferir a origem de um sinal, achar algo que não subiu, ou só sentir o volume do que está acontecendo." },
      { t: "nota", s: "Cada item traz a fonte e a data. Nada aqui é opinião do Radar — é o que ele efetivamente viu, sem interpretação." },
    ],
  },
  contas: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "feed",
    next: "prospects",
    blocos: [
      { t: "p", s: "As contas-chave de um cliente — as que ele não pode perder — e o que se move nelas." },
      { t: "h2", s: "Aderência: onde você encaixa" },
      { t: "p", s: "Pra cada conta, o Radar mostra o que mudou e classifica a **aderência** do que o cliente vende: **direto** (encaixa na hora), **adjacente** (dá pra esticar) ou **brecha** (ninguém está olhando). A brecha é valiosa — é o espaço em branco, onde a disputa ainda não começou." },
      { t: "p", s: "E a **jogada de relacionamento**: dado o sinal daquela conta cruzado com a oferta, qual o próximo passo. A régua nunca descarta uma conta — ela classifica; até a brecha vira oportunidade." },
      { t: "nota", s: "No seu Radar, “Contas” pode ter outro nome — o que a sua operação definiu na implantação." },
    ],
  },
  prospects: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "contas",
    next: "concorrentes",
    blocos: [
      { t: "p", s: "Vai visitar uma empresa? O Radar monta o dossiê completo dela — pra você chegar preparado." },
      { t: "h2", s: "O dossiê" },
      { t: "p", s: "Adicione a empresa e o Radar traz **perfil, concorrentes, sinais recentes, a aderência com o que você vende e a munição pra conversa** — tudo com fonte e data. Você pode subir um **contexto privado** seu (uma proposta, uma nota), que entra marcado como [interno] — confiável, mas seu, não algo que o cliente publicou." },
      { t: "p", s: "Na **véspera da reunião**, o Radar te lembra e gera um **PDF** pra levar. Depois, dá pra **promover** o prospect a conta-chave (vira monitorado) ou **arquivar**." },
      { t: "why", k: "Por que ele nunca chuta", s: "Você vai repetir isto na frente do cliente. Por isso o dossiê é honesto: distingue [fato] de [inferência] e de [interno], e o que não achou vira “não encontrado”. Um dado inventado te queimaria na reunião." },
    ],
  },
  concorrentes: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "prospects",
    next: "conhecimento",
    blocos: [
      { t: "p", s: "Monitore e diagnostique quem disputa o mesmo espaço do seu cliente." },
      { t: "h2", s: "Monitorar × diagnosticar" },
      { t: "p", s: "**Monitorar** é cadastrar o concorrente e suas fontes — o Radar passa a captar os movimentos dele, que viram sinal no Briefing e no Feed. **Diagnosticar** é a ficha profunda: o **posicionamento** (o que ele diz de si — tagline, propósito, provas) e os **canais** (onde ele está, com que frequência e recência)." },
      { t: "p", s: "A varredura reexamina os concorrentes periodicamente e marca **o que mudou** — uma tagline nova, um lançamento — pra você não perder um movimento." },
      { t: "nota", s: "O diagnóstico é honesto: o que o Radar não achou aparece como “não encontrado”, nunca inventado. E “Concorrentes” pode ter outro nome no seu Radar (definido na implantação)." },
    ],
  },
  conhecimento: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "concorrentes",
    next: "relatorios",
    blocos: [
      { t: "p", s: "Pergunte qualquer coisa sobre um cliente — e receba a resposta com a fonte e a data." },
      { t: "p", s: "É a base de conhecimento do cliente, aberta em pergunta e resposta. “Qual o diferencial deles?”, “Quem são os clientes citados?”, “O que mudou no último trimestre?” — o Radar responde do que sabe, **citando de onde tirou**, e diz honestamente quando **não sabe**." },
      { t: "why", k: "Por que isso vale", s: "É a diferença entre “acho que” e “sei que”: a resposta vem com a prova ao lado, pronta pra usar numa proposta ou reunião. Quanto mais rica a base (o que você carregou na implantação), melhor a resposta." },
    ],
  },
  relatorios: {
    kind: "full",
    eyebrow: "AS TELAS",
    prev: "conhecimento",
    blocos: [
      { t: "p", s: "Monte e exporte um relatório pronto pra reunião — com gráficos, na sua marca." },
      { t: "p", s: "Escolha um modelo (resumo da semana, comparativo de concorrentes, panorama comercial…) ou descreva o que quer; o Radar monta com os movimentos do período e **gráficos**, e exporta em **PDF/link** pra compartilhar." },
      { t: "p", s: "Dá pra **agendar** um relatório recorrente — semanal, por exemplo. Ele chega pronto, no dia, sem você precisar pedir." },
      { t: "nota", s: "Os números vêm dos sinais coletados (com fonte e data) — é relatório de agência, não slide genérico." },
    ],
  },
  faq: {
    kind: "full",
    eyebrow: "SEMPRE ATUAL",
    blocos: [
      { t: "p", s: "As dúvidas que mais aparecem. Esta lista cresce com as perguntas reais das primeiras agências." },
      { t: "h3", s: "Por que esse sinal não apareceu?" },
      { t: "p", s: "Provavelmente ficou **abaixo da sua régua de prioridade** (definida na implantação) — o Radar filtra de propósito, pra não gritar o tempo todo. Veja o seu critério em **O que foi configurado pra você**, ou fale com a gente pra ajustar." },
      { t: "h3", s: "O que é “prioridade”?" },
      { t: "p", s: "O **peso** de um sinal — **Alta · Média · Baixa** —, a partir do corte que a sua operação definiu. É o que decide o que sobe primeiro no Briefing e no Hoje." },
      { t: "h3", s: "Posso mudar um nome (ex.: “concorrentes” → “rivais”)?" },
      { t: "p", s: "Pode — mas é definido na **implantação** (a gente ajusta na revisão), não numa tela solta, pra não estragar a régua. Feito isso, o seu Radar passa a falar com a sua língua em todas as telas." },
      { t: "h3", s: "O Radar inventa dado?" },
      { t: "p", s: "Não. Toda afirmação vem com **fonte e data**; o que ele não acha vira **“não encontrado”**; e um dia sem novidade é **“dia tranquilo”**. Um “não sei” honesto vale mais que um palpite confiante." },
      { t: "h3", s: "Com que frequência ele atualiza?" },
      { t: "p", s: "A coleta roda **diariamente** (e o resumo do dia chega de manhã, se você ligou a automação). A qualquer momento, **Rodar agora** força uma coleta nova de um cliente." },
      { t: "h3", s: "O meu Radar mostra nomes ou áreas diferentes do treinamento — por quê?" },
      { t: "p", s: "Este treinamento é **genérico**. O seu Radar usa os **termos e critérios da sua implantação** — por isso pode chamar as coisas por outro nome e ler áreas diferentes. É a sua operação, não uma configuração de fábrica." },
    ],
  },
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, ano, mes, dia] = m;
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`;
}

function PgLink({ id, dir, onGo }: { id: string; dir: "prev" | "next"; onGo: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onGo(id)} className="text-[13px] font-semibold text-red-500 hover:text-red-600">
      {dir === "prev" ? `← ${labelDe(id)}` : `Próximo: ${labelDe(id)} →`}
    </button>
  );
}

function SecaoCorpo({ id, novidades, onGo }: { id: string; novidades: Novidade[]; onGo: (id: string) => void }) {
  const c = CONTEUDO[id];
  const eyebrow = <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-red-500">{c.eyebrow}</div>;
  const h1 = <h1 className="mt-2 mb-1.5 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-stone-900 md:text-[34px]">{labelDe(id)}</h1>;

  if (c.kind === "stub") {
    return (
      <>
        {eyebrow}
        {h1}
        <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white px-5 py-6 text-[14px] leading-relaxed text-stone-500">
          {rich(c.texto)}
        </div>
      </>
    );
  }

  if (c.kind === "novidades") {
    return (
      <>
        {eyebrow}
        {h1}
        <p className="mb-6 text-[17px] text-stone-500">{c.lead}</p>
        {novidades.length === 0 ? (
          <p className="text-stone-500">Nada por aqui ainda.</p>
        ) : (
          <div>
            {novidades.map((n, i) => (
              <div key={i} className="border-b border-stone-200 py-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{formatarData(n.data)}</div>
                <div className="mt-0.5">
                  <b className="font-semibold text-stone-900">{n.titulo}</b>
                  <span className="text-stone-700"> — {n.descricao}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // full
  const primeiro = c.blocos[0];
  const lead = primeiro?.t === "p" ? primeiro : null;
  const resto = lead ? c.blocos.slice(1) : c.blocos;
  return (
    <>
      {eyebrow}
      {h1}
      {lead ? <p className="mb-7 text-[17px] leading-snug text-stone-500">{rich(lead.s)}</p> : null}
      {resto.map((b, i) => (
        <Bloco key={i} b={b} />
      ))}
      {c.prev || c.next ? (
        <div className="mt-11 flex justify-between border-t border-stone-200 pt-5">
          {c.prev ? <PgLink id={c.prev} dir="prev" onGo={onGo} /> : <span />}
          {c.next ? <PgLink id={c.next} dir="next" onGo={onGo} /> : <span />}
        </div>
      ) : null}
    </>
  );
}

// ── TOC (sidebar) ────────────────────────────────────────────────────────────
function TocLista({ ativo, onGo }: { ativo: string; onGo: (id: string) => void }) {
  return (
    <>
      {GRUPOS.map((g) => (
        <div key={g}>
          <div className="px-6 pt-4 pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-stone-400">{g}</div>
          {TOC.filter((t) => t.grupo === g).map((t) => {
            const on = t.id === ativo;
            return (
              <button
                key={t.id}
                type="button"
                data-goto={t.id}
                onClick={() => onGo(t.id)}
                aria-current={on ? "page" : undefined}
                className={
                  "flex w-full items-center justify-between gap-2 border-l-2 px-6 py-[7px] text-left text-[13.5px] transition-colors " +
                  (on
                    ? "border-red-500 bg-stone-100 font-semibold text-stone-900"
                    : "border-transparent text-stone-600 hover:bg-stone-100")
                }
              >
                <span>{t.label}</span>
                {t.selo === "n1" ? (
                  <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[8.5px] font-extrabold tracking-wide text-emerald-700">1</span>
                ) : t.selo === "soon" ? (
                  <span className="rounded-full bg-stone-100 px-1.5 py-px text-[8.5px] font-extrabold tracking-wide text-stone-400">em breve</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function Resultados({ ids, onGo }: { ids: string[]; onGo: (id: string) => void }) {
  if (ids.length === 0) return <p className="px-6 py-4 text-[13px] text-stone-400">Nada encontrado.</p>;
  return (
    <div className="py-1">
      <div className="px-6 pt-3 pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-stone-400">
        {ids.length} resultado{ids.length > 1 ? "s" : ""}
      </div>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onGo(id)}
          className="flex w-full items-center gap-2 px-6 py-[7px] text-left text-[13.5px] text-stone-700 hover:bg-stone-100"
        >
          {labelDe(id)}
        </button>
      ))}
    </div>
  );
}

export function TreinamentoView({ novidades }: { novidades: Novidade[] }) {
  const [ativo, setAtivo] = useState("modelo");
  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState<Record<string, string>>({});
  const corpoRef = useRef<HTMLDivElement>(null);

  // Índice de busca: lê o texto renderizado de cada seção (todas montadas).
  useEffect(() => {
    const root = corpoRef.current;
    if (!root) return;
    const idx: Record<string, string> = {};
    root.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => {
      idx[el.dataset.sec ?? ""] = (el.textContent ?? "").toLowerCase();
    });
    setIndice(idx);
  }, []);

  const q = busca.trim().toLowerCase();
  const resultados = useMemo(() => {
    if (!q) return null;
    return TOC.filter((t) => t.label.toLowerCase().includes(q) || (indice[t.id] ?? "").includes(q)).map((t) => t.id);
  }, [q, indice]);

  function ir(id: string) {
    setAtivo(id);
    setBusca("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
    corpoRef.current?.scrollTo?.({ top: 0 });
  }

  const buscaInput = (
    <input
      type="search"
      value={busca}
      onChange={(e) => setBusca(e.target.value)}
      placeholder="buscar no treinamento…"
      aria-label="Buscar no treinamento"
      className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-800 placeholder:text-stone-400 focus:border-red-400 focus:outline-none"
    />
  );

  return (
    <div className="min-h-[100dvh] bg-stone-50">
      <div className="mx-auto grid max-w-[1180px] md:grid-cols-[264px_1fr]">
        {/* SIDEBAR (desktop) */}
        <aside className="sticky top-0 hidden h-[100dvh] flex-col overflow-y-auto border-r border-stone-200 py-6 md:flex">
          <div className="flex items-center gap-2 px-6 pb-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="font-extrabold text-stone-900">Radar</span>
            <span className="ml-1 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">Treinamento</span>
          </div>
          <Link href="/hoje" className="px-6 pb-2 text-[12px] font-semibold text-stone-500 hover:text-red-500">
            ← Voltar ao Radar
          </Link>
          <div className="px-4 py-2">{buscaInput}</div>
          <nav className="flex-1" aria-label="Conteúdo do treinamento">
            {resultados ? <Resultados ids={resultados} onGo={ir} /> : <TocLista ativo={ativo} onGo={ir} />}
          </nav>
        </aside>

        {/* CONTEÚDO */}
        <div className="min-w-0">
          {/* topo mobile: voltar + busca + salto de seção */}
          <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur md:hidden">
            <div className="mb-2 flex items-center gap-2">
              <Link href="/hoje" className="text-[13px] font-semibold text-stone-500 hover:text-red-500">
                ← Radar
              </Link>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-extrabold text-stone-900">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Treinamento
              </span>
            </div>
            {buscaInput}
            {resultados ? (
              <div className="mt-2 overflow-hidden rounded-md border border-stone-200 bg-white">
                <Resultados ids={resultados} onGo={ir} />
              </div>
            ) : (
              <select
                aria-label="Ir para a seção"
                value={ativo}
                onChange={(e) => ir(e.target.value)}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-2 py-2 text-[13px] text-stone-800"
              >
                {GRUPOS.map((g) => (
                  <optgroup key={g} label={g}>
                    {TOC.filter((t) => t.grupo === g).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.selo === "soon" ? " (em breve)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          {/* seções: todas montadas (busca lê o texto); só a ativa aparece */}
          <main ref={corpoRef} className="mx-auto max-w-[760px] px-6 py-10 md:px-14 md:py-12">
            {TOC.map((t) => (
              <section key={t.id} data-sec={t.id} className={t.id === ativo ? "block" : "hidden"} aria-hidden={t.id !== ativo}>
                <SecaoCorpo id={t.id} novidades={novidades} onGo={ir} />
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
