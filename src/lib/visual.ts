/**
 * NÓ VISÃO (F11) — monitor de IDENTIDADE do concorrente.
 *
 * Captura o print da página PÚBLICA do concorrente e detecta mudança de
 * identidade em três camadas, cada uma honesta sobre o que é:
 *
 *   1. PALETA (visão computacional determinística): decodifica o print e extrai
 *      as cores dominantes. Comparando com a captura anterior, mede se a paleta
 *      mudou — números, não achismo.
 *   2. ASSINATURA VISUAL (hash perceptual — aHash): um "resumo" de 64 bits da
 *      imagem; a distância entre duas capturas diz "a página mudou X%
 *      visualmente" (sinal de rebranding/redesign).
 *   3. LEITURA POR IA (visão multimodal, endpoint isolado do motor): a IA olha
 *      o print ANTES e o AGORA e descreve a mudança de identidade visual e de
 *      mensagem/posicionamento — como um humano faria.
 *
 * HONESTIDADE: a PRIMEIRA captura é linha de base (não há com o que comparar, e
 * dizemos isso). Se o print não vier (Firecrawl indisponível), degrada para
 * leitura só do texto e avisa. Nada é inventado.
 *
 * Store: data/visual.json + os PNGs em data/visual/. Guarda por concorrente a
 * captura anterior (prev) e a atual (curr) pra comparar; e um histórico curto
 * de relatórios. RADAR_DATA_DIR isola em teste.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PNG } from "pngjs";

import { scrape } from "@/lib/firecrawl";
import { analyzeImagesViaGateway } from "@/lib/gateway-vision";
import type { Competitor } from "@/lib/watchlist";

export type Swatch = { hex: string; pct: number };

export type VisualSnapshot = {
  competitorId: string;
  clientName: string;
  competitorName: string;
  capturedAt: string;
  palette: Swatch[];
  aHash: string;
  /** título/mensagem de topo (hero) capturada do texto. */
  mensagem: string;
  /** URL pública do print no Firecrawl (para exibir logo após capturar). */
  screenshotUrl?: string;
};

export type VisualVerdict = "linha_de_base" | "estavel" | "mudou" | "sem_print";

export type VisualReport = {
  id: string;
  competitorId: string;
  clientName: string;
  competitorName: string;
  capturedAt: string;
  verdict: VisualVerdict;
  /** quanto a imagem mudou vs a captura anterior (0-100), pelo hash perceptual. */
  mudancaVisualPct?: number;
  paletteAtual: Swatch[];
  mensagemAtual: string;
  /** o resumo da IA sobre a mudança (ou a leitura da linha de base). */
  resumoIA: string;
  fonteUrl: string;
  screenshotUrl?: string;
};

type VisualFile = { snapshots: VisualSnapshot[]; reports: VisualReport[] };

const REPORTS_PER_COMPETITOR = 8;

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function visualPath(): string {
  return join(dataDir(), "visual.json");
}
function imgDir(): string {
  return join(dataDir(), "visual");
}
function currImgPath(competitorId: string): string {
  return join(imgDir(), `${competitorId}-curr.png`);
}
function prevImgPath(competitorId: string): string {
  return join(imgDir(), `${competitorId}-prev.png`);
}

function readFileSafe(): VisualFile {
  const path = visualPath();
  if (!existsSync(path)) return { snapshots: [], reports: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as VisualFile;
    if (parsed && Array.isArray(parsed.snapshots) && Array.isArray(parsed.reports)) return parsed;
    return { snapshots: [], reports: [] };
  } catch {
    return { snapshots: [], reports: [] };
  }
}

function writeFileSafe(file: VisualFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = visualPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

// ─────────────────────────────────────────────────────────────────────────────
// Visão computacional determinística (sem IA): paleta + hash perceptual
// ─────────────────────────────────────────────────────────────────────────────

/** cinza perceptual de um RGB (0-255). */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Extrai a PALETA (cores dominantes) e a ASSINATURA (aHash 64 bits) de um PNG.
 * - paleta: quantiza cada pixel numa grade grosseira (8 níveis/canal), conta,
 *   ignora quase-branco (fundo) e quase-preto (texto), devolve o top 6 com %.
 * - aHash: reduz a imagem a 8x8 tons de cinza e marca cada célula como 1 se
 *   acima da média — a distância de Hamming entre dois hashes = mudança visual.
 */
export function analyzePng(buffer: Buffer): { palette: Swatch[]; aHash: string; width: number; height: number } {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png; // data = RGBA
  const total = width * height;

  // amostra com passo pra limitar trabalho em prints grandes (~40k pixels máx).
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 40000)));

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let brandPixels = 0;

  // grade 8x8 pro aHash (soma de luma por célula).
  const cell = new Float64Array(64);
  const cellCount = new Float64Array(64);

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 128) continue; // transparente

      // aHash: acumula luma na célula 8x8 correspondente.
      const cx = Math.min(7, Math.floor((x / width) * 8));
      const cy = Math.min(7, Math.floor((y / height) * 8));
      const ci = cy * 8 + cx;
      cell[ci] += luma(r, g, b);
      cellCount[ci] += 1;

      // paleta: ignora fundo quase-branco e texto quase-preto.
      const nearWhite = r > 235 && g > 235 && b > 235;
      const nearBlack = r < 18 && g < 18 && b < 18;
      if (nearWhite || nearBlack) continue;
      brandPixels++;
      const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }

  // aHash: média das células preenchidas, depois bit por célula.
  const cellAvg = new Array<number>(64).fill(0);
  let sum = 0, filled = 0;
  for (let i = 0; i < 64; i++) {
    if (cellCount[i] > 0) { cellAvg[i] = cell[i] / cellCount[i]; sum += cellAvg[i]; filled++; }
  }
  const mean = filled > 0 ? sum / filled : 0;
  let bits = "";
  for (let i = 0; i < 64; i++) bits += cellAvg[i] >= mean ? "1" : "0";
  // 64 bits -> 16 hex (4 bits por vez; sem BigInt, pra não exigir ES2020).
  let aHash = "";
  for (let i = 0; i < 64; i += 4) aHash += parseInt(bits.slice(i, i + 4), 2).toString(16);

  // paleta: top 6 buckets por contagem, cor = média do bucket.
  const palette: Swatch[] = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((bk) => {
      const r = Math.round(bk.r / bk.count);
      const g = Math.round(bk.g / bk.count);
      const b = Math.round(bk.b / bk.count);
      const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      return { hex, pct: Math.round((bk.count / Math.max(1, brandPixels)) * 100) };
    });

  return { palette, aHash, width, height };
}

/** Distância de Hamming entre dois aHash hex (0-64), nibble a nibble. */
export function hashDistance(a: string, b: string): number {
  let d = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = (parseInt(a[i] ?? "0", 16) || 0) ^ (parseInt(b[i] ?? "0", 16) || 0);
    while (x > 0) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** Mudança visual em % (0-100) a partir da distância de hash. */
export function visualChangePct(a: string, b: string): number {
  return Math.round((hashDistance(a, b) / 64) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Captura + análise
// ─────────────────────────────────────────────────────────────────────────────

/** hero/mensagem de topo a partir do markdown (1ª frase de headline — sem
 * URL, sem marcador de lista e mais longa que um botão/CTA de nav). */
function heroFromMarkdown(markdown: string): string {
  const lines = markdown
    .split("\n")
    .map((l) => l.replace(/^[-*+\d.)\s]+/, "").replace(/[#>*_`!\[\]()]/g, "").trim());
  const first = lines
    .slice(0, 30)
    .find(
      (l) =>
        l.length >= 20 && // headline, não "Teste Grátis"/"Login"
        l.length < 200 &&
        l.includes(" ") &&
        /[a-zA-ZÀ-ÿ]/.test(l) &&
        !/https?:\/\//i.test(l),
    );
  return (first ?? "").slice(0, 240);
}

const VISION_SYSTEM =
  "Você é um analista de MARCA. Vai comparar DUAS imagens da MESMA página pública de um concorrente: " +
  "a Imagem 1 é a captura ANTERIOR e a Imagem 2 é a ATUAL. Diga, de forma objetiva e honesta, se a IDENTIDADE mudou — " +
  "cores/paleta, logo, elementos gráficos, estilo visual — E se a MENSAGEM/POSICIONAMENTO mudou (tom, promessa, discurso). " +
  "Se estiverem essencialmente iguais, diga que está estável. Não invente mudanças. " +
  'Responda SÓ um objeto JSON: {"mudou": true|false, "aspecto": "visual"|"mensagem"|"ambos"|"nenhum", "resumo": "1-3 frases em pt-BR"}.';

const BASELINE_SYSTEM =
  "Você é um analista de MARCA. Descreva, em 1-3 frases (pt-BR), a IDENTIDADE atual desta página pública de concorrente: " +
  "paleta de cores predominante, estilo visual e o tom/posicionamento da mensagem principal. Seja objetivo, não invente.";

function extractJson(content: string): Record<string, unknown> | null {
  try {
    const m = content.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchPng(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // valida assinatura PNG.
    if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Captura a identidade de UM concorrente e produz um VisualReport, comparando
 * com a captura anterior quando houver. Nunca lança: em falha, devolve um
 * relatório honesto (sem_print / degradado). O `siteUrl` é obrigatório.
 */
export async function captureIdentity(
  competitor: Pick<Competitor, "id" | "name" | "siteUrl">,
  clientName: string,
): Promise<VisualReport> {
  const capturedAt = new Date().toISOString();
  const siteUrl = competitor.siteUrl ?? "";
  const baseReport: VisualReport = {
    id: createHash("sha1").update(`${competitor.id}:${capturedAt}`).digest("hex").slice(0, 16),
    competitorId: competitor.id,
    clientName,
    competitorName: competitor.name,
    capturedAt,
    verdict: "sem_print",
    paletteAtual: [],
    mensagemAtual: "",
    resumoIA: "",
    fonteUrl: siteUrl,
  };

  if (!siteUrl) {
    baseReport.resumoIA = "Sem site cadastrado para este concorrente — adicione o site na tela Vigiar.";
    return persistReport(baseReport, null);
  }

  // 1) print + texto da página pública.
  let screenshotUrl: string | undefined;
  let mensagem = "";
  try {
    const scraped = await scrape(siteUrl, { formats: ["screenshot", "markdown"], onlyMainContent: false });
    screenshotUrl = scraped.screenshot;
    mensagem = heroFromMarkdown(scraped.markdown);
  } catch (err) {
    baseReport.resumoIA = `Não consegui abrir a página pública agora (${(err as Error).message}).`;
    return persistReport(baseReport, null);
  }

  const pngBuffer = screenshotUrl ? await fetchPng(screenshotUrl) : null;
  baseReport.mensagemAtual = mensagem;
  baseReport.screenshotUrl = screenshotUrl;

  // sem print utilizável -> degrada (só texto), honesto.
  if (!pngBuffer) {
    baseReport.verdict = "sem_print";
    baseReport.resumoIA =
      "O print não veio nesta captura (a fonte pode ter bloqueado a imagem). Guardei a mensagem de topo; a análise visual depende do print.";
    return persistReport(baseReport, { competitorId: competitor.id, clientName, competitorName: competitor.name, capturedAt, palette: [], aHash: "0000000000000000", mensagem, screenshotUrl });
  }

  // 2) visão computacional determinística.
  let palette: Swatch[] = [];
  let aHash = "0000000000000000";
  try {
    const analyzed = analyzePng(pngBuffer);
    palette = analyzed.palette;
    aHash = analyzed.aHash;
  } catch (err) {
    console.warn(`[visual] falha decodificando o print de ${competitor.name}: ${(err as Error).message}`);
  }
  baseReport.paletteAtual = palette;

  // 3) captura anterior (para comparar) — o PNG "curr" atual vira "prev".
  const prevBuffer = existsSync(currImgPath(competitor.id))
    ? readFileSync(currImgPath(competitor.id))
    : null;
  const file = readFileSafe();
  const prevSnap = file.snapshots.find((s) => s.competitorId === competitor.id) ?? null;

  // persiste os PNGs: curr->prev, novo->curr.
  mkdirSync(imgDir(), { recursive: true });
  if (prevBuffer) writeFileSync(prevImgPath(competitor.id), prevBuffer);
  writeFileSync(currImgPath(competitor.id), pngBuffer);

  const snapshot: VisualSnapshot = {
    competitorId: competitor.id,
    clientName,
    competitorName: competitor.name,
    capturedAt,
    palette,
    aHash,
    mensagem,
    screenshotUrl,
  };

  // 4) primeira captura = linha de base (leitura da IA sobre a identidade atual).
  if (!prevSnap || !prevBuffer) {
    let resumo = "Primeira captura — esta é a linha de base. Nas próximas, comparo e aviso o que mudou.";
    try {
      const out = await analyzeImagesViaGateway({
        system: BASELINE_SYSTEM,
        prompt: `Concorrente: ${competitor.name}. Mensagem de topo capturada: "${mensagem}". Descreva a identidade atual.`,
        images: [{ media_type: "image/png", data: pngBuffer.toString("base64") }],
      });
      if (out.trim()) resumo = `Linha de base. ${out.trim()}`;
    } catch (err) {
      console.warn(`[visual] baseline IA falhou p/ ${competitor.name}: ${(err as Error).message}`);
    }
    baseReport.verdict = "linha_de_base";
    baseReport.resumoIA = resumo;
    return persistReport(baseReport, snapshot);
  }

  // 5) comparação: determinística + IA.
  const pct = visualChangePct(prevSnap.aHash, aHash);
  let mudouIA = false;
  let aspecto = "";
  let resumoIA = "";
  try {
    const out = await analyzeImagesViaGateway({
      system: VISION_SYSTEM,
      prompt:
        `Concorrente: ${competitor.name}.\n` +
        `Mensagem de topo ANTES: "${prevSnap.mensagem}"\n` +
        `Mensagem de topo AGORA: "${mensagem}"\n` +
        `A Imagem 1 é a captura anterior; a Imagem 2 é a atual. Compare.`,
      images: [
        { media_type: "image/png", data: prevBuffer.toString("base64") },
        { media_type: "image/png", data: pngBuffer.toString("base64") },
      ],
    });
    const parsed = extractJson(out);
    mudouIA = parsed?.mudou === true;
    aspecto = typeof parsed?.aspecto === "string" ? parsed.aspecto : "";
    resumoIA = typeof parsed?.resumo === "string" ? parsed.resumo.trim() : out.trim();
  } catch (err) {
    console.warn(`[visual] compare IA falhou p/ ${competitor.name}: ${(err as Error).message}`);
    resumoIA = `Comparação por IA indisponível agora; pela assinatura visual, a página mudou ~${pct}%.`;
  }

  // veredito: a IA manda; o hash é o número de apoio (e um empurrão se a IA
  // falhou mas a imagem claramente mudou).
  const mudou = mudouIA || (resumoIA === "" && pct >= 12);
  baseReport.verdict = mudou ? "mudou" : "estavel";
  baseReport.mudancaVisualPct = pct;
  baseReport.resumoIA =
    (resumoIA || (mudou ? "Mudança detectada." : "Identidade estável.")) +
    (aspecto && mudou ? ` (aspecto: ${aspecto})` : "") +
    ` · assinatura visual mudou ~${pct}%.`;
  return persistReport(baseReport, snapshot);
}

/** Salva o relatório (histórico curto por concorrente) e o snapshot atual. */
function persistReport(report: VisualReport, snapshot: VisualSnapshot | null): VisualReport {
  const file = readFileSafe();
  if (snapshot) {
    file.snapshots = file.snapshots.filter((s) => s.competitorId !== snapshot.competitorId);
    file.snapshots.push(snapshot);
  }
  file.reports.unshift(report);
  // mantém histórico curto por concorrente.
  const seen = new Map<string, number>();
  file.reports = file.reports.filter((r) => {
    const n = (seen.get(r.competitorId) ?? 0) + 1;
    seen.set(r.competitorId, n);
    return n <= REPORTS_PER_COMPETITOR;
  });
  writeFileSafe(file);
  return report;
}

/** Relatórios (mais novos primeiro), opcionalmente de um cliente. */
export function listVisualReports(clientName?: string): VisualReport[] {
  const reports = readFileSafe().reports;
  const filtered = clientName ? reports.filter((r) => r.clientName === clientName) : reports;
  return [...filtered].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/** Último relatório por concorrente (pra tela mostrar o estado atual). */
export function latestByCompetitor(clientName: string): Map<string, VisualReport> {
  const map = new Map<string, VisualReport>();
  for (const r of listVisualReports(clientName)) {
    if (!map.has(r.competitorId)) map.set(r.competitorId, r);
  }
  return map;
}

/** Limpa os dados visuais de um concorrente (usado ao remover). */
export function forgetCompetitorVisual(competitorId: string): void {
  const file = readFileSafe();
  file.snapshots = file.snapshots.filter((s) => s.competitorId !== competitorId);
  file.reports = file.reports.filter((r) => r.competitorId !== competitorId);
  writeFileSafe(file);
  for (const p of [currImgPath(competitorId), prevImgPath(competitorId)]) {
    try {
      if (existsSync(p)) rmSync(p);
    } catch {
      // best-effort
    }
  }
}
