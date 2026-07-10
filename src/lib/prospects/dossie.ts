/**
 * MOTOR DO DOSSIÊ (F1) — monta o dossiê de um prospect REUSANDO o motor do
 * Radar; NÃO reinventa e NÃO porta a descoberta do Formare:
 *
 *   Perfil        → runLente1 (posicionamento com fonte, o mesmo do diagnóstico);
 *   Concorrentes  → searchWeb ("<empresa> concorrentes/alternativas") + LLM que
 *                   só nomeia quem aparece nos resultados (inferência marcada);
 *   Sinais        → searchWeb (notícias/expansão/contratação) — fato com data+fonte;
 *   Encaixe       → fetchClientBrain (a NOSSA oferta/ICP/personas — a riqueza da
 *                   descoberta do Formare, lida pela porta) cruzada com o perfil;
 *   Munição       → LLM ancorado no perfil+encaixe (perguntas + objeções).
 *
 * HONESTIDADE: cada ponto vira `fato` (com URL), `inferencia` (marcada) ou
 * `nao_encontrado`. O LLM é instruído a NUNCA inventar — sem evidência, dizer.
 *
 * CUSTO: tudo roda sob `runWithUsage(feature: "prospect_dossie")` atribuído ao
 * cliente/entidade — é a ação elástica que valida o modelo de crédito.
 */

import { fetchClientBrain } from "@/lib/brain";
import { runLente1 } from "@/lib/diagnostico/lente1";
import { normalizeSiteUrl } from "@/lib/discovery";
import { searchWeb } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import { runWithUsage } from "@/lib/usage/context";
import {
  pontoFato,
  pontoInferencia,
  pontoNaoEncontrado,
  type ConcorrenteProspect,
  type Dossie,
  type EncaixeProspect,
  type MunicaoProspect,
  type PerfilProspect,
  type Ponto,
  type Prospect,
  type SinalProspect,
  type StatFirmo,
} from "@/lib/prospects/schema";
import type { Page } from "@/lib/diagnostico/lente1";
import type { Campo, Posicionamento } from "@/lib/diagnostico/schema";

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** extrai o 1º JSON do texto do LLM (tolerante a cerca ```json). */
function parseJson<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// ── 1. PERFIL (Lente 1) ─────────────────────────────────────────────────────

function campoParaPonto(c: Campo | undefined | null): Ponto | null {
  if (!c || c.status !== "encontrado" || !c.valor) return null;
  return pontoFato(c.valor, c.fonte_url);
}

function montarPerfil(
  nome: string,
  pos: Posicionamento,
  paginas: string[],
  extra: { descricao: Ponto | null; firmografia: StatFirmo[] },
): PerfilProspect {
  const produtos: Ponto[] = pos.produtos.slice(0, 8).map((p) =>
    pontoFato(p.descricao ? `${p.nome} — ${p.descricao}` : p.nome, p.fonte_url),
  );
  // porte: big numbers ou nº de clientes citados (fato, com fonte).
  const big = pos.provas.big_numbers.find((b) => b.status === "encontrado" && b.valor);
  const nClientes = pos.provas.clientes_citados.filter((c) => c.status === "encontrado").length;
  const porte: Ponto | null = big
    ? pontoFato(big.valor as string, big.fonte_url)
    : nClientes > 0
      ? pontoInferencia(`cita ~${nClientes} cliente(s) no site`, pos.provas.clientes_citados[0]?.fonte_url)
      : null;

  // descrição limpa (do extrator) tem prioridade; senão o posicionamento; senão honesto.
  const resumo =
    extra.descricao ??
    campoParaPonto(pos.posicionamento) ??
    campoParaPonto(pos.proposito) ??
    (produtos.length > 0
      ? pontoInferencia(`atua com ${produtos.length} solução(ões) identificada(s) no site`)
      : pontoNaoEncontrado("o site não deixou claro o que a empresa faz"));

  return {
    resumo,
    tagline: campoParaPonto(pos.tagline),
    posicionamento: campoParaPonto(pos.posicionamento),
    produtos,
    porte,
    firmografia: extra.firmografia,
    paginas_lidas: paginas,
  };
}

// ── FIRMOGRAFIA + descrição (a faixa de números da capa) ────────────────────

const FIRMO_SYSTEM =
  "Você extrai a FIRMOGRAFIA de uma empresa a partir do conteúdo do site dela e de notícias. Produza: " +
  "(1) uma DESCRIÇÃO de 1-2 frases do que a empresa faz (setor + o que oferece), factual; " +
  "(2) até 4 ESTATÍSTICAS firmográficas de peso, cada uma valor CURTO (ex.: '1911', '6', '924+', '3 países') + rótulo curto (ex.: 'Fundação', 'Sub-marcas', 'SKUs', 'Mercados novos') + o índice [n] da fonte que a embasa. " +
  "REGRAS DE HONESTIDADE (o vendedor repete na reunião): só o que estiver EVIDENCIADO nas fontes; NUNCA invente número; IGNORE números promocionais/campanha (ex.: 'aniversário de 8 anos da loja', 'X% off') — não são firmografia. " +
  "Marque cada stat: fato (dito na fonte) ou inferencia (contado/derivado, ex.: nº de mercados a partir das notícias). Se não achar firmografia real, devolva stats vazio (honesto). " +
  'Responda SÓ JSON: {"descricao":"...","descricaoFonte":n,"stats":[{"valor":"...","label":"...","fonte":n,"natureza":"fato"|"inferencia"}]}';

async function montarFirmografia(
  nome: string,
  pages: Page[],
  sinais: SinalProspect[],
): Promise<{ descricao: Ponto | null; firmografia: StatFirmo[] }> {
  // fontes numeradas: páginas do site + notícias (o LLM referencia por índice → anti-invenção).
  const fontes: Array<{ url: string; titulo: string }> = [
    ...pages.slice(0, 6).map((p) => ({ url: p.url, titulo: p.label })),
    ...sinais.map((s) => ({ url: s.fonte_url, titulo: s.fonte_titulo ?? s.titulo })),
  ];
  if (fontes.length === 0) return { descricao: null, firmografia: [] };
  const bloco =
    pages.slice(0, 6).map((p, i) => `[${i + 1}] (site: ${p.label}) ${p.markdown.slice(0, 900)}`).join("\n\n") +
    "\n\n" +
    sinais.map((s, i) => `[${pages.slice(0, 6).length + i + 1}] (notícia) ${s.titulo}`).join("\n");

  let raw = "";
  try {
    raw = await completeViaGateway({
      system: FIRMO_SYSTEM,
      prompt: `EMPRESA: ${nome}\nFONTES:\n${bloco}\n\nDescrição + firmografia, honesto.`,
    });
  } catch {
    return { descricao: null, firmografia: [] };
  }
  const parsed = parseJson<{ descricao?: unknown; descricaoFonte?: unknown; stats?: Array<{ valor?: unknown; label?: unknown; fonte?: unknown; natureza?: unknown }> }>(raw);
  const fonteDe = (i: unknown): { url?: string; titulo?: string } => (typeof i === "number" && fontes[i - 1] ? fontes[i - 1] : {});

  const descTxt = typeof parsed?.descricao === "string" ? parsed.descricao.trim() : "";
  const descFonte = fonteDe(parsed?.descricaoFonte);
  const descricao = descTxt ? pontoFato(descTxt, descFonte.url, descFonte.titulo) : null;

  const firmografia: StatFirmo[] = (parsed?.stats ?? [])
    .map((s): StatFirmo | null => {
      const valor = typeof s?.valor === "string" ? s.valor.trim() : typeof s?.valor === "number" ? String(s.valor) : "";
      const label = typeof s?.label === "string" ? s.label.trim() : "";
      if (!valor || !label) return null;
      const f = fonteDe(s?.fonte);
      return { valor, label, natureza: s?.natureza === "inferencia" ? "inferencia" : "fato", fonte_url: f.url };
    })
    .filter((x): x is StatFirmo => x !== null)
    .slice(0, 4);

  return { descricao, firmografia };
}

// ── 2. CONCORRENTES (searchWeb + LLM, inferência marcada) ───────────────────

const CONC_SYSTEM =
  "Você lista CONCORRENTES de uma empresa a partir de resultados de busca web. REGRAS DE HONESTIDADE: " +
  "só nomeie empresas que APARECEM nos resultados (nunca invente); cada uma com UMA linha curta de com quem ela briga ou onde é forte/fraca, derivada do que os resultados dizem. " +
  "Máximo 5. Se os resultados não deixarem claro nenhum concorrente, devolva lista vazia. " +
  'Responda SÓ JSON: {"concorrentes":[{"nome":"...","nota":"..."}]}';

async function montarConcorrentes(nome: string, siteHost: string): Promise<{ lista: ConcorrenteProspect[]; obs?: string }> {
  const hits = await searchWeb(`"${nome}" concorrentes OR alternativas OR "vs"`, 6);
  const externos = hits.filter((h) => hostDe(h.url) !== siteHost);
  if (externos.length === 0) return { lista: [], obs: "concorrentes: a busca web não trouxe resultados úteis." };
  const bloco = externos.map((h, i) => `[${i + 1}] ${h.title} — ${h.description ?? ""} (${h.url})`).join("\n");
  const fonte = externos[0].url;

  let raw = "";
  try {
    raw = await completeViaGateway({
      system: CONC_SYSTEM,
      prompt: `EMPRESA: ${nome}\nRESULTADOS DE BUSCA:\n${bloco}\n\nQuem são os concorrentes, honesto?`,
    });
  } catch {
    return { lista: [], obs: "concorrentes: análise indisponível nesta geração." };
  }
  const parsed = parseJson<{ concorrentes?: Array<{ nome?: unknown; nota?: unknown }> }>(raw);
  const lista: ConcorrenteProspect[] = (parsed?.concorrentes ?? [])
    .map((c) => {
      const cnome = typeof c?.nome === "string" ? c.nome.trim() : "";
      const nota = typeof c?.nota === "string" ? c.nota.trim() : "";
      if (!cnome) return null;
      // a nota é INFERÊNCIA (derivada da busca) — marcada, com a busca como fonte.
      return { nome: cnome, nota: pontoInferencia(nota || "concorrente citado em buscas do setor", fonte, "busca web") };
    })
    .filter((x): x is ConcorrenteProspect => Boolean(x))
    .slice(0, 5);
  return { lista };
}

// ── 3. SINAIS RECENTES (searchWeb — fato com data+fonte) ────────────────────

const SINAIS_SYSTEM =
  "Você extrai SINAIS PÚBLICOS RECENTES de uma empresa a partir de resultados de busca (notícias/imprensa). " +
  "Cada sinal: um título curto do que aconteceu + o tipo (expansão|contratação|produto|rodada|notícia|parceria) + o índice [n] do resultado que o embasa. " +
  "REGRAS: só o que estiver nos resultados; NÃO invente; se a data não estiver clara, deixe null. Máximo 6, mais recentes primeiro. " +
  'Responda SÓ JSON: {"sinais":[{"titulo":"...","tipo":"...","fonte":n,"data":"YYYY-MM-DD"|null}]}';

async function montarSinais(nome: string): Promise<{ lista: SinalProspect[]; obs?: string }> {
  const hits = await searchWeb(`"${nome}" (notícia OR expansão OR contratação OR lançamento OR investimento OR parceria)`, 8);
  if (hits.length === 0) return { lista: [], obs: "sinais recentes: a busca web não trouxe movimentos públicos." };
  const bloco = hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.description ?? ""} (${h.url})`).join("\n");

  let raw = "";
  try {
    raw = await completeViaGateway({
      system: SINAIS_SYSTEM,
      prompt: `EMPRESA: ${nome}\nRESULTADOS:\n${bloco}\n\nQuais sinais públicos recentes, honesto?`,
    });
  } catch {
    return { lista: [], obs: "sinais recentes: análise indisponível nesta geração." };
  }
  const parsed = parseJson<{ sinais?: Array<{ titulo?: unknown; tipo?: unknown; fonte?: unknown; data?: unknown }> }>(raw);
  const lista: SinalProspect[] = (parsed?.sinais ?? [])
    .map((s): SinalProspect | null => {
      const titulo = typeof s?.titulo === "string" ? s.titulo.trim() : "";
      const idx = typeof s?.fonte === "number" ? s.fonte - 1 : -1;
      const hit = hits[idx];
      if (!titulo || !hit) return null; // sem fonte real mapeada → descarta (anti-invenção)
      return {
        titulo,
        tipo: typeof s?.tipo === "string" ? s.tipo.trim() : "notícia",
        data: typeof s?.data === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.data) ? s.data : null,
        fonte_url: hit.url,
        fonte_titulo: hit.title || hostDe(hit.url),
      };
    })
    .filter((x): x is SinalProspect => x !== null)
    .slice(0, 6);
  return { lista };
}

// ── 4. COMO NÓS ENCAIXAMOS (Brain — a oferta lida do Formare) ───────────────

const ENCAIXE_SYSTEM =
  "Você é um estrategista de vendas B2B. Recebe: (A) o PERFIL de uma empresa-alvo (prospect) e (B) a NOSSA OFERTA/ICP/posicionamento (do nosso Brain). " +
  "Tarefa: cruzar os dois e produzir, ANCORADO no que foi dado (nunca genérico, nunca inventado): " +
  "ganchos de conversa (por que falar com eles agora), dores prováveis DELES que a nossa oferta endereça, e um ângulo de abertura (1 frase). " +
  "Se a nossa oferta não tiver relação clara com o alvo, DIGA (ganchos vazios) em vez de forçar. " +
  'Responda SÓ JSON: {"ganchos":["..."],"dores":["..."],"angulo":"..."}';

async function montarEncaixe(
  clientName: string,
  nome: string,
  perfilTxt: string,
  sinaisTxt: string,
): Promise<{ encaixe: EncaixeProspect; obs?: string }> {
  const brain = await fetchClientBrain(clientName);
  const vazio: EncaixeProspect = { brain_mode: brain.mode, ganchos: [], dores: [], angulo: null };
  if (brain.mode === "none") {
    return { encaixe: vazio, obs: "encaixe: sem Brain deste cliente — 'como nós encaixamos' fica em branco (honesto)." };
  }

  let raw = "";
  try {
    raw = await completeViaGateway({
      system: ENCAIXE_SYSTEM,
      prompt: `(A) PERFIL DO ALVO — ${nome}:\n${perfilTxt}\n\nSINAIS RECENTES:\n${sinaisTxt || "(sem sinais)"}\n\n(B) NOSSA OFERTA/ICP (Brain):\n${brain.context}\n\nCruze e responda, ancorado.`,
    });
  } catch {
    return { encaixe: vazio, obs: "encaixe: análise indisponível nesta geração." };
  }
  const parsed = parseJson<{ ganchos?: unknown[]; dores?: unknown[]; angulo?: unknown }>(raw);
  // encaixe é INFERÊNCIA (cruzamento) ancorada no Brain — marcada como tal.
  const nat = (t: string): Ponto => pontoInferencia(t, undefined, brain.mode === "live" ? "cruzamento com o Brain" : "cruzamento (Brain de rascunho)");
  return {
    encaixe: {
      brain_mode: brain.mode,
      ganchos: (parsed?.ganchos ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4).map(nat),
      dores: (parsed?.dores ?? []).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4).map(nat),
      angulo: typeof parsed?.angulo === "string" && parsed.angulo.trim() ? nat(parsed.angulo.trim()) : null,
    },
    obs: brain.mode === "fixture" ? "encaixe: baseado em Brain de RASCUNHO — confirmar no Formare." : undefined,
  };
}

// ── 5. MUNIÇÃO DE REUNIÃO (perguntas + objeções) ────────────────────────────

const MUNICAO_SYSTEM =
  "Você prepara um vendedor para uma reunião. A partir do PERFIL do alvo e do ENCAIXE com a nossa oferta, gere: " +
  "3-5 PERGUNTAS boas de descoberta (abertas, específicas ao contexto do alvo) e 2-3 OBJEÇÕES prováveis com uma resposta curta cada. " +
  "Ancorado no material; nada genérico. " +
  'Responda SÓ JSON: {"perguntas":["..."],"objecoes":[{"objecao":"...","resposta":"..."}]}';

async function montarMunicao(nome: string, perfilTxt: string, encaixeTxt: string): Promise<MunicaoProspect> {
  let raw = "";
  try {
    raw = await completeViaGateway({
      system: MUNICAO_SYSTEM,
      prompt: `ALVO: ${nome}\nPERFIL:\n${perfilTxt}\n\nENCAIXE COM A NOSSA OFERTA:\n${encaixeTxt || "(sem encaixe mapeado)"}\n\nGere a munição, ancorada.`,
    });
  } catch {
    return { perguntas: [], objecoes: [] };
  }
  const parsed = parseJson<{ perguntas?: unknown[]; objecoes?: Array<{ objecao?: unknown; resposta?: unknown }> }>(raw);
  return {
    perguntas: (parsed?.perguntas ?? [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, 5)
      .map((t) => pontoInferencia(t)),
    objecoes: (parsed?.objecoes ?? [])
      .map((o) => ({ objecao: typeof o?.objecao === "string" ? o.objecao.trim() : "", resposta: typeof o?.resposta === "string" ? o.resposta.trim() : "" }))
      .filter((o) => o.objecao && o.resposta)
      .slice(0, 3),
  };
}

// ── resumos textuais (pro cruzamento entre etapas) ──────────────────────────

function perfilParaTexto(p: PerfilProspect): string {
  const linhas = [`Resumo: ${p.resumo.texto}`];
  if (p.tagline?.texto) linhas.push(`Tagline: ${p.tagline.texto}`);
  if (p.produtos.length) linhas.push(`Produtos: ${p.produtos.map((x) => x.texto).join("; ")}`);
  if (p.porte?.texto) linhas.push(`Porte: ${p.porte.texto}`);
  return linhas.join("\n");
}
function encaixeParaTexto(e: EncaixeProspect): string {
  return [
    e.ganchos.length ? `Ganchos: ${e.ganchos.map((g) => g.texto).join("; ")}` : "",
    e.dores.length ? `Dores: ${e.dores.map((d) => d.texto).join("; ")}` : "",
    e.angulo?.texto ? `Ângulo: ${e.angulo.texto}` : "",
  ].filter(Boolean).join("\n");
}

// ── orquestração ────────────────────────────────────────────────────────────

/**
 * Gera o dossiê COMPLETO de um prospect. Uma falha isolada de etapa vira
 * observação (o dossiê sai com o que há) — nunca derruba a geração inteira.
 * Tudo atribuído a `prospect_dossie` (crédito) pelo cliente/entidade.
 */
export async function gerarDossie(p: Prospect): Promise<Dossie> {
  return runWithUsage(
    { clientName: p.clientName, feature: "prospect_dossie", entidadeTipo: "geral", entidadeId: p.id, entidadeNome: p.nome },
    async () => {
      const siteUrl = normalizeSiteUrl(p.siteUrl);
      const siteHost = hostDe(siteUrl);
      const observacoes: string[] = [];

      // 1. Lente 1 (posicionamento + páginas cruas) + 2+3 buscas, em paralelo.
      const [lente1, conc, sin] = await Promise.all([
        runWithUsage({ feature: "lente_1" }, () => runLente1(p.nome, siteUrl)).catch((err) => {
          observacoes.push(`perfil: falha ao ler o site (${(err as Error).message}).`);
          return null;
        }),
        montarConcorrentes(p.nome, siteHost),
        montarSinais(p.nome),
      ]);
      if (conc.obs) observacoes.push(conc.obs);
      if (sin.obs) observacoes.push(sin.obs);
      const sinaisTxt = sin.lista.map((s) => `- ${s.titulo} (${s.tipo}${s.data ? `, ${s.data}` : ""})`).join("\n");

      // 1b. Firmografia + descrição (a faixa de números da capa) — do site + notícias.
      let perfil: PerfilProspect;
      if (lente1) {
        const firmo = await montarFirmografia(p.nome, lente1.pages, sin.lista);
        perfil = montarPerfil(p.nome, lente1.posicionamento, lente1.paginas, firmo);
        if (perfil.paginas_lidas.length === 0) observacoes.push("perfil: não consegui ler o site do prospect (bloqueio/erro).");
      } else {
        perfil = { resumo: pontoNaoEncontrado("não foi possível ler o site do prospect"), produtos: [], paginas_lidas: [], firmografia: [] };
      }
      const perfilTxt = perfilParaTexto(perfil);

      // 4. Encaixe (Brain) — o cruzamento com a nossa oferta.
      const { encaixe, obs: obsEnc } = await montarEncaixe(p.clientName, p.nome, perfilTxt, sinaisTxt);
      if (obsEnc) observacoes.push(obsEnc);

      // 5. Munição — depende de perfil + encaixe.
      const municao = await montarMunicao(p.nome, perfilTxt, encaixeParaTexto(encaixe));

      return {
        prospectId: p.id,
        clientName: p.clientName,
        nome: p.nome,
        siteUrl,
        geradoEm: new Date().toISOString(),
        perfil,
        concorrentes: conc.lista,
        sinais: sin.lista,
        encaixe,
        municao,
        observacoes,
      };
    },
  );
}
