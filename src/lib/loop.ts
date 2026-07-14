/**
 * Loop do Radar — o "rodar agora" ponta-a-ponta, com CACHE DE DIA.
 *
 * Desde a F6 o raciocínio é POR LENTE (analistas por ótica): a watchlist diz o
 * que coletar; cada cliente tem lentes ATIVAS (comercial/produto/marketing,
 * config editável) e cada lente lê os mesmos movimentos pela sua régua ->
 * `LensReading[]`. A visão GERAL (do Rafael) é DERIVADA das leituras: os itens
 * mais fortes across as lentes, deduplicados por movimento.
 *
 * TOLERÂNCIA A FALHA (um bloco com falha não contamina o resto):
 *   - coleta: um concorrente/fonte que falhe é registrado e pulado;
 *   - lentes: uma lente que falhe (gateway) é registrada e pulada — as outras
 *     leituras do cliente seguem valendo.
 *
 * POR QUE O CACHE IMPORTA (custo):
 *   Cada rodada gasta gateway (1 chamada POR LENTE ATIVA por cliente) e
 *   potencialmente Firecrawl. Abrir a página NÃO dispara rodada nova: o
 *   resultado do dia fica em `.cache/loop-<YYYY-MM-DD>.json`. Só `force: true`
 *   (o botão "Rodar agora") re-raciocina — e mesmo assim NÃO re-raspa (o
 *   coletor tem cache diário próprio por URL).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeLens } from "@/lib/analyst-lens";
import { analyzeRelacionamento, sortRelationshipPlays } from "@/lib/analyst-relacionamento";
import { analyzeVendedor } from "@/lib/analyst-vendedor";
import { fetchClientBrain } from "@/lib/brain";
import { collectBlog } from "@/lib/collectors/blog";
import { collectByDiff } from "@/lib/collectors/content-diff";
import { collectMarket } from "@/lib/collectors/market";
import { crossReference, type CrossInsight } from "@/lib/cross-reference";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { persistSignals } from "@/lib/db/repo-signals";
import { currentOrgId } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { loadActiveLensesFor } from "@/lib/lenses";
import { collectLinkedIn } from "@/lib/linkedin";
import { persistSourceRun } from "@/lib/source-status";
import { runWithUsage } from "@/lib/usage/context";
import {
  collectionMethod,
  loadWatchlist,
  pillarOf,
  planCollection,
  type WatchClient,
} from "@/lib/watchlist";
import type {
  IntelligenceItem,
  LensReading,
  RawEvent,
  RelationshipPlay,
  SalesReading,
} from "@/lib/types";

const CACHE_DIR = join(process.cwd(), ".cache");
const DEFAULT_LIMIT = 5;

/** De onde veio o contexto que ancorou os analistas (transparência na UI). */
export type BrainSourceNote = {
  clientName: string;
  /** live = Brain real do Formare; fixture = resumo local; none = sem contexto. */
  mode: "live" | "fixture" | "none";
  /** nº de fatos confirmados usados (só em mode=live). */
  nodeCount?: number;
};

/** Evento cru com o cliente a quem interessa (pro Feed transversal). */
export type ClientEvent = RawEvent & { clientName: string };

export type RadarLoopResult = {
  /** visão GERAL: os itens mais fortes across as lentes (dedupe por sinal). */
  items: IntelligenceItem[];
  /** TODAS as leituras por lente (as visões de time filtram daqui). */
  readings?: LensReading[];
  /** F9: cruzamentos interno×externo (a aba "Interno × Externo"). */
  crossInsights?: CrossInsight[];
  /** 2º template (modo carteira): leituras de venda por hospital (ficha/gatilhos). */
  salesReadings?: SalesReading[];
  /** pilar Clientes: jogadas de relacionamento por conta-chave (a ficha da conta). */
  relationshipPlays?: RelationshipPlay[];
  /** sinais crus coletados (o Feed mostra isto, sem lente). */
  events?: ClientEvent[];
  /** ISO de quando o loop de fato rodou (não muda ao reler do cache). */
  ranAt: string;
  /** por cliente: o contexto veio do Brain real ou de fallback? (honestidade) */
  brainSources?: BrainSourceNote[];
  /** falhas parciais da rodada (coleta/lente), pra UI ser honesta. */
  failures?: string[];
};

export type RunRadarLoopOptions = {
  /** ignora o cache do dia e roda de novo (o botão "Rodar agora"). */
  force?: boolean;
  /** quantos movimentos coletar POR FONTE. Padrão: 5. */
  limit?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama o gateway com RECUO: até 2 tentativas. Se o erro for do DISJUNTOR do
 * gateway (503 "degradado", circuito aberto por uma chamada anterior que
 * estourou 40s), espera ele fechar antes de tentar de novo — insistir na hora
 * só devolve 503. Falha final -> registra e devolve null (não derruba a rodada).
 */
async function withGatewayRetry<T>(
  label: string,
  fn: () => Promise<T>,
  failures: string[],
): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = (err as Error).message;
      console.warn(`[loop] ${label} falhou (tentativa ${attempt}): ${message}`);
      if (attempt === 2) {
        failures.push(`${label}: ${message}`);
        return null;
      }
      // disjuntor aberto precisa de mais tempo pra fechar; timeout comum, menos.
      await sleep(/degradado|503|circuito/i.test(message) ? 20000 : 4000);
    }
  }
  return null;
}

/** Carimbo do dia (YYYY-MM-DD, UTC) — mesma convenção do cache do Firecrawl. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function cachePathForToday(): string {
  return join(CACHE_DIR, `loop-${todayStamp()}.json`);
}

/** Lê o cache do dia (disco); null se não existe, está ilegível ou malformado. */
function readLoopCache(): RadarLoopResult | null {
  const path = cachePathForToday();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RadarLoopResult;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.ranAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLoopCache(result: RadarLoopResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePathForToday(), JSON.stringify(result, null, 2), "utf8");
}

// ─── MULTI-TENANT (item 2 — rework do loop): cache do dia POR ORG. ─────────
// Em modo org o resultado do dia é DADO da org (leituras/eventos dela) e vive
// em org_docs (kind `loop-cache`, key = dia) — sessão E cron enxergam o mesmo
// doc da org do contexto. Em modo clássico, o arquivo em disco de sempre.

const CACHE_KIND = "loop-cache";

async function loadLoopCache(): Promise<RadarLoopResult | null> {
  if (!supabaseEnabled()) return readLoopCache();
  const parsed = await sbGetDoc<RadarLoopResult | null>(CACHE_KIND, todayStamp(), null);
  if (!parsed || !Array.isArray(parsed.items) || typeof parsed.ranAt !== "string") return null;
  return parsed;
}

async function persistLoopCache(result: RadarLoopResult): Promise<void> {
  if (!supabaseEnabled()) return writeLoopCache(result);
  try {
    await sbSetDoc(CACHE_KIND, todayStamp(), result);
  } catch (err) {
    // sem org no contexto (ou falha de rede): a rodada vale, só não fica cacheada.
    console.warn(`[loop] cache do dia não gravado: ${(err as Error).message}`);
  }
}

/**
 * O resultado do dia SÓ SE JÁ EXISTE (cache-only — nunca dispara coleta/LLM).
 * O ritual (digest) usa isto: material pronto entra; ausente é ausente, honesto.
 */
export async function peekLoopResult(): Promise<RadarLoopResult | null> {
  return loadLoopCache();
}

/**
 * Ingestão LinkedIn (extensão "Enviar ao Radar"): a porta é um segredo ÚNICO,
 * então no modo org só a org DESIGNADA (RADAR_INGEST_ORG_ID) lê o arquivo — as
 * demais ficam vazias, honesto. Ingestão por-org (token por org) é passo futuro.
 */
async function linkedInIngestFor(clientName: string): Promise<ReturnType<typeof collectLinkedIn>> {
  if (!supabaseEnabled()) return collectLinkedIn(clientName);
  const designada = process.env.RADAR_INGEST_ORG_ID;
  if (!designada) return { concorrente: [], conta: [] };
  const orgId = await currentOrgId();
  return orgId === designada ? collectLinkedIn(clientName) : { concorrente: [], conta: [] };
}

/** Ordena por impacto (score DESC) sem mutar o array de entrada. */
function byScoreDesc<T extends { score: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.score - a.score);
}

/**
 * VISÃO GERAL derivada das leituras: 1 item por MOVIMENTO (evento), com a
 * leitura da lente mais forte como corpo e as demais lentes como marcação.
 * Função pura — o smoke testa o dedupe direto aqui.
 */
export function buildGeneralItems(readings: LensReading[]): IntelligenceItem[] {
  const byEvent = new Map<string, LensReading[]>();
  for (const reading of readings) {
    const key = `${reading.clientName}:${reading.eventIds[0] ?? reading.id}`;
    const bucket = byEvent.get(key) ?? [];
    bucket.push(reading);
    byEvent.set(key, bucket);
  }

  const items: IntelligenceItem[] = [];
  for (const bucket of byEvent.values()) {
    const best = byScoreDesc(bucket)[0];
    const lentes = [...new Set(bucket.map((r) => r.lens))].sort() as IntelligenceItem["lentes"];
    items.push({
      id: best.id,
      clientName: best.clientName,
      sinal: best.sinal,
      porQueImporta: best.leitura,
      acao: best.acao,
      fonte: best.fonte,
      concorrente: best.concorrente,
      score: best.score,
      eventIds: best.eventIds,
      publishedAt: best.publishedAt,
      collectedAt: best.collectedAt,
      lentes,
      createdAt: best.createdAt,
    });
  }
  return byScoreDesc(items);
}

/**
 * O resultado do dia veio "MORTO": o Radar coletou sinais mas a ANÁLISE inteira
 * falhou (gateway/coleta caíram na rodada que gerou o cache). Distingue:
 *   - dia calmo   → 0 outputs, 0 falhas  → NÃO é morto (vazio legítimo);
 *   - parcial     → algum output + falhas → NÃO é morto (mostra o que tem);
 *   - MORTO       → 0 outputs analíticos E houve falhas → a UI avisa (honesto)
 *                   em vez de renderizar um vazio que parece calmaria.
 * Sem isto, um soluço noturno do gateway "envenena o dia" silenciosamente.
 */
export function analiseFalhou(result: RadarLoopResult): boolean {
  const outputs =
    result.items.length +
    (result.readings?.length ?? 0) +
    (result.salesReadings?.length ?? 0) +
    (result.relationshipPlays?.length ?? 0);
  return outputs === 0 && (result.failures?.length ?? 0) > 0;
}

/** ids das entidades no pilar "conta-chave" de um cliente (partição do loop). */
function contaChaveIds(client: WatchClient | undefined): Set<string> {
  const ids = new Set<string>();
  if (!client) return ids;
  for (const c of client.competitors) {
    if (pillarOf(c, client.mode) === "conta-chave") ids.add(c.id);
  }
  return ids;
}

/**
 * Partição por pilar: separa os eventos de um cliente entre os do pilar
 * Concorrentes (lentes + cruzamento) e os do pilar Clientes (relacionamento).
 * O pilar de um evento vem do `source` (== id da entidade). Só faz sentido em
 * modo concorrentes — no modo carteira todos os subjects vão ao vendedor.
 */
function splitByPillar<T extends { source: string }>(
  events: T[],
  contaIds: Set<string>,
): { concorrenteEvents: T[]; contaEvents: T[] } {
  const concorrenteEvents: T[] = [];
  const contaEvents: T[] = [];
  for (const event of events) {
    if (contaIds.has(event.source)) contaEvents.push(event);
    else concorrenteEvents.push(event);
  }
  return { concorrenteEvents, contaEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// RODADA PARCIAL (F16) — por cliente ou por concorrente, com MERGE no dia.
// Evita rodar TUDO pra ver uma novidade pontual: atualiza só o escopo pedido
// e preserva o resto do resultado do dia.
// ─────────────────────────────────────────────────────────────────────────────

export type RunScope = {
  clientName: string;
  /** limita a UM concorrente do cliente (id da watchlist). */
  competitorId?: string;
};

type ScopeNames = { clientName: string; competitorId?: string; competitorName?: string };

type FreshPatch = {
  events: ClientEvent[];
  readings: LensReading[];
  crossInsights: CrossInsight[];
  /** só no modo carteira — ausente nos patches de concorrente. */
  salesReadings?: SalesReading[];
  /** pilar Clientes — jogadas das contas-chave do escopo. */
  relationshipPlays?: RelationshipPlay[];
  brainSource: BrainSourceNote;
  failures: string[];
};

/**
 * MERGE de uma rodada parcial no resultado do dia (função PURA — o smoke testa
 * direto aqui): troca SÓ os dados do escopo (cliente, e opcionalmente um
 * concorrente dele) pelos frescos; o resto fica intacto. A visão Geral é
 * re-derivada das leituras já mescladas.
 *
 * Honestidade: se a rodada fresca veio VAZIA e sem falhas (ex.: fontes por
 * mudança sem nada novo), NADA é apagado — só o carimbo/brain atualizam.
 */
export function mergeLoopResult(
  base: RadarLoopResult | null,
  scope: ScopeNames,
  fresh: FreshPatch,
): RadarLoopResult {
  const inScopeEvent = (e: ClientEvent): boolean =>
    e.clientName === scope.clientName && (!scope.competitorId || e.source === scope.competitorId);
  const inScopeReading = (r: { clientName: string; concorrente?: string }): boolean =>
    r.clientName === scope.clientName &&
    (!scope.competitorName || r.concorrente === scope.competitorName);
  const inScopeSales = (r: { clientName: string; hospital?: string }): boolean =>
    r.clientName === scope.clientName &&
    (!scope.competitorName || r.hospital === scope.competitorName);
  const inScopePlay = (p: { clientName: string; conta?: string }): boolean =>
    p.clientName === scope.clientName &&
    (!scope.competitorName || p.conta === scope.competitorName);

  const baseEvents = base?.events ?? [];
  const baseReadings = base?.readings ?? [];
  const baseCross = base?.crossInsights ?? [];
  const baseSales = base?.salesReadings ?? [];
  const basePlays = base?.relationshipPlays ?? [];

  const nothingNew =
    fresh.events.length === 0 &&
    fresh.readings.length === 0 &&
    (fresh.salesReadings?.length ?? 0) === 0 &&
    (fresh.relationshipPlays?.length ?? 0) === 0 &&
    fresh.failures.length === 0;

  const events = nothingNew
    ? baseEvents
    : [...baseEvents.filter((e) => !inScopeEvent(e)), ...fresh.events];
  const readings = nothingNew
    ? baseReadings
    : [...baseReadings.filter((r) => !inScopeReading(r)), ...fresh.readings];
  const crossInsights = nothingNew
    ? baseCross
    : [...baseCross.filter((c) => !inScopeReading(c)), ...fresh.crossInsights];
  const salesReadings = nothingNew
    ? baseSales
    : [...baseSales.filter((r) => !inScopeSales(r)), ...(fresh.salesReadings ?? [])];
  const relationshipPlays = nothingNew
    ? basePlays
    : [...basePlays.filter((p) => !inScopePlay(p)), ...(fresh.relationshipPlays ?? [])];

  const brainSources = [
    ...(base?.brainSources ?? []).filter((b) => b.clientName !== scope.clientName),
    fresh.brainSource,
  ];

  return {
    items: buildGeneralItems(readings),
    readings: byScoreDesc(readings),
    crossInsights: byScoreDesc(crossInsights),
    salesReadings: salesReadings.length > 0 ? byScoreDesc(salesReadings) : undefined,
    relationshipPlays:
      relationshipPlays.length > 0 ? sortRelationshipPlays(relationshipPlays) : undefined,
    events,
    ranAt: new Date().toISOString(),
    brainSources,
    failures: fresh.failures.length > 0 ? fresh.failures : undefined,
  };
}

/**
 * Roda SÓ um escopo (cliente, ou um concorrente do cliente) e mescla no dia.
 * Custo: coleta só os alvos do escopo + lentes/cruzamento só sobre os eventos
 * frescos (1 chamada por lente ativa + 1 do cruzamento).
 */
export async function runRadarPartial(scope: RunScope, opts: { limit?: number } = {}): Promise<{
  result: RadarLoopResult;
  summary: {
    eventos: number;
    leituras: number;
    cruzamentos: number;
    jogadas: number;
    falhas: string[];
  };
}> {
  const watchlist = await loadWatchlist();
  const client = watchlist.clients.find((c) => c.name === scope.clientName);
  if (!client) throw new Error(`Cliente não encontrado: ${scope.clientName}`);

  let competitorName: string | undefined;
  if (scope.competitorId) {
    const competitor = client.competitors.find((c) => c.id === scope.competitorId);
    if (!competitor) throw new Error(`Concorrente não encontrado: ${scope.competitorId}`);
    competitorName = competitor.name;
  }

  const targets = planCollection(watchlist).filter(
    (t) =>
      t.clientName === scope.clientName &&
      (!scope.competitorId || t.competitor.id === scope.competitorId),
  );
  if (targets.length === 0) {
    throw new Error(
      "Nada pra coletar nesse escopo — o concorrente está pausado ou sem fontes coletáveis.",
    );
  }

  // 1) COLETA só do escopo (mesma tolerância a falha do loop cheio).
  const failures: string[] = [];
  const freshEvents: ClientEvent[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    try {
      const method = collectionMethod(target.source.kind);
      // medição (item 1): coleta atribuída ao concorrente/fonte do escopo.
      const uctx = { clientName: scope.clientName, feature: "coleta", entidadeTipo: "concorrente" as const, entidadeId: target.competitor.id, entidadeNome: target.competitor.name };
      const events = await runWithUsage(uctx, () =>
        method === "diff"
          ? collectByDiff(target.competitor, target.source)
          : collectBlog(target.competitor, target.source, { limit: opts.limit ?? DEFAULT_LIMIT }),
      );
      await persistSourceRun(target.competitor.id, target.source.id, { eventos: events.length });
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        freshEvents.push({ ...event, clientName: scope.clientName });
      }
    } catch (err) {
      const message = (err as Error).message;
      await persistSourceRun(target.competitor.id, target.source.id, { eventos: 0, erro: message });
      failures.push(`coleta ${target.competitor.name} (${target.source.kind}): ${message}`);
      console.warn(`[loop:parcial] coleta falhou: ${message}`);
    }
  }

  // 2) ANÁLISE só dos eventos frescos (lentes ativas + cruzamento).
  const brain = await fetchClientBrain(scope.clientName);
  const brainSource: BrainSourceNote = {
    clientName: scope.clientName,
    mode: brain.mode,
    nodeCount: brain.mode === "live" ? brain.nodeCount : undefined,
  };

  const mode = client.mode ?? "concorrentes";
  const readings: LensReading[] = [];
  const crossInsights: CrossInsight[] = [];
  const salesReadings: SalesReading[] = [];
  const relationshipPlays: RelationshipPlay[] = [];
  if (freshEvents.length > 0) {
    if (mode === "carteira") {
      // modo carteira: a lente "vendedor" casa sinal→linha→gatilho; sem lentes nem cruzamento.
      const sales = await withGatewayRetry(
        `vendedor (${scope.clientName})`,
        () => runWithUsage({ clientName: scope.clientName, feature: "briefing", etapa: "vendedor" }, () => analyzeVendedor(freshEvents, scope.clientName, brain.context)),
        failures,
      );
      if (sales) salesReadings.push(...sales);
    } else {
      // partição por pilar: concorrentes (lentes + cruzamento) × contas-chave (relacionamento).
      const contaIds = contaChaveIds(client);
      const { concorrenteEvents, contaEvents } = splitByPillar(freshEvents, contaIds);

      // LinkedIn ingerido — só na rodada do CLIENTE inteiro (não numa fonte/entidade só).
      if (!scope.competitorId) {
        const li = await linkedInIngestFor(scope.clientName);
        const stamp = (e: RawEvent): ClientEvent => ({ ...e, clientName: scope.clientName });
        concorrenteEvents.push(...li.concorrente.map(stamp));
        contaEvents.push(...li.conta.map(stamp));
        // também no Feed (sinais crus) — via freshEvents, que a mescla usa como `events`.
        freshEvents.push(...li.concorrente.map(stamp), ...li.conta.map(stamp));
      }

      if (concorrenteEvents.length > 0) {
        for (const lens of await loadActiveLensesFor(scope.clientName)) {
          const out = await withGatewayRetry(
            `lente ${lens.id} (${scope.clientName})`,
            () => runWithUsage({ clientName: scope.clientName, feature: "briefing", etapa: lens.id }, () => analyzeLens(lens, concorrenteEvents, scope.clientName, brain.context)),
            failures,
          );
          if (out) readings.push(...out);
        }
        const cross = await withGatewayRetry(
          `cruzamento (${scope.clientName})`,
          () => runWithUsage({ clientName: scope.clientName, feature: "correlacao" }, () => crossReference(concorrenteEvents, scope.clientName, brain.context)),
          failures,
        );
        if (cross) crossInsights.push(...cross);
      }
      if (contaEvents.length > 0) {
        // F2 — contexto de concorrente pra urgência: os frescos deste escopo +
        // os movimentos de concorrente já coletados hoje (cache), deduplicados.
        // Assim "Rodar" só a conta ainda enxerga o que os concorrentes fizeram.
        const cachedComp = ((await loadLoopCache())?.events ?? []).filter(
          (e) => e.clientName === scope.clientName && !contaIds.has(e.source),
        );
        const seen = new Set<string>();
        const competitorContext: ClientEvent[] = [];
        for (const e of [...concorrenteEvents, ...cachedComp]) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          competitorContext.push(e);
        }
        const marketEvents = client.market?.length
          ? await runWithUsage({ clientName: scope.clientName, feature: "coleta", entidadeTipo: "geral" }, () => collectMarket(scope.clientName, client.market!))
          : [];
        const plays = await withGatewayRetry(
          `relacionamento (${scope.clientName})`,
          () =>
            runWithUsage({ clientName: scope.clientName, feature: "briefing", etapa: "relacionamento" }, () =>
              analyzeRelacionamento(
                contaEvents,
                scope.clientName,
                brain.context,
                competitorContext,
                marketEvents,
              )),
          failures,
        );
        if (plays) relationshipPlays.push(...plays);
      }
    }
  }

  // 3) SINAIS duráveis (modo org) + MERGE no resultado do dia e persiste.
  if (supabaseEnabled()) {
    const sigFail = await persistSignals(freshEvents);
    if (sigFail) failures.push(sigFail);
  }
  const merged = mergeLoopResult(
    await loadLoopCache(),
    { clientName: scope.clientName, competitorId: scope.competitorId, competitorName },
    { events: freshEvents, readings, crossInsights, salesReadings, relationshipPlays, brainSource, failures },
  );
  await persistLoopCache(merged);

  return {
    result: merged,
    summary: {
      eventos: freshEvents.length,
      leituras: readings.length,
      cruzamentos: crossInsights.length,
      jogadas: relationshipPlays.length,
      falhas: failures,
    },
  };
}

/**
 * Roda o loop do Radar: coleta pela watchlist, lê com as lentes ativas de
 * cada cliente, deriva a visão geral. Reusa o resultado do dia (a menos que
 * `force`).
 */
export async function runRadarLoop(
  opts: RunRadarLoopOptions = {},
): Promise<RadarLoopResult> {
  const force = opts.force ?? false;

  if (!force) {
    const cached = await loadLoopCache();
    if (cached) {
      // preserva TUDO do cache (readings/events/brainSources), só reordenando.
      return { ...cached, items: byScoreDesc(cached.items) };
    }
  }

  const watchlist = await loadWatchlist();
  const targets = planCollection(watchlist);

  // 1) COLETA por (cliente, concorrente, fonte), tolerando falha individual.
  const eventsByClient = new Map<string, RawEvent[]>();
  const failures: string[] = [];
  let collectedTotal = 0;

  for (const target of targets) {
    try {
      // despacha por método: listagem (blog/notícias) ou mudança (produto/vagas).
      const method = collectionMethod(target.source.kind);
      // medição (item 1): coleta atribuída ao concorrente/fonte.
      const uctx = { clientName: target.clientName, feature: "coleta", entidadeTipo: "concorrente" as const, entidadeId: target.competitor.id, entidadeNome: target.competitor.name };
      const events = await runWithUsage(uctx, () =>
        method === "diff"
          ? collectByDiff(target.competitor, target.source)
          : collectBlog(target.competitor, target.source, { limit: opts.limit ?? DEFAULT_LIMIT }),
      );
      await persistSourceRun(target.competitor.id, target.source.id, { eventos: events.length });
      const bucket = eventsByClient.get(target.clientName) ?? [];
      const seen = new Set(bucket.map((e) => e.id));
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        bucket.push(event);
        collectedTotal++;
      }
      eventsByClient.set(target.clientName, bucket);
    } catch (err) {
      const message = (err as Error).message;
      await persistSourceRun(target.competitor.id, target.source.id, { eventos: 0, erro: message });
      failures.push(`coleta ${target.competitor.name} (${target.source.kind}): ${message}`);
      console.warn(
        `[loop] coleta de ${target.competitor.name}/${target.source.kind} falhou: ${message}`,
      );
    }
  }

  if (collectedTotal === 0 && failures.length > 0) {
    throw new Error(`Nenhuma coleta funcionou — ${failures.join(" | ")}`);
  }

  // 2) LENTES + CRUZAMENTO: cada lente ativa lê os movimentos pela sua régua;
  //    o cruzamento interno×externo roda uma vez por cliente.
  const readings: LensReading[] = [];
  const crossInsights: CrossInsight[] = [];
  const salesReadings: SalesReading[] = [];
  const relationshipPlays: RelationshipPlay[] = [];
  const brainSources: BrainSourceNote[] = [];
  const allEvents: ClientEvent[] = [];

  for (const [clientName, events] of eventsByClient) {
    if (events.length === 0) continue;
    allEvents.push(...events.map((e) => ({ ...e, clientName })));

    const brain = await fetchClientBrain(clientName);
    brainSources.push({
      clientName,
      mode: brain.mode,
      nodeCount: brain.mode === "live" ? brain.nodeCount : undefined,
    });

    const client = watchlist.clients.find((c) => c.name === clientName);
    const clientMode = client?.mode ?? "concorrentes";
    if (clientMode === "carteira") {
      // modo carteira (2º template): a lente "vendedor" casa sinal→linha→gatilho;
      // sem as 3 lentes de concorrente nem o cruzamento interno×externo.
      const sales = await withGatewayRetry(
        `vendedor (${clientName})`,
        () => runWithUsage({ clientName, feature: "briefing", etapa: "vendedor" }, () => analyzeVendedor(events, clientName, brain.context)),
        failures,
      );
      if (sales) salesReadings.push(...sales);
      continue;
    }

    // Partição por pilar: concorrentes (lentes + cruzamento) × contas-chave (relacionamento).
    const { concorrenteEvents, contaEvents } = splitByPillar(events, contaChaveIds(client));

    // LinkedIn ingerido (captura assistida) entra pelos DOIS pilares, por papel.
    const li = await linkedInIngestFor(clientName);
    concorrenteEvents.push(...li.concorrente);
    contaEvents.push(...li.conta);
    // e no FEED (sinais crus) — pra TUDO que foi enviado ficar visível, mesmo
    // que o analista não o eleja como insight forte.
    allEvents.push(
      ...li.concorrente.map((e) => ({ ...e, clientName })),
      ...li.conta.map((e) => ({ ...e, clientName })),
    );

    if (concorrenteEvents.length > 0) {
      for (const lens of await loadActiveLensesFor(clientName)) {
        const out = await withGatewayRetry(
          `lente ${lens.id} (${clientName})`,
          () => runWithUsage({ clientName, feature: "briefing", etapa: lens.id }, () => analyzeLens(lens, concorrenteEvents, clientName, brain.context)),
          failures,
        );
        if (out) readings.push(...out);
      }

      // Cruzamento interno×externo (mesma disciplina de recuo).
      const cross = await withGatewayRetry(
        `cruzamento (${clientName})`,
        () => runWithUsage({ clientName, feature: "correlacao" }, () => crossReference(concorrenteEvents, clientName, brain.context)),
        failures,
      );
      if (cross) crossInsights.push(...cross);
    }

    // Pilar Clientes: as contas-chave vão ao analista de relacionamento, que
    // cruza o gatilho da conta com a oferta (Brain) + os movimentos de
    // concorrente (F2 — urgência) + os sinais de mercado (F4 — reforço).
    if (contaEvents.length > 0) {
      const marketEvents = client?.market?.length
        ? await runWithUsage({ clientName, feature: "coleta", entidadeTipo: "geral" }, () => collectMarket(clientName, client.market!))
        : [];
      const plays = await withGatewayRetry(
        `relacionamento (${clientName})`,
        () =>
          runWithUsage({ clientName, feature: "briefing", etapa: "relacionamento" }, () =>
            analyzeRelacionamento(contaEvents, clientName, brain.context, concorrenteEvents, marketEvents)),
        failures,
      );
      if (plays) relationshipPlays.push(...plays);
    }
  }

  // SINAIS duráveis por org (modo org): a história crua vai pra tabela signals.
  if (supabaseEnabled()) {
    const sigFail = await persistSignals(allEvents);
    if (sigFail) failures.push(sigFail);
  }

  const result: RadarLoopResult = {
    items: buildGeneralItems(readings),
    readings: byScoreDesc(readings),
    crossInsights: byScoreDesc(crossInsights),
    salesReadings: salesReadings.length > 0 ? byScoreDesc(salesReadings) : undefined,
    relationshipPlays:
      relationshipPlays.length > 0 ? sortRelationshipPlays(relationshipPlays) : undefined,
    events: allEvents,
    ranAt: new Date().toISOString(),
    brainSources,
    failures: failures.length > 0 ? failures : undefined,
  };

  await persistLoopCache(result);
  return result;
}
