/**
 * LENTE 3 — MÍDIA PAGA (F2). Está anunciando? quantos anúncios ativos? que
 * mensagens? há quanto tempo?
 *
 * DOIS CAMINHOS:
 *  1. COM `META_AD_LIBRARY_TOKEN` → **API oficial** (Meta Ad Library API):
 *     dado estruturado, contagem real, textos de criativo, data de início —
 *     tudo citável (fonte pública clicável). LinkedIn continua best-effort
 *     (não tem API pública).
 *  2. SEM token → scrape best-effort das bibliotecas (comportamento antigo).
 *     Na prática quase sempre `nao_localizado` — as bibliotecas são apps JS
 *     pesados/anti-bot.
 *
 * HONESTIDADE: nunca inventa número; 0 anúncios no arquivo vem com nota de
 * ESCOPO (o arquivo não cobre toda campanha comercial do mundo — ausência não
 * é prova absoluta de "não anuncia"). Erro de token/permissão vira observacao
 * legível, nunca dado falso.
 */

import { scrape } from "@/lib/firecrawl";
import { completeViaGateway } from "@/lib/gateway";
import { metaAdsAvailable, searchMetaAds } from "@/lib/meta-ads";
import { midiaNaoLocalizada, type MidiaPaga, type MidiaPlataforma } from "@/lib/diagnostico/schema";

const MSG_CHARS = 200;

/** Google: sem API pública utilizável (Transparency Center é JS-pesado). */
function googlePendente(now: string): MidiaPlataforma {
  return {
    ...midiaNaoLocalizada(now),
    observacao: "Centro de Transparência do Google sem API pública — fora do alcance por ora.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 1 — Meta via API OFICIAL
// ─────────────────────────────────────────────────────────────────────────────

const ESCOPO_ARQUIVO =
  "0 anúncios ativos no arquivo público da Meta (API oficial). Atenção ao escopo: o arquivo cobre com garantia anúncios entregues na UE (todos os tipos) e políticos no resto do mundo — campanha comercial fora disso pode não aparecer.";

async function metaViaApi(name: string, now: string): Promise<MidiaPlataforma> {
  const r = await searchMetaAds(name, { activeOnly: true });

  if (!r.ok) {
    return {
      ...midiaNaoLocalizada(now),
      fonte_url: r.publicUrl,
      observacao: `API oficial indisponível: ${r.error}`,
    };
  }

  if (r.ads.length === 0) {
    return {
      anuncia: false,
      n_anuncios_ativos: 0,
      mensagens: [],
      fonte_url: r.publicUrl,
      data_coleta: now,
      status: "encontrado",
      observacao: ESCOPO_ARQUIVO,
    };
  }

  // mensagens: textos de criativo distintos, curtos, no máx. 3
  const vistos = new Set<string>();
  const mensagens: string[] = [];
  for (const ad of r.ads) {
    for (const body of ad.bodies) {
      const m = body.trim().slice(0, MSG_CHARS);
      const key = m.toLowerCase();
      if (!m || vistos.has(key)) continue;
      vistos.add(key);
      mensagens.push(m);
      if (mensagens.length >= 3) break;
    }
    if (mensagens.length >= 3) break;
  }

  // desde quando: menor data de início entre os ativos (fato da própria Meta)
  const inicios = r.ads.map((a) => a.startedAt).filter((d): d is string => Boolean(d)).sort();
  const partes = [
    "via API oficial (arquivo público da Meta)",
    r.pages.length ? `página(s): ${r.pages.slice(0, 3).join(", ")}` : null,
    inicios[0] ? `campanha mais antiga no ar desde ${inicios[0].slice(0, 10)}` : null,
    r.hasMore ? "contagem é piso (1ª página do arquivo — pode haver mais)" : null,
  ].filter(Boolean);

  return {
    anuncia: true,
    n_anuncios_ativos: r.ads.length,
    mensagens,
    fonte_url: r.publicUrl,
    data_coleta: now,
    status: "encontrado",
    observacao: partes.join(" · "),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 2 — scrape best-effort (sem token) + LinkedIn (sempre scrape)
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeLibrary(url: string): Promise<string> {
  try {
    const s = await scrape(url, { waitFor: 6000, onlyMainContent: false });
    return s.markdown.slice(0, 4000);
  } catch {
    return "";
  }
}

const HONESTIDADE =
  "REGRAS DE HONESTIDADE (invioláveis): (1) se a página veio VAZIA, pediu login, foi bloqueada, ou NÃO mostra anúncios de forma clara, use anuncia:null (não sei) — NUNCA invente número; " +
  "(2) só use anuncia:false se a página DIZ explicitamente que não há anúncios; (3) n_anuncios_ativos = número só se estiver EXPLÍCITO na página; senão null; " +
  "(4) mensagens = até 3 exemplos de texto de anúncio REALMENTE presentes; senão [].";

const SYSTEM_AMBAS =
  "Você lê o conteúdo (markdown) de páginas de BIBLIOTECA DE ANÚNCIOS públicas (Meta Ad Library, LinkedIn Ad Library) de UM anunciante e extrai, por plataforma, o estado da mídia paga. " +
  HONESTIDADE +
  ' Responda SÓ JSON: {"meta":{"anuncia":true|false|null,"n_anuncios_ativos":0|null,"mensagens":[]},"linkedin":{"anuncia":null,"n_anuncios_ativos":null,"mensagens":[]}}.';

const SYSTEM_LINKEDIN =
  "Você lê o conteúdo (markdown) da LINKEDIN AD LIBRARY (biblioteca pública de anúncios) de UM anunciante e extrai o estado da mídia paga. " +
  HONESTIDADE +
  ' Responda SÓ JSON: {"linkedin":{"anuncia":true|false|null,"n_anuncios_ativos":0|null,"mensagens":[]}}.';

type RawPlat = { anuncia?: unknown; n_anuncios_ativos?: unknown; mensagens?: unknown };

function toPlataforma(raw: RawPlat | undefined, url: string, now: string): MidiaPlataforma {
  const anuncia = raw?.anuncia === true ? true : raw?.anuncia === false ? false : null;
  const nRaw = Number(raw?.n_anuncios_ativos);
  const n = Number.isInteger(nRaw) && nRaw >= 0 ? nRaw : null;
  const mensagens = Array.isArray(raw?.mensagens)
    ? raw!.mensagens.filter((m): m is string => typeof m === "string").map((m) => m.trim()).filter(Boolean).slice(0, 3)
    : [];
  // honesto: só é "encontrado" se soubermos SE anuncia (true/false) ou virmos
  // mensagens reais. Só um número solto (sem 'anuncia') é ambíguo -> não localizado.
  const meaningful = anuncia !== null || mensagens.length > 0;
  if (!meaningful) return { ...midiaNaoLocalizada(now), fonte_url: url };
  return { anuncia, n_anuncios_ativos: n, mensagens, fonte_url: url, data_coleta: now, status: "encontrado" };
}

function linkedInLibraryUrl(name: string): string {
  return `https://www.linkedin.com/ad-library/search?keyword=${encodeURIComponent(name)}`;
}

/** LinkedIn não tem API pública — segue scrape best-effort, honesto no vazio. */
async function linkedinViaScrape(name: string, now: string): Promise<MidiaPlataforma> {
  const liUrl = linkedInLibraryUrl(name);
  const liMd = await scrapeLibrary(liUrl);
  if (!liMd) {
    return {
      ...midiaNaoLocalizada(now),
      fonte_url: liUrl,
      observacao: "biblioteca do LinkedIn não expôs dados (sem API pública) — best-effort.",
    };
  }
  let parsed: { linkedin?: RawPlat } = {};
  try {
    const content = await completeViaGateway({
      system: SYSTEM_LINKEDIN,
      prompt: `ANUNCIANTE: ${name}\n\n[LINKEDIN AD LIBRARY] ${liUrl}\n${liMd}\n\nExtraia o estado da mídia paga, honesto.`,
    });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    parsed = {};
  }
  return toPlataforma(parsed.linkedin, liUrl, now);
}

/** Caminho antigo (sem token): scrape das duas bibliotecas + 1 LLM parse. */
async function lente3ViaScrape(name: string, now: string): Promise<MidiaPaga> {
  const q = encodeURIComponent(name);
  const metaUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered`;
  const liUrl = linkedInLibraryUrl(name);

  const [metaMd, liMd] = await Promise.all([scrapeLibrary(metaUrl), scrapeLibrary(liUrl)]);
  if (!metaMd && !liMd) {
    return {
      meta: { ...midiaNaoLocalizada(now), fonte_url: metaUrl },
      linkedin: { ...midiaNaoLocalizada(now), fonte_url: liUrl },
      google: googlePendente(now),
    };
  }

  let parsed: { meta?: RawPlat; linkedin?: RawPlat } = {};
  try {
    const content = await completeViaGateway({
      system: SYSTEM_AMBAS,
      prompt: `ANUNCIANTE: ${name}\n\n[META AD LIBRARY] ${metaUrl}\n${metaMd || "(sem conteúdo)"}\n\n[LINKEDIN AD LIBRARY] ${liUrl}\n${liMd || "(sem conteúdo)"}\n\nExtraia o estado da mídia paga, honesto.`,
    });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    parsed = {};
  }

  return {
    meta: toPlataforma(parsed.meta, metaUrl, now),
    linkedin: toPlataforma(parsed.linkedin, liUrl, now),
    google: googlePendente(now),
  };
}

/**
 * Roda a Lente 3. Com token → Meta via API oficial (paralelo ao LinkedIn
 * scrape); sem token → scrape best-effort (comportamento antigo). Nunca lança.
 */
export async function runLente3(name: string): Promise<MidiaPaga> {
  const now = new Date().toISOString();
  if (metaAdsAvailable()) {
    const [meta, linkedin] = await Promise.all([metaViaApi(name, now), linkedinViaScrape(name, now)]);
    return { meta, linkedin, google: googlePendente(now) };
  }
  return lente3ViaScrape(name, now);
}
