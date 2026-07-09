/**
 * INGESTÃO DE LINKEDIN (captura assistida) — o Rafael navega o LinkedIn logado
 * e clica "Enviar pro Radar" num post; a extensão manda um POST normalizado pro
 * endpoint de ingestão (`/api/ingest`), que guarda aqui. LinkedIn vira só mais
 * um "source type" — a peça reaproveitável é o OBJETO NORMALIZADO, não a captura.
 *
 * Roteamento por PAPEL (feito no loop, ao coletar):
 *  - papel="concorrente" -> entra no pilar Concorrentes (lentes/cruzamento + urgência da correlação);
 *  - papel="conta-chave" -> entra na FICHA daquela conta e dispara o analista de relacionamento.
 *
 * GUARDRAILS:
 *  - Data relativa ("2 sem", "1 mês") -> ABSOLUTA via `resolveRelativeDate`. Sem
 *    data confiável -> null ("sem data de publicação"). NUNCA "31 dez 1969".
 *  - Fonte + url sempre. Tagueado `source:"linkedin"` (distinguível).
 *  - Curado e assistido: só o que o humano manda entra.
 *
 * Store: data/linkedin.json (escrita atômica, RADAR_DATA_DIR pra teste). Nunca lança na leitura.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { slugify } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

export type Papel = "concorrente" | "conta-chave";

/** Um post de LinkedIn ingerido — a forma persistida. */
export type LinkedInPost = {
  /** id estável (hash da url) — deduplica reenvios do mesmo post. */
  id: string;
  /** workspace (== cliente do Radar, ex.: "TAGAT Foodtech"). */
  workspace: string;
  /** pra onde roteia. */
  papel: Papel;
  /** autor/perfil do post (vira o "subject": o concorrente ou a conta). */
  perfil: string;
  /** conteúdo do post. */
  texto: string;
  /** link do post. */
  url: string;
  /** data de publicação ABSOLUTA (resolvida da relativa) — ou null (sem data). */
  publishedAt: string | null;
  /** quando o Radar recebeu. */
  collectedAt: string;
  ingestedAt: string;
};

type LinkedInFile = { posts: LinkedInPost[] };

const PAPEIS: readonly Papel[] = ["concorrente", "conta-chave"];

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "linkedin.json");
}

function readFile(): LinkedInFile {
  const path = filePath();
  if (!existsSync(path)) return { posts: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LinkedInFile;
    if (parsed && Array.isArray(parsed.posts)) return parsed;
    return { posts: [] };
  } catch {
    return { posts: [] };
  }
}

function writeFile(file: LinkedInFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data relativa -> absoluta (o bug histórico do "31 dez 1969")
// ─────────────────────────────────────────────────────────────────────────────

const UNIT_RULES: Array<{ re: RegExp; apply: (d: Date, n: number) => void }> = [
  { re: /^(min|minuto|minutos)$/, apply: (d, n) => d.setMinutes(d.getMinutes() - n) },
  { re: /^(h|hora|horas)$/, apply: (d, n) => d.setHours(d.getHours() - n) },
  { re: /^(d|dia|dias)$/, apply: (d, n) => d.setDate(d.getDate() - n) },
  { re: /^(sem|semana|semanas|w)$/, apply: (d, n) => d.setDate(d.getDate() - n * 7) },
  { re: /^(mes|mês|meses|mo)$/, apply: (d, n) => d.setMonth(d.getMonth() - n) },
  { re: /^(a|ano|anos|y)$/, apply: (d, n) => d.setFullYear(d.getFullYear() - n) },
];

/**
 * Resolve a data de publicação: aceita ISO absoluta (passa direto) OU uma data
 * RELATIVA em pt-BR/en ("2 sem", "1 mês", "3 d", "5 h", "agora", "1 a"). Devolve
 * ISO absoluta OU null quando não dá pra confiar (nunca fabrica data).
 */
export function resolveRelativeDate(input: string, collectedAtISO: string): string | null {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return null;

  // já é uma data absoluta (ISO/AAAA-MM-DD)? passa direto.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const abs = new Date(s);
    return Number.isNaN(abs.getTime()) ? null : abs.toISOString();
  }

  const base = new Date(collectedAtISO);
  if (Number.isNaN(base.getTime())) return null;

  if (/(agora|now|instante|há pouco|ha pouco|segundos?)\b/.test(s)) return base.toISOString();

  // "2 sem", "1mês", "3 dias", "5h" — número + unidade (com ou sem espaço).
  const m = s.match(/(\d+)\s*([a-zç]+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (!Number.isFinite(n) || n < 0) return null;

  const rule = UNIT_RULES.find((r) => r.re.test(unit));
  if (!rule) return null; // unidade desconhecida -> sem data (honesto)

  const d = new Date(base);
  rule.apply(d, n);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestão (o endpoint chama) + leitura
// ─────────────────────────────────────────────────────────────────────────────

export type IngestInput = {
  perfil?: unknown;
  papel?: unknown;
  workspace?: unknown;
  texto?: unknown;
  /** data de publicação: ISO absoluta OU relativa ("2 sem"). */
  data_publicacao?: unknown;
  /** quando capturou (ISO); ausente ⇒ agora. */
  data_coleta?: unknown;
  url?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valida + normaliza + guarda um post. Dedup por url (reenvio atualiza o texto/
 * data). Lança Error pt-BR quando inválido (o endpoint converte em 400).
 */
export function ingestLinkedInPost(input: IngestInput): LinkedInPost {
  const workspace = str(input.workspace);
  const papel = str(input.papel) as Papel;
  const perfil = str(input.perfil);
  const texto = str(input.texto);
  const url = str(input.url);

  if (!workspace) throw new Error("Falta o workspace (cliente do Radar).");
  if (!PAPEIS.includes(papel)) throw new Error("Papel inválido — use 'concorrente' ou 'conta-chave'.");
  if (!perfil) throw new Error("Falta o perfil (autor do post).");
  if (!texto) throw new Error("O post está sem texto.");
  if (!/^https?:\/\//.test(url)) throw new Error("Falta a URL do post (link de origem).");

  const collectedAt = str(input.data_coleta) || new Date().toISOString();
  const publishedAt = resolveRelativeDate(str(input.data_publicacao), collectedAt);

  const id = createHash("sha1").update(`li:${url}`).digest("hex").slice(0, 16);
  const now = new Date().toISOString();
  const post: LinkedInPost = {
    id,
    workspace,
    papel,
    perfil,
    texto,
    url,
    publishedAt,
    collectedAt,
    ingestedAt: now,
  };

  const file = readFile();
  const idx = file.posts.findIndex((p) => p.id === id);
  if (idx >= 0) file.posts[idx] = post; // reenvio atualiza
  else file.posts.push(post);
  writeFile(file);
  return post;
}

/** Posts ingeridos (opcionalmente de um workspace), mais novos primeiro. */
export function listLinkedInPosts(workspace?: string): LinkedInPost[] {
  const all = readFile().posts;
  const filtered = workspace ? all.filter((p) => p.workspace === workspace) : all;
  return [...filtered].sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
}

/** Um post vira RawEvent — `source` tagueia a origem LinkedIn + o perfil. */
function toEvent(post: LinkedInPost): RawEvent {
  return {
    id: post.id,
    source: `linkedin:${slugify(post.perfil)}`,
    competitorName: post.perfil, // o subject (concorrente OU conta) — a ficha agrupa por este nome
    kind: "news",
    url: post.url,
    title: post.texto.replace(/\s+/g, " ").trim().slice(0, 120),
    description: post.texto,
    publishedAt: post.publishedAt,
    collectedAt: post.collectedAt,
  };
}

/**
 * Coleta os posts de LinkedIn de um cliente, JÁ SEPARADOS por papel — o loop
 * injeta `concorrente` no pilar Concorrentes e `conta` no pilar Clientes.
 */
export function collectLinkedIn(clientName: string): {
  concorrente: RawEvent[];
  conta: RawEvent[];
} {
  const posts = listLinkedInPosts(clientName);
  return {
    concorrente: posts.filter((p) => p.papel === "concorrente").map(toEvent),
    conta: posts.filter((p) => p.papel === "conta-chave").map(toEvent),
  };
}
