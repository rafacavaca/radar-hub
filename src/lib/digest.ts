/**
 * DIGEST MATINAL (ritual diário, F1) — "o que aconteceu e o que merece tua
 * atenção hoje", por org, montado DETERMINISTICAMENTE do material que o Radar
 * já raciocinou (código > LLM: zero chamada de IA aqui).
 *
 * O que entra (tudo com fonte + data, fato × leitura distinguidos na origem):
 *  - leituras FORTES das lentes (score ≥ CORTE) do resultado do dia;
 *  - gatilhos de venda (carteira) e jogadas de relacionamento (contas-chave);
 *  - alertas de diagnóstico NÃO VISTOS (movimentos que casaram regra ATIVA —
 *    movimento sem regra não vira urgência: a régua é do usuário);
 *  - relatórios agendados que saíram nas últimas 24h;
 *  - os ADIADOS de ontem (voltam, íntegros, do snapshot).
 *
 * HONESTIDADE: "dia tranquilo" é resposta VÁLIDA (zero itens = zero itens);
 * falhas de coleta e cortes de tamanho viram OBSERVAÇÕES visíveis — nunca
 * fabricar urgência, nunca esconder truncamento.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadEstados, type EstadosFile } from "@/lib/briefing-estado";
import { loadDisparos } from "@/lib/diagnostico/alertas-store";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { peekLoopResult, runRadarLoop, type RadarLoopResult } from "@/lib/loop";
import { loadReports, type Report } from "@/lib/reports";
import { localDayKey } from "@/lib/schedules";
import { loadWatchlist } from "@/lib/watchlist";
import type { AlertaDisparo } from "@/lib/diagnostico/schema";

/** Corte de relevância das leituras/jogadas (a régua das lentes já filtrou; isto separa o "forte"). */
const CORTE_SCORE = 60;
/** Itens por cliente no digest — o excedente vira observação (nunca corte silencioso). */
const MAX_POR_CLIENTE = 6;
/** Dias de digest guardados no modo clássico (o org_docs guarda 1 doc por dia). */
const MAX_DIAS_JSON = 30;

export type DigestItemKind = "leitura" | "gatilho" | "jogada" | "alerta" | "relatorio";

export type DigestItem = {
  /** id ESTÁVEL (deriva do item de origem) — o estado do briefing aponta pra ele. */
  id: string;
  kind: DigestItemKind;
  clientName: string;
  /** o que aconteceu (1 frase, fato). */
  titulo: string;
  /** a leitura/o significado (opinião rotulada pela origem). */
  detalhe: string;
  /** ação recomendada, quando a origem traz. */
  acao?: string;
  /** de onde veio o raciocínio: "Lente comercial", "Alerta: Tagline", … */
  origem: string;
  fonte?: { url: string; titulo?: string };
  /** data de publicação/detecção (ISO) — datas são cidadãs de 1ª classe. */
  data?: string;
  score: number;
  /** chave do SINAL de origem (mesmo evento) — agrupa leituras de lentes distintas. */
  sinalKey?: string;
  /** a lente que produziu (só em kind=leitura) — rótulo curto + tooltip. */
  lens?: "comercial" | "produto" | "marketing";
};

export type Digest = {
  /** dia local (YYYY-MM-DD, fuso Brasil). */
  day: string;
  geradoEm: string;
  /** itens do dia, por ordem de relevância (após estados do briefing). */
  itens: DigestItem[];
  /** os adiados de ontem que voltaram (do snapshot do estado). */
  adiados: DigestItem[];
  /** zero itens e zero adiados — resposta válida, nunca urgência fabricada. */
  tranquilo: boolean;
  /** transparência: falhas de coleta, cortes de tamanho, material ausente. */
  observacoes: string[];
  /** clientes cobertos (a base do digest). */
  clientes: string[];
};

// ── material (org-scoped via dispatchers; NUNCA dispara coleta/LLM) ─────────

export type DigestMaterial = {
  clientes: string[];
  loop: RadarLoopResult | null;
  disparos: AlertaDisparo[];
  /** relatórios agendados criados nas últimas 24h. */
  relatoriosNovos: Report[];
};

/** Junta o material do dia da org do contexto. Cache-only — barato e honesto. */
export async function coletarMaterial(now: Date): Promise<DigestMaterial> {
  const watchlist = await loadWatchlist();
  const clientes = watchlist.clients.map((c) => c.name);
  const loop = await peekLoopResult();
  const disparos = (await Promise.all(clientes.map((c) => loadDisparos(c)))).flat();
  const desde = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const relatoriosNovos = (await loadReports()).filter((r) => r.kind === "agendado" && r.createdAt >= desde);
  return { clientes, loop, disparos, relatoriosNovos };
}

// ── montagem (PURA — o smoke testa direto aqui) ─────────────────────────────

const REGRA_LABEL: Record<string, string> = {
  tagline_mudou: "Tagline mudou",
  produto_novo: "Produto novo",
  anuncios_variacao: "Anúncios variaram",
  canal_novo: "Canal novo",
  cliente_novo: "Cliente novo",
  preco_mudou: "Preço mudou",
  nota_caiu: "Nota caiu",
  vagas_variacao: "Vagas variaram",
  release_novo: "Release novo",
};

function candidatos(material: DigestMaterial): DigestItem[] {
  const out: DigestItem[] = [];
  const loop = material.loop;

  for (const r of loop?.readings ?? []) {
    if (r.score < CORTE_SCORE) continue;
    out.push({
      id: `lr:${r.id}`,
      kind: "leitura",
      clientName: r.clientName,
      titulo: r.sinal,
      detalhe: r.leitura,
      acao: r.acao,
      origem: `Lente ${r.lens}`,
      lens: r.lens,
      // MESMA chave para as lentes do MESMO evento → agrupam sob uma manchete.
      sinalKey: `${r.clientName}::${r.eventIds?.[0] ?? r.id}`,
      fonte: r.fonte,
      data: r.publishedAt ?? r.collectedAt ?? r.createdAt,
      score: r.score,
    });
  }

  for (const s of loop?.salesReadings ?? []) {
    if (s.score < CORTE_SCORE) continue;
    out.push({
      id: `sr:${s.id}`,
      kind: "gatilho",
      clientName: s.clientName,
      titulo: `${s.hospital}: ${s.sinal}`,
      detalhe: s.gatilho,
      acao: s.angulo,
      origem: `Gatilho de venda · linha ${s.linha}`,
      sinalKey: `sr:${s.eventIds?.[0] ?? s.id}`,
      fonte: s.fonte,
      data: s.publishedAt ?? s.collectedAt ?? s.createdAt,
      score: s.score,
    });
  }

  for (const p of loop?.relationshipPlays ?? []) {
    if (p.score < CORTE_SCORE) continue;
    out.push({
      id: `rp:${p.id}`,
      kind: "jogada",
      clientName: p.clientName,
      titulo: `${p.conta}: ${p.sinal}`,
      detalhe: `${p.gatilho} — encaixe ${p.encaixe}: ${p.justificativa}`,
      acao: p.acao,
      origem: `Relacionamento · ${p.conta}`,
      sinalKey: `rp:${p.eventIds?.[0] ?? p.id}`,
      fonte: p.fonte,
      data: p.publishedAt ?? p.createdAt,
      score: p.score,
    });
  }

  for (const d of material.disparos) {
    if (d.visto) continue; // inbox de alertas: o já visto não volta a cobrar atenção
    const m = d.movimento;
    const dePara = m.de !== null || m.para !== null ? ` (${m.de ?? "—"} → ${m.para ?? "—"})` : "";
    out.push({
      id: `al:${d.id}`,
      kind: "alerta",
      clientName: d.clientName,
      titulo: `${d.concorrente_nome}: ${m.campo_label}${dePara}`,
      detalhe: `Movimento detectado na varredura — regra "${REGRA_LABEL[d.regra] ?? d.regra}".`,
      origem: `Alerta de diagnóstico`,
      sinalKey: `al:${d.id}`,
      fonte: m.fonte_url_para ? { url: m.fonte_url_para } : m.fonte_url_de ? { url: m.fonte_url_de } : undefined,
      data: m.data_deteccao,
      score: m.severidade === "alta" ? 80 : m.severidade === "média" ? 65 : 50,
    });
  }

  for (const r of material.relatoriosNovos) {
    out.push({
      id: `rep:${r.id}`,
      kind: "relatorio",
      clientName: r.clientName,
      titulo: `Relatório agendado: ${r.titulo}`,
      detalhe: r.origem ? `Pedido recorrente: "${r.origem}"` : "Saiu do agendamento.",
      acao: "Ler em Relatórios.",
      origem: "Relatório agendado",
      sinalKey: `rep:${r.id}`,
      data: r.createdAt,
      score: 55,
    });
  }

  return out;
}

// ── AGRUPAMENTO POR SINAL (F1.7) — o mesmo evento lido por várias lentes vira
//    UMA manchete com as leituras aninhadas. Puro; a tela consome. ───────────

export type DigestGroup = {
  /** chave estável do grupo (sinalKey ou id quando não há chave). */
  key: string;
  /** o item "cabeça" (o de maior score) — dá manchete, fonte, data, cliente. */
  head: DigestItem;
  /** todos os itens do sinal (1 quando não agrupa), mais forte primeiro. */
  itens: DigestItem[];
  /** score do grupo = o do item mais forte. */
  score: number;
};

/**
 * Agrupa itens pelo SINAL de origem (sinalKey), preservando a ordem por
 * relevância. Itens sem sinalKey (digests antigos) caem em grupos unitários.
 */
export function agruparPorSinal(itens: DigestItem[]): DigestGroup[] {
  const grupos = new Map<string, DigestItem[]>();
  const ordem: string[] = [];
  for (const item of itens) {
    const key = item.sinalKey ?? item.id;
    if (!grupos.has(key)) {
      grupos.set(key, []);
      ordem.push(key);
    }
    grupos.get(key)!.push(item);
  }
  return ordem
    .map((key) => {
      const lista = [...grupos.get(key)!].sort((a, b) => b.score - a.score);
      return { key, head: lista[0], itens: lista, score: lista[0].score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Monta o digest do dia (PURO): candidatos − estados (atuado/ignorado somem;
 * adiado só volta no vencimento) + adiados vencidos (do snapshot), com cap por
 * cliente virando observação. `tranquilo` = nada pra ti hoje, e está tudo bem.
 */
export function buildDigest(
  material: DigestMaterial,
  estados: EstadosFile,
  now: Date,
): Digest {
  const day = localDayKey(now);
  const observacoes: string[] = [];

  // adiados que VENCERAM voltam (do snapshot); os demais continuam guardados.
  const adiados: DigestItem[] = [];
  for (const [, reg] of Object.entries(estados)) {
    if (reg.estado !== "adiado" || !reg.item) continue;
    if ((reg.ate ?? "") <= day) adiados.push(reg.item);
  }
  adiados.sort((a, b) => b.score - a.score);

  // itens do dia: fora os processados (qualquer estado marcado sai da lista
  // do dia — o adiado reaparece pela seção própria quando vence).
  const doDia = candidatos(material).filter((c) => !estados[c.id]);

  // cap por cliente com transparência (nunca corte silencioso).
  const porCliente = new Map<string, DigestItem[]>();
  for (const item of doDia) {
    porCliente.set(item.clientName, [...(porCliente.get(item.clientName) ?? []), item]);
  }
  const itens: DigestItem[] = [];
  for (const [cliente, lista] of porCliente) {
    lista.sort((a, b) => b.score - a.score);
    itens.push(...lista.slice(0, MAX_POR_CLIENTE));
    if (lista.length > MAX_POR_CLIENTE) {
      observacoes.push(`${cliente}: +${lista.length - MAX_POR_CLIENTE} item(ns) além do corte do digest — ver no painel.`);
    }
  }
  itens.sort((a, b) => b.score - a.score);

  // honestidade sobre a base: material ausente e falhas de coleta são visíveis.
  if (!material.loop) {
    observacoes.push("O material do dia ainda não foi coletado (o loop não rodou) — o digest cobre alertas, relatórios e adiados.");
  }
  for (const f of material.loop?.failures ?? []) observacoes.push(`Falha de coleta: ${f}`);

  return {
    day,
    geradoEm: now.toISOString(),
    itens,
    adiados,
    tranquilo: itens.length === 0 && adiados.length === 0,
    observacoes,
    clientes: material.clientes,
  };
}

// ── persistência (1 doc por dia; org_docs ou JSON) ──────────────────────────

const DOC_KIND = "digest";

type DigestsFile = { digests: Record<string, Digest> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "digests.json");
}
function readFileSafe(): DigestsFile {
  const path = filePath();
  if (!existsSync(path)) return { digests: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DigestsFile;
    return parsed?.digests && typeof parsed.digests === "object" ? parsed : { digests: {} };
  } catch {
    return { digests: {} };
  }
}
function writeFileSafe(file: DigestsFile): void {
  const days = Object.keys(file.digests).sort().slice(-MAX_DIAS_JSON);
  const capped: DigestsFile = { digests: Object.fromEntries(days.map((d) => [d, file.digests[d]])) };
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(capped, null, 2), "utf8");
  renameSync(tmp, path);
}

/** O digest salvo de um dia, na org do contexto (ou JSON). */
export async function loadDigest(day: string): Promise<Digest | null> {
  if (!supabaseEnabled()) return readFileSafe().digests[day] ?? null;
  return sbGetDoc<Digest | null>(DOC_KIND, day, null);
}

async function persistDigest(digest: Digest): Promise<Digest> {
  if (!supabaseEnabled()) {
    const file = readFileSafe();
    file.digests[digest.day] = digest;
    writeFileSafe(file);
    return digest;
  }
  await sbSetDoc(DOC_KIND, digest.day, digest);
  return digest;
}

/**
 * O digest de HOJE: devolve o salvo, ou gera (material + estados) e salva.
 * `force` re-gera (o botão "Atualizar" da tela Hoje). Idempotente por dia.
 */
export async function ensureDigest(now: Date, opts: { force?: boolean } = {}): Promise<Digest> {
  const day = localDayKey(now);
  if (!opts.force) {
    const salvo = await loadDigest(day);
    if (salvo) return salvo;
  }
  const [material, estados] = await Promise.all([coletarMaterial(now), loadEstados()]);
  return persistDigest(buildDigest(material, estados, now));
}

/** Hora local no fuso do Brasil (0-23). */
function localHourBrasil(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
}

export type DigestMatinalResult = { acao: "cedo" | "ja-existia" | "gerado"; digest?: Digest };

/**
 * O passo MATINAL do cron (por org): a partir das 6h locais, 1x por dia,
 * GARANTE o material (roda o loop — cacheado; é o "Radar trabalha de
 * madrugada") e gera o digest. Falha do loop não bloqueia: o digest sai do que
 * há (alertas/relatórios/adiados) com a ausência declarada nas observações.
 */
export async function ensureDigestMatinal(now: Date): Promise<DigestMatinalResult> {
  if (localHourBrasil(now) < 6) return { acao: "cedo" };
  const existente = await loadDigest(localDayKey(now));
  if (existente) return { acao: "ja-existia", digest: existente };
  try {
    await runRadarLoop();
  } catch (err) {
    console.warn(`[digest] loop indisponível na geração matinal: ${(err as Error).message} — digest segue do material que há.`);
  }
  return { acao: "gerado", digest: await ensureDigest(now) };
}
