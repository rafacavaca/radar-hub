/**
 * META AD LIBRARY API — conexão OFICIAL com o arquivo público de anúncios da
 * Meta (Facebook/Instagram). Substitui o scrape da biblioteca (que quase nunca
 * expõe dado limpo) por dado estruturado, citável e com data.
 *
 * Setup (uma vez, passos do Rafael): docs/meta-ad-library-setup.md.
 * Env: META_AD_LIBRARY_TOKEN (token longo, ~60 dias; `npm run meta:token` troca
 * o curto pelo longo; `npm run smoke:metaads` verifica e avisa quando expirar).
 *
 * COBERTURA HONESTA do arquivo: garantida para anúncios ENTREGUES NA UE (todos
 * os tipos, exigência DSA) + anúncios políticos/eleitorais no resto do mundo.
 * Cobertura comercial do Brasil: verificar empiricamente (o smoke testa com um
 * anunciante-controle). Campanha comercial fora do escopo do arquivo NÃO
 * aparece — ausência aqui NÃO é prova absoluta de "não anuncia".
 */

const GRAPH = "https://graph.facebook.com/v23.0/ads_archive";

/** BR + UE-27 (onde o arquivo tem cobertura comercial garantida/provável). */
const AD_COUNTRIES = [
  "BR", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI",
  "ES", "SE",
];

// Campos mínimos e estáveis do ads_archive (nada exótico — robustez > riqueza).
const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "publisher_platforms",
].join(",");

export type MetaAd = {
  id: string;
  pageId: string | null;
  pageName: string | null;
  /** textos do criativo (o que o anúncio DIZ). */
  bodies: string[];
  linkTitles: string[];
  /** início/fim de veiculação (datas ABSOLUTAS da própria Meta). */
  startedAt: string | null;
  stoppedAt: string | null;
  /** facebook, instagram, messenger, audience_network... */
  platforms: string[];
  /** URL PÚBLICA do anúncio no arquivo (clicável, sem token). */
  libraryUrl: string;
};

export type MetaAdsOk = {
  ok: true;
  /** anúncios cujo page_name bate com o anunciante (filtro anti-homônimo). */
  ads: MetaAd[];
  /** nomes de página distintos que bateram (transparência do filtro). */
  pages: string[];
  /** quantos a busca devolveu ANTES do filtro por página. */
  totalDaBusca: number;
  /** true se havia mais páginas de resultado (contagem é piso, não teto). */
  hasMore: boolean;
  /** URL pública da biblioteca pra conferir no navegador. */
  publicUrl: string;
};

export type MetaAdsErr = {
  ok: false;
  /** mensagem amigável pt-BR (token expirado, sem permissão, rede...). */
  error: string;
  /** true quando renovar o token resolve (Graph code 190). */
  tokenProblem: boolean;
  publicUrl: string;
};

export type MetaAdsResult = MetaAdsOk | MetaAdsErr;

export function metaAdsAvailable(): boolean {
  return Boolean(process.env.META_AD_LIBRARY_TOKEN?.trim());
}

/** URL pública da biblioteca (a mesma que um humano abriria) — fonte clicável. */
export function metaLibraryPublicUrl(name: string): string {
  const q = encodeURIComponent(name);
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${q}&search_type=keyword_unordered`;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

/** normaliza pra comparar nomes (minúsculas, sem acento/pontuação). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function samePage(pageName: string | null, advertiser: string): boolean {
  if (!pageName) return false;
  const a = norm(pageName);
  const b = norm(advertiser);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Busca anúncios de UM anunciante no arquivo oficial. Nunca lança — erros
 * viram `{ok:false, error}` legível (o chamador decide como degradar).
 */
export async function searchMetaAds(
  advertiser: string,
  opts: { activeOnly?: boolean; countries?: string[]; filterByPage?: boolean } = {},
): Promise<MetaAdsResult> {
  const publicUrl = metaLibraryPublicUrl(advertiser);
  const token = process.env.META_AD_LIBRARY_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      error: "META_AD_LIBRARY_TOKEN não configurado em .env.local — ver docs/meta-ad-library-setup.md",
      tokenProblem: true,
      publicUrl,
    };
  }

  const params = new URLSearchParams({
    access_token: token,
    search_terms: advertiser,
    ad_type: "ALL", // sem isso o default é só político
    ad_active_status: opts.activeOnly === false ? "ALL" : "ACTIVE",
    ad_reached_countries: JSON.stringify(opts.countries ?? AD_COUNTRIES),
    fields: FIELDS,
    limit: "100",
  });

  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    res = await fetch(`${GRAPH}?${params.toString()}`, { signal: ctrl.signal });
    clearTimeout(timer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `falha de rede ao chamar a Graph API: ${msg}`, tokenProblem: false, publicUrl };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // corpo não-JSON — tratado abaixo como erro HTTP
  }

  const err = (json as { error?: { message?: string; code?: number } } | null)?.error;
  if (!res.ok || err) {
    const code = err?.code;
    const msg = err?.message ?? `HTTP ${res.status}`;
    const friendly =
      code === 190
        ? `token inválido ou expirado (Graph code 190) — gerar um novo com npm run meta:token. Detalhe: ${msg}`
        : code === 10 || /permission|identity/i.test(msg)
          ? `acesso negado pela Meta — normalmente falta confirmar a identidade em facebook.com/ID (leva 1-2 dias). Detalhe: ${msg}`
          : `Graph API respondeu erro: ${msg}`;
    return { ok: false, error: friendly, tokenProblem: code === 190, publicUrl };
  }

  const data = ((json as { data?: unknown[] } | null)?.data ?? []) as Array<Record<string, unknown>>;
  const hasMore = Boolean((json as { paging?: { next?: string } } | null)?.paging?.next);

  const seen = new Set<string>();
  const all: MetaAd[] = [];
  for (const raw of data) {
    const id = typeof raw.id === "string" ? raw.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    all.push({
      id,
      pageId: typeof raw.page_id === "string" ? raw.page_id : null,
      pageName: typeof raw.page_name === "string" ? raw.page_name : null,
      bodies: strArr(raw.ad_creative_bodies),
      linkTitles: strArr(raw.ad_creative_link_titles),
      startedAt: typeof raw.ad_delivery_start_time === "string" ? raw.ad_delivery_start_time : null,
      stoppedAt: typeof raw.ad_delivery_stop_time === "string" ? raw.ad_delivery_stop_time : null,
      platforms: strArr(raw.publisher_platforms),
      libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    });
  }

  // search_terms também casa com TEXTO do anúncio — filtrar pela página evita
  // atribuir anúncio de terceiro ao concorrente (anti-homônimo, anti-menção).
  const ads = opts.filterByPage === false ? all : all.filter((a) => samePage(a.pageName, advertiser));
  const pages = [...new Set(ads.map((a) => a.pageName).filter((n): n is string => Boolean(n)))];

  return { ok: true, ads, pages, totalDaBusca: all.length, hasMore, publicUrl };
}
