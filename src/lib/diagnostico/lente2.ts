/**
 * LENTE 2 — PRESENÇA & CANAIS. Auditoria por canal (site · LinkedIn · YouTube ·
 * Instagram · Facebook · blog): presente? url? recência? frequência? tipo?
 *
 * Determinística (código > LLM, como a descoberta de fontes): acha as URLs nos
 * links da home + busca web; a PROFUNDIDADE vem do que já sabemos coletar —
 * recência real do BLOG (collectBlog) e do LinkedIn (posts ingeridos pelo botão).
 * O que não dá pra auditar na F1 vira status honesto (nao_localizado /
 * requer_captura_linkedin), NUNCA um valor inventado.
 */

import { collectBlog } from "@/lib/collectors/blog";
import { collectLinkedIn } from "@/lib/linkedin";
import { scrape } from "@/lib/firecrawl";
import { slugify, sourceId, type Competitor, type WatchSource } from "@/lib/watchlist";
import {
  campoFato,
  canalNaoLocalizado,
  type CanalAudit,
  type Canais,
} from "@/lib/diagnostico/schema";

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

/** Primeiro link que casa o host da rede social. */
function findSocial(links: string[], hostRe: RegExp): string | null {
  const hit = links.find((l) => {
    try {
      return hostRe.test(new URL(l).hostname);
    } catch {
      return false;
    }
  });
  return hit ? hit.split("#")[0] : null;
}

/** Um link de blog/artigos do próprio site. */
function findBlog(links: string[], siteUrl: string): string | null {
  const hit = links.find(
    (l) => sameHost(l, siteUrl) && /\/(blog|artigos?|insights|conteudos?|noticias?|news)(\/|$)/i.test(l),
  );
  return hit ? hit.split("#")[0].split("?")[0] : null;
}

/** Recência+frequência reais do blog via o coletor que já existe. */
async function auditBlog(
  competitorId: string,
  name: string,
  blogUrl: string,
  now: string,
): Promise<CanalAudit> {
  const competitor: Competitor = { id: competitorId, name, enabled: true, sources: [] };
  const source: WatchSource = { id: sourceId("blog", blogUrl), kind: "blog", url: blogUrl };
  let events: Awaited<ReturnType<typeof collectBlog>> = [];
  try {
    events = await collectBlog(competitor, source, { limit: 5 });
  } catch {
    events = [];
  }
  if (events.length === 0) {
    return { presente: true, url: blogUrl, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" };
  }
  const datas = events.map((e) => e.publishedAt).filter(Boolean).sort() as string[];
  const ultima = datas.length > 0 ? datas[datas.length - 1] : null;
  return {
    presente: true,
    url: blogUrl,
    frequencia: campoFato(events.length >= 4 ? "regular" : "esporádico", blogUrl, now),
    recencia: ultima
      ? campoFato("último conteúdo", blogUrl, now, ultima)
      : null,
    tipo_conteudo: campoFato("artigos / blog", blogUrl, now),
    engajamento: null,
    status: "encontrado",
  };
}

/** LinkedIn: profundidade vem dos posts ingeridos pelo botão (senão, honesto). */
function auditLinkedIn(
  clientName: string,
  name: string,
  url: string | null,
  now: string,
): CanalAudit {
  const posts = collectLinkedIn(clientName).concorrente.filter(
    (e) => slugify(e.competitorName) === slugify(name),
  );
  if (posts.length > 0) {
    const datas = posts.map((p) => p.publishedAt).filter(Boolean).sort() as string[];
    const ultima = datas.length > 0 ? datas[datas.length - 1] : null;
    const fonte = url ?? posts[0].url;
    return {
      presente: true,
      url: fonte,
      frequencia: campoFato(`${posts.length} post(s) capturado(s)`, fonte, now),
      recencia: ultima ? campoFato("último post", fonte, now, ultima) : null,
      tipo_conteudo: campoFato("posts (capturados via botão)", fonte, now),
      engajamento: null,
      status: "encontrado",
    };
  }
  // achou o canal mas não temos profundidade sem o botão "Enviar pro Radar".
  return {
    presente: Boolean(url),
    url,
    frequencia: null,
    recencia: null,
    tipo_conteudo: null,
    engajamento: null,
    status: "requer_captura_linkedin",
  };
}

/** Canal social achado por URL, mas sem auditoria de profundidade na F1 (honesto). */
function auditPresenca(url: string | null): CanalAudit {
  if (!url) return canalNaoLocalizado();
  return {
    presente: true,
    url,
    frequencia: null,
    recencia: null,
    tipo_conteudo: null,
    engajamento: null,
    status: "encontrado",
  };
}

/**
 * Roda a Lente 2: descobre os canais e audita o que dá na F1.
 * `clientName`+`name` casam os posts de LinkedIn ingeridos ao concorrente.
 */
export async function runLente2(
  name: string,
  siteUrl: string,
  clientName: string,
  competitorId: string,
): Promise<Canais> {
  const now = new Date().toISOString();

  let links: string[] = [];
  try {
    links = (await scrape(siteUrl, { formats: ["links"], onlyMainContent: false })).links ?? [];
  } catch {
    links = [];
  }

  // Só o link do PRÓPRIO site — nada de adivinhar por busca de nome (nome comum
  // pega a empresa errada; melhor honesto "requer captura" do que fonte errada).
  const linkedinUrl = findSocial(links, /(^|\.)linkedin\.com$/i);
  const youtubeUrl = findSocial(links, /(^|\.)(youtube\.com|youtu\.be)$/i);
  const instagramUrl = findSocial(links, /(^|\.)instagram\.com$/i);
  const facebookUrl = findSocial(links, /(^|\.)facebook\.com$/i);
  const blogUrl = findBlog(links, siteUrl);

  return {
    site: { presente: true, url: siteUrl, frequencia: null, recencia: null, tipo_conteudo: null, engajamento: null, status: "encontrado" },
    blog: blogUrl ? await auditBlog(competitorId, name, blogUrl, now) : canalNaoLocalizado(),
    linkedin: auditLinkedIn(clientName, name, linkedinUrl, now),
    youtube: auditPresenca(youtubeUrl),
    instagram: auditPresenca(instagramUrl),
    facebook: auditPresenca(facebookUrl),
  };
}
