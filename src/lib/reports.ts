/**
 * RELATÓRIOS (F8) — transformar inteligência em DOCUMENTO, reaproveitando o
 * que já existe (a spec "Relatórios" do roadmap). Duas formas neste lote:
 *
 *   1. APROVEITAR DO CHAT: uma resposta boa do Pergunte ao Radar vira relatório
 *      guardado (ou vai pro Formare). É o flywheel aplicado ao chat.
 *   2. MONTAR SOB MEDIDA: um pedido em linguagem natural ("relatório comercial
 *      dos 3 concorrentes") -> o Radar reúne o material (o MESMO motor do
 *      Pergunte ao Radar) e redige um documento -> guardado como relatório.
 *
 * O documento é do Radar (uso interno). "Gerar no Formare" (formare-door)
 * entrega ao Redator do Formare a versão cliente. Agendar (forma 3) = fase
 * seguinte (precisa de scheduler).
 *
 * Store: data/reports.json — mesmo padrão dos outros (escrita atômica, seed
 * implícito, RADAR_DATA_DIR pra teste isolado). Nunca lança na leitura.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildMaterialBlock, collectRecentItems, type AskSource } from "@/lib/ask";
import { fetchClientBrain } from "@/lib/brain";
import { completeViaGateway } from "@/lib/gateway";

export type ReportKind = "chat" | "sob-medida";

export type Report = {
  id: string;
  clientName: string;
  kind: ReportKind;
  titulo: string;
  /** o documento em markdown. */
  corpo: string;
  fontes: AskSource[];
  /** o pedido/pergunta que originou (transparência). */
  origem?: string;
  createdAt: string;
};

type ReportsFile = { reports: Report[] };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function reportsPath(): string {
  return join(dataDir(), "reports.json");
}

function readFile(): ReportsFile {
  const path = reportsPath();
  if (!existsSync(path)) return { reports: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ReportsFile;
    if (parsed && Array.isArray(parsed.reports)) return parsed;
    return { reports: [] };
  } catch {
    return { reports: [] };
  }
}

function writeFile(file: ReportsFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = reportsPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Relatórios (opcionalmente de um cliente), mais novos primeiro. */
export function listReports(clientName?: string): Report[] {
  const all = readFile().reports;
  const filtered = clientName ? all.filter((r) => r.clientName === clientName) : all;
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReport(id: string): Report | null {
  return readFile().reports.find((r) => r.id === id) ?? null;
}

/** Título curto a partir de um texto (1ª frase/linha, ~80 chars). */
function deriveTitle(text: string): string {
  const firstLine = text.replace(/[#*_>`]/g, "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "Relatório";
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 79).trimEnd()}…` : firstSentence;
}

export type SaveReportInput = {
  clientName: string;
  kind: ReportKind;
  corpo: string;
  titulo?: string;
  fontes?: AskSource[];
  origem?: string;
};

/** Guarda um relatório e devolve-o. id estável por (cliente, kind, corpo). */
export function saveReport(input: SaveReportInput): Report {
  const clientName = input.clientName.trim();
  const corpo = input.corpo.trim();
  if (!clientName) throw new Error("Diga a qual cliente este relatório pertence.");
  if (corpo.length < 20) throw new Error("O relatório ficou curto demais para guardar.");

  const id = createHash("sha1").update(`${clientName}:${input.kind}:${corpo}`).digest("hex").slice(0, 16);
  const file = readFile();
  const existing = file.reports.find((r) => r.id === id);
  if (existing) return existing; // não duplica.

  const report: Report = {
    id,
    clientName,
    kind: input.kind,
    titulo: (input.titulo?.trim() || deriveTitle(corpo)).slice(0, 200),
    corpo,
    fontes: input.fontes ?? [],
    origem: input.origem?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  file.reports.push(report);
  writeFile(file);
  return report;
}

/** Apaga um relatório. Lança com mensagem amigável se não existe. */
export function deleteReport(id: string): void {
  const file = readFile();
  const before = file.reports.length;
  file.reports = file.reports.filter((r) => r.id !== id);
  if (file.reports.length === before) throw new Error("Relatório não encontrado.");
  writeFile(file);
}

// ─────────────────────────────────────────────────────────────────────────────
// Montar sob medida — reusa o MOTOR do Pergunte ao Radar (material + gateway)
// ─────────────────────────────────────────────────────────────────────────────

const REPORT_SYSTEM =
  "Você é o RADAR, redigindo um RELATÓRIO de inteligência de mercado para o dono da agência Formare. " +
  "Escreva um documento claro e apresentável, em pt-BR, a partir APENAS do MATERIAL fornecido (itens coletados + o Brain do cliente). " +
  "FORMATO: responda em MARKDOWN PURO (NÃO use JSON, NÃO embrulhe em ```). " +
  "A PRIMEIRA linha é o título como cabeçalho markdown de nível 1, ex.: '# Inteligência competitiva — <cliente>'. " +
  "Depois: um resumo executivo de 2-3 linhas, seções com '## ', listas e **negrito**, e uma seção final de recomendações. " +
  "Regras: (1) HONESTIDADE — só afirme o que está no material; se algo não foi coletado, diga que ainda não há dado, NÃO invente; " +
  "(2) cite os fatos coletados por [n] usando os números do material (ex.: [2]); " +
  "(3) foque no cliente indicado e no que foi pedido; " +
  "(4) seja CONCISO — no máximo ~700 palavras (o motor tem tempo limitado; enxuto e certeiro vence longo).";

/** Itens no material do relatório — enxuto pra caber no tempo do gateway (40s). */
const REPORT_MAX_ITEMS = 18;

/**
 * Interpreta a saída do motor como DOCUMENTO — robusto a modelo desobediente.
 * Caminho principal: markdown puro (título = 1º cabeçalho). Salvamento: se
 * vier JSON (mesmo INVÁLIDO por quebras de linha não-escapadas, o bug que
 * mostrava "titulo: json"), extrai o campo `corpo`/`titulo` por regex.
 */
function parseReportOutput(content: string): { titulo: string; corpo: string } {
  // tira cercas de código (```markdown ... ``` ou ```json ... ```).
  let text = content
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  // SALVAMENTO: parece um objeto JSON? tenta parse estrito e, se falhar
  // (quebras de linha reais dentro das strings), resgata por regex.
  if (text.startsWith("{") && /"corpo"\s*:/.test(text)) {
    try {
      const o = JSON.parse(text) as { titulo?: unknown; corpo?: unknown };
      if (typeof o.corpo === "string" && o.corpo.trim()) {
        return {
          titulo: typeof o.titulo === "string" ? o.titulo.trim() : deriveTitle(o.corpo),
          corpo: o.corpo.trim(),
        };
      }
    } catch {
      // JSON inválido — resgata os campos crus.
    }
    const mCorpo = text.match(/"corpo"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"[a-zA-Z]+"\s*:|\}\s*$)/);
    if (mCorpo) {
      const unesc = (s: string) =>
        s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const mTit = text.match(/"titulo"\s*:\s*"([\s\S]*?)"\s*,/);
      const corpo = unesc(mCorpo[1]).trim();
      return { titulo: mTit ? unesc(mTit[1]).replace(/\n/g, " ").trim() : deriveTitle(corpo), corpo };
    }
  }

  // MARKDOWN: título = 1º cabeçalho (# / ## …); some da linha, vira o campo título.
  const lines = text.split("\n");
  let titulo = "";
  if (lines.length > 0 && /^#{1,3}\s+\S/.test(lines[0])) {
    titulo = lines[0].replace(/^#{1,3}\s+/, "").trim();
    text = lines.slice(1).join("\n").trim();
  }
  if (!titulo) titulo = deriveTitle(text);
  return { titulo, corpo: text };
}

/** Fontes = citações [n] presentes no corpo, mapeadas ao material (anti-invenção). */
function fontesFromBody(corpo: string, items: Array<{ fonte: { url: string; titulo: string }; concorrente?: string }>): AskSource[] {
  const fontes: AskSource[] = [];
  const seen = new Set<string>();
  for (const m of corpo.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > items.length) continue;
    const item = items[n - 1];
    if (seen.has(item.fonte.url)) continue;
    seen.add(item.fonte.url);
    fontes.push({ titulo: item.fonte.titulo, url: item.fonte.url, concorrente: item.concorrente });
  }
  return fontes;
}

/**
 * Compõe um relatório sob medida para UM cliente a partir de um pedido em
 * linguagem natural. Reusa o material do Pergunte ao Radar (itens + Brain).
 * NÃO salva — devolve o rascunho; a rota decide guardar. Nunca lança pelo LLM.
 */
export async function composeReport(
  clientName: string,
  request: string,
): Promise<{ titulo: string; corpo: string; fontes: AskSource[] }> {
  const items = collectRecentItems(14, REPORT_MAX_ITEMS);
  const brain = await fetchClientBrain(clientName);

  const prompt = `CLIENTE DO RELATÓRIO: ${clientName}

O QUE O BRAIN SABE DE ${clientName.toUpperCase()}:
${brain.context}

MATERIAL COLETADO (itens de inteligência — cite por [n]):
${buildMaterialBlock(items)}

PEDIDO DO RAFAEL (o que o relatório deve cobrir):
${request}`;

  // 1 retry: o gateway corta em ~40s e um relatório às vezes raspa esse teto.
  let content = "";
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      content = await completeViaGateway({ system: REPORT_SYSTEM, prompt });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[reports] composeReport tentativa ${attempt} falhou: ${lastErr.message}`);
    }
  }
  if (lastErr) throw lastErr;

  const { titulo, corpo } = parseReportOutput(content);
  const fontes = fontesFromBody(corpo, items);
  return { titulo, corpo, fontes };
}
