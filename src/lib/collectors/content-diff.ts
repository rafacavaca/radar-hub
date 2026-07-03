/**
 * COLETA POR MUDANÇA (F12) — vigia páginas que não são listas de artigos
 * (produto/soluções, vagas/carreiras) por DIFF: tira um "retrato" estrutural da
 * página, compara com o anterior, e a MUDANÇA vira o sinal.
 *
 * Resolve os "· em breve": um concorrente cuja única fonte é Vagas (ex.: Brainr)
 * deixa de ser invisível — quando abre uma vaga nova, o diff detecta e gera um
 * evento. Idem "mudou a página de produto".
 *
 * O "retrato" é ESTRUTURAL (títulos, itens de lista, textos de link) — não o
 * texto inteiro — pra ignorar ruído (banners rotativos, datas) e focar no que
 * importa: os ITENS da página (vagas, produtos, soluções).
 *
 * Honesto: a 1ª captura é linha de base (guarda, não gera evento). Sem mudança
 * -> nenhum evento. Nunca inventa.
 *
 * Store: data/content-snapshots.json (por fonte). RADAR_DATA_DIR isola em teste.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scrape } from "@/lib/firecrawl";
import type { Competitor, SourceKind, WatchSource } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

type SnapshotFile = { snapshots: Record<string, { items: string[]; hash: string; capturedAt: string }> };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function snapshotsPath(): string {
  return join(dataDir(), "content-snapshots.json");
}

function readSnapshots(): SnapshotFile {
  const path = snapshotsPath();
  if (!existsSync(path)) return { snapshots: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SnapshotFile;
    if (parsed && parsed.snapshots && typeof parsed.snapshots === "object") return parsed;
    return { snapshots: {} };
  } catch {
    return { snapshots: {} };
  }
}

function writeSnapshots(file: SnapshotFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = snapshotsPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Normaliza um texto de item (sem markdown, espaços colapsados). */
function norm(s: string): string {
  return s.replace(/[*_`#>[\]]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extrai os ITENS ESTRUTURAIS de um markdown: títulos, itens de lista e textos
 * de link. É o "retrato" que comparamos — ignora parágrafos corridos e ruído.
 * Função PURA (testável sem rede).
 */
export function structuralItems(markdown: string): string[] {
  const items = new Set<string>();
  for (const raw of markdown.split("\n")) {
    // converte links markdown em texto puro ([texto](url) -> texto) ANTES de
    // extrair, pra o item ficar "Product Designer", não "...(/vagas/...)".
    const line = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
    const heading = line.match(/^#{1,6}\s+(.{4,140})$/);
    if (heading) items.add(norm(heading[1]));
    const li = line.match(/^[-*+]\s+(.{4,140})$/);
    if (li) items.add(norm(li[1]));
  }
  // remove itens vazios/curtos após normalizar.
  return [...items].filter((i) => i.length >= 4);
}

export type ContentDiff = {
  changed: boolean;
  added: string[];
  removed: string[];
};

/** Diferença entre dois retratos (conjuntos de itens). Função PURA. */
export function diffItems(prev: string[], curr: string[]): ContentDiff {
  const prevSet = new Set(prev.map((i) => i.toLowerCase()));
  const currSet = new Set(curr.map((i) => i.toLowerCase()));
  const added = curr.filter((i) => !prevSet.has(i.toLowerCase()));
  const removed = prev.filter((i) => !currSet.has(i.toLowerCase()));
  return { changed: added.length > 0 || removed.length > 0, added, removed };
}

function hashItems(items: string[]): string {
  return createHash("sha1").update([...items].sort().join("\n").toLowerCase()).digest("hex").slice(0, 16);
}

const KIND_LABEL: Partial<Record<SourceKind, string>> = {
  produto: "produtos/soluções",
  vagas: "vagas/carreiras",
};

/** Monta a descrição do evento a partir do diff (o que entrou/saiu). */
function describeDiff(kind: SourceKind, diff: ContentDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) {
    parts.push(`Novo: ${diff.added.slice(0, 6).map((i) => `"${i}"`).join(", ")}${diff.added.length > 6 ? ` (+${diff.added.length - 6})` : ""}`);
  }
  if (diff.removed.length > 0) {
    parts.push(`Saiu: ${diff.removed.slice(0, 4).map((i) => `"${i}"`).join(", ")}${diff.removed.length > 4 ? ` (+${diff.removed.length - 4})` : ""}`);
  }
  const contexto =
    kind === "vagas"
      ? "Mudança no quadro de vagas (sinal de contratação/expansão)."
      : "Mudança na página de produtos/soluções (sinal de lançamento/reposicionamento).";
  return `${contexto} ${parts.join(" · ")}`.trim();
}

/**
 * Coleta por mudança UMA fonte (produto/vagas) de um concorrente.
 * 1ª vez -> linha de base (guarda, 0 eventos). Mudou -> 1 evento com o diff.
 * Igual -> 0 eventos. Nunca lança por página problemática (loga e devolve []).
 */
export async function collectByDiff(
  competitor: Pick<Competitor, "id" | "name">,
  source: Pick<WatchSource, "id" | "kind" | "url" | "label">,
  opts: { force?: boolean } = {},
): Promise<RawEvent[]> {
  let markdown = "";
  try {
    const scraped = await scrape(source.url, { formats: ["markdown"], onlyMainContent: true, force: opts.force });
    markdown = scraped.markdown;
  } catch (err) {
    console.warn(`[diff:${competitor.id}/${source.kind}] scrape falhou: ${(err as Error).message}`);
    return [];
  }

  let items = structuralItems(markdown);

  // GATILHO "CONTEÚDO VAZIO" (F17): casca JS sem itens -> 1 retry com render.
  if (items.length === 0) {
    try {
      const rendered = await scrape(source.url, {
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3500,
      });
      items = structuralItems(rendered.markdown);
    } catch (err) {
      console.warn(`[diff:${competitor.id}/${source.kind}] retry com render falhou: ${(err as Error).message}`);
    }
  }
  if (items.length === 0) {
    console.warn(`[diff:${competitor.id}/${source.kind}] página sem itens estruturais — nada a comparar`);
    return [];
  }

  const key = `${competitor.id}:${source.id}`;
  const file = readSnapshots();
  const prev = file.snapshots[key];
  const hash = hashItems(items);
  const capturedAt = new Date().toISOString();

  // atualiza o retrato sempre (o "anterior" pra próxima vez é o atual).
  file.snapshots[key] = { items, hash, capturedAt };
  writeSnapshots(file);

  const label = source.label?.trim() || KIND_LABEL[source.kind] || source.kind;

  // 1ª CAPTURA = linha de base — mas o CONTEÚDO de hoje é intel valiosa
  // (o portfólio do concorrente ENTRA no sistema já, pros analistas lerem).
  // Das próximas em diante, só a MUDANÇA vira sinal.
  if (!prev) {
    const resumo = items.slice(0, 12).join(" · ").slice(0, 520);
    const id = createHash("sha1").update(`${key}:baseline:${hash}`).digest("hex").slice(0, 16);
    return [
      {
        id,
        source: competitor.id,
        competitorName: competitor.name,
        kind: "page",
        url: source.url,
        title: `${competitor.name} — retrato inicial: ${label}`,
        description: `O que a página de ${label} mostra hoje: ${resumo}`,
        category: source.kind,
        publishedAt: null,
        collectedAt: capturedAt,
        excerpt: `O que a página de ${label} mostra hoje: ${resumo}`,
      },
    ];
  }

  // mesmo estado = sem evento.
  if (prev.hash === hash) return [];

  const diff = diffItems(prev.items, items);
  if (!diff.changed) return [];

  const id = createHash("sha1").update(`${key}:${hash}`).digest("hex").slice(0, 16);
  return [
    {
      id,
      source: competitor.id,
      competitorName: competitor.name,
      kind: "page",
      url: source.url,
      title: `${competitor.name} — mudança em ${label}`,
      description: describeDiff(source.kind, diff),
      category: source.kind,
      publishedAt: null,
      collectedAt: capturedAt,
      excerpt: describeDiff(source.kind, diff),
    },
  ];
}

/** Esquece os retratos de um concorrente (ao remover). */
export function forgetCompetitorSnapshots(competitorId: string): void {
  const file = readSnapshots();
  let changed = false;
  for (const key of Object.keys(file.snapshots)) {
    if (key.startsWith(`${competitorId}:`)) {
      delete file.snapshots[key];
      changed = true;
    }
  }
  if (changed) writeSnapshots(file);
}
