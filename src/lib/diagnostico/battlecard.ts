/**
 * F1d — BATTLECARD VIVO: o artefato COMERCIAL do diagnóstico. Monta, por
 * concorrente, a partir do que JÁ FOI COLETADO (zero scrape novo):
 *   posicionamento (L1) + forças/fraquezas (reviews F1c + provas observáveis)
 *   + preço (F1b) + NOSSOS diferenciais (Brain, pela porta que já existe)
 *   + movimentos recentes (F1a).
 *
 * HONESTIDADE POR CONSTRUÇÃO:
 * - Cada força/fraqueza precisa apontar uma EVIDÊNCIA da lista numerada (dado
 *   real coletado, com fonte). Índice inválido = item descartado em código.
 * - "Como ganhar" só usa diferencial presente no CONTEXTO DO BRAIN; se o Brain
 *   não cobre a fraqueza → nosso_diferencial:null ("sem diferencial nosso
 *   mapeado") — dizer, não forçar. Brain mode "none" ⇒ TODOS null (forçado em código).
 * - O card inteiro é rotulado DERIVADO (nem fato puro, nem opinião solta).
 */

import { fetchClientBrain } from "@/lib/brain";
import { completeViaGateway } from "@/lib/gateway";
import type {
  Battlecard,
  BattlecardItem,
  ComoGanhar,
  DiagnosticoConcorrente,
  Objecao,
} from "@/lib/diagnostico/schema";

type Evidencia = { texto: string; fonte_url?: string; citacao?: string | null };

/** Junta TODO dado real coletado numa lista numerada (a base citável do card). */
export function montarEvidencias(diag: DiagnosticoConcorrente): Evidencia[] {
  const ev: Evidencia[] = [];
  const p = diag.posicionamento;

  const campo = (rotulo: string, c: { valor: string | null; fonte_url?: string; status: string }) => {
    if (c.status === "encontrado" && c.valor) ev.push({ texto: `${rotulo}: ${c.valor}`, fonte_url: c.fonte_url });
  };
  campo("Tagline", p.tagline);
  campo("Posicionamento declarado", p.posicionamento);
  for (const d of p.diferenciais.slice(0, 6)) campo("Diferencial declarado", d);
  if (p.produtos.length) {
    ev.push({
      texto: `Produtos (${p.produtos.length}): ${p.produtos.map((x) => x.nome).join(", ")}`,
      fonte_url: p.produtos[0]?.fonte_url,
    });
  }
  if (p.provas.clientes_citados.length) {
    ev.push({
      texto: `Clientes citados no site: ${p.provas.clientes_citados.map((c) => c.valor).filter(Boolean).join(", ")}`,
      fonte_url: p.provas.clientes_citados[0]?.fonte_url,
    });
  } else {
    ev.push({ texto: "Nenhum cliente citado no site (prova social ausente)", fonte_url: diag.site_url });
  }
  if (p.provas.depoimentos.status !== "encontrado") {
    ev.push({ texto: "Sem depoimentos visíveis no site", fonte_url: diag.site_url });
  }

  // reputação: nota (fato) + temas com citação (derivado com lastro)
  for (const f of diag.reputacao?.fontes ?? []) {
    if (f.status !== "coletado") continue;
    if (f.nota !== null) {
      ev.push({ texto: `Nota ${f.fonte}: ${f.nota} (escala ${f.escala}) em ${f.n_avaliacoes ?? "?"} avaliações`, fonte_url: f.fonte_url });
    }
    for (const t of f.temas_reclamacao) {
      ev.push({ texto: `Tema de RECLAMAÇÃO em reviews (${f.fonte}): ${t}`, fonte_url: f.fonte_url, citacao: f.citacoes[0] ?? null });
    }
    for (const t of f.temas_elogio) {
      ev.push({ texto: `Tema de ELOGIO em reviews (${f.fonte}): ${t}`, fonte_url: f.fonte_url, citacao: f.citacoes[0] ?? null });
    }
  }

  // preço
  if (diag.preco && diag.preco.status !== "nao_encontrado") {
    const planos = diag.preco.planos.map((x) => `${x.plano}${x.preco ? ` ${x.preco}` : ""}`).join("; ");
    ev.push({
      texto: diag.preco.status === "encontrado" ? `Preço público: ${planos}` : `Preço sob consulta (não publica valores)`,
      fonte_url: diag.preco.fonte_url,
    });
  }

  // movimentos recentes (F1a) — o "o que mudou" vira munição de conversa
  for (const m of (diag.movimentos ?? []).slice(0, 4)) {
    if (m.tipo === "primeira_coleta") continue;
    ev.push({ texto: `Movimento recente (${m.campo_label}): ${m.de ?? "—"} → ${m.para ?? "—"}`, fonte_url: m.fonte_url_para ?? m.fonte_url_de });
  }

  return ev.slice(0, 24);
}

const SYSTEM =
  "Você monta um BATTLECARD comercial sobre UM concorrente, para o time de vendas do NOSSO cliente. " +
  "Você recebe: (a) EVIDÊNCIAS numeradas (E1, E2…) — únicos fatos utilizáveis sobre o concorrente; (b) o CONTEXTO DA BASE DE CONHECIMENTO — único lugar de onde podem sair os NOSSOS diferenciais. " +
  "REGRAS INVIOLÁVEIS: " +
  "(1) toda força/fraqueza aponta 'evidencia' = número de UMA evidência que a sustenta — NUNCA afirme algo sem evidência da lista; " +
  "(2) fraquezas em 'como_ganhar' também apontam evidência; 'nosso_diferencial' SÓ pode ser algo presente no CONTEXTO DA BASE DE CONHECIMENTO (parafrasear ok, inventar NUNCA) — se a base de conhecimento não cobre a fraqueza, use nosso_diferencial:null e resposta:null; " +
  "(3) 'objecoes' = objeções que um comprador levantaria contra NÓS por causa deste concorrente, com resposta baseada SÓ em base de conhecimento/evidências; " +
  "(4) máx 4 itens por lista; frases curtas, tom de battlecard (direto, sem marketing vazio); português do Brasil. " +
  'Responda SÓ JSON: {"quem_sao":"2-3 frases","forcas":[{"texto":"...","evidencia":1}],"fraquezas":[{"texto":"...","evidencia":2}],"como_ganhar":[{"fraqueza":"...","evidencia":2,"nosso_diferencial":"..."|null,"resposta":"..."|null}],"objecoes":[{"objecao":"...","resposta":"..."}]}';

type RawItem = { texto?: unknown; evidencia?: unknown };
type RawGanhar = { fraqueza?: unknown; evidencia?: unknown; nosso_diferencial?: unknown; resposta?: unknown };
type RawObjecao = { objecao?: unknown; resposta?: unknown };
type RawCard = { quem_sao?: unknown; forcas?: RawItem[]; fraquezas?: RawItem[]; como_ganhar?: RawGanhar[]; objecoes?: RawObjecao[] };

export async function gerarBattlecard(diag: DiagnosticoConcorrente): Promise<Battlecard> {
  const agora = new Date().toISOString();
  const evidencias = montarEvidencias(diag);
  const brain = await fetchClientBrain(diag.clientName);

  const evLista = evidencias.map((e, i) => `E${i + 1}. ${e.texto}${e.citacao ? ` — citação: "${e.citacao.slice(0, 120)}"` : ""}`).join("\n");
  const brainBloco =
    brain.mode === "none"
      ? "CONTEXTO DA BASE DE CONHECIMENTO: NENHUM — não há diferenciais nossos mapeados. TODOS os nosso_diferencial devem ser null."
      : `CONTEXTO DA BASE DE CONHECIMENTO (${brain.mode === "live" ? "base de conhecimento real" : brain.mode === "local" ? "base LOCAL da implantação — enxuta, não é o Brain completo" : "rascunho local — confirmar na base de conhecimento"}):\n${brain.context.slice(0, 3500)}`;

  const content = await completeViaGateway({
    system: SYSTEM,
    prompt:
      `NOSSO CLIENTE: ${diag.clientName}\nCONCORRENTE: ${diag.concorrente_nome} (${diag.site_url})\n\n` +
      `EVIDÊNCIAS SOBRE O CONCORRENTE:\n${evLista}\n\n${brainBloco}\n\nMonte o battlecard, honesto.`,
  });

  let parsed: RawCard = {};
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      parsed = JSON.parse(m[0]) as RawCard;
    } catch {
      parsed = {};
    }
  }

  const item = (raw: RawItem): BattlecardItem | null => {
    const texto = typeof raw.texto === "string" ? raw.texto.trim() : "";
    const idx = Number(raw.evidencia);
    const e = Number.isInteger(idx) && idx >= 1 && idx <= evidencias.length ? evidencias[idx - 1] : null;
    if (!texto || !e) return null; // sem evidência válida = fora (honesto)
    return { texto, fonte_url: e.fonte_url, citacao: e.citacao ?? null };
  };

  const forcas = (Array.isArray(parsed.forcas) ? parsed.forcas : []).map(item).filter((x): x is BattlecardItem => Boolean(x)).slice(0, 4);
  const fraquezas = (Array.isArray(parsed.fraquezas) ? parsed.fraquezas : []).map(item).filter((x): x is BattlecardItem => Boolean(x)).slice(0, 4);

  const como_ganhar: ComoGanhar[] = [];
  for (const raw of Array.isArray(parsed.como_ganhar) ? parsed.como_ganhar : []) {
    const fraqueza = typeof raw.fraqueza === "string" ? raw.fraqueza.trim() : "";
    const idx = Number(raw.evidencia);
    const e = Number.isInteger(idx) && idx >= 1 && idx <= evidencias.length ? evidencias[idx - 1] : null;
    if (!fraqueza || !e) continue;
    // Brain "none" ⇒ diferencial null FORÇADO em código (não confia só no prompt)
    const dif = brain.mode !== "none" && typeof raw.nosso_diferencial === "string" && raw.nosso_diferencial.trim() ? raw.nosso_diferencial.trim() : null;
    como_ganhar.push({
      fraqueza,
      fonte_url: e.fonte_url,
      nosso_diferencial: dif,
      resposta: dif && typeof raw.resposta === "string" && raw.resposta.trim() ? raw.resposta.trim() : null,
    });
  }

  const objecoes: Objecao[] = (Array.isArray(parsed.objecoes) ? parsed.objecoes : [])
    .map((o) => ({
      objecao: typeof o.objecao === "string" ? o.objecao.trim() : "",
      resposta: typeof o.resposta === "string" ? o.resposta.trim() : "",
    }))
    .filter((o) => o.objecao && o.resposta)
    .slice(0, 4);

  return {
    quem_sao: typeof parsed.quem_sao === "string" ? parsed.quem_sao.slice(0, 500) : "",
    forcas,
    fraquezas,
    como_ganhar: como_ganhar.slice(0, 4),
    objecoes,
    brain_mode: brain.mode,
    gerado_em: agora,
    tipo: "derivado",
    abordagem: diag.battlecard?.abordagem ?? null,
  };
}

const SYSTEM_ABORDAGEM =
  "Você é um redator comercial. A partir do BATTLECARD abaixo, escreva um RASCUNHO de e-mail de abordagem curto (assunto + 120-180 palavras) que o vendedor do NOSSO cliente enviaria a um prospect que hoje considera/usa o CONCORRENTE. " +
  "REGRAS: use SÓ o que está no battlecard (fraquezas deles com fonte, nossos diferenciais quando existirem, movimento recente como gancho); tom consultivo, zero bazófia; se o battlecard não tem diferencial nosso mapeado, o e-mail foca em PERGUNTAS sobre as dores (não afirma superioridade). " +
  "Português do Brasil. Responda SÓ o texto do e-mail (primeira linha = Assunto: ...).";

export async function gerarAbordagem(diag: DiagnosticoConcorrente): Promise<string> {
  const card = diag.battlecard;
  if (!card) throw new Error("Gere o battlecard antes da abordagem.");
  const resumo = {
    concorrente: diag.concorrente_nome,
    cliente: diag.clientName,
    quem_sao: card.quem_sao,
    fraquezas: card.fraquezas.map((f) => f.texto),
    como_ganhar: card.como_ganhar.map((g) => ({ fraqueza: g.fraqueza, diferencial: g.nosso_diferencial, resposta: g.resposta })),
    movimento_recente: (diag.movimentos ?? []).filter((mv) => mv.tipo !== "primeira_coleta").slice(0, 2).map((mv) => `${mv.campo_label}: ${mv.de ?? "—"} → ${mv.para ?? "—"}`),
  };
  const texto = await completeViaGateway({
    system: SYSTEM_ABORDAGEM,
    prompt: `BATTLECARD:\n${JSON.stringify(resumo, null, 2)}\n\nEscreva o rascunho.`,
  });
  return texto.trim().slice(0, 2500);
}
