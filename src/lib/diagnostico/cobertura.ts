/**
 * Onda 3 · E3 — COBERTURA DE CONTEÚDO / GAP DE TEMAS. Do conteúdo JÁ coletado
 * (notícias/blog + diferenciais + produtos de cada concorrente), monta um mapa
 * de quais TEMAS o mercado cobre e onde há WHITESPACE (tema que ninguém — ou
 * quase ninguém — trata) = oportunidade editorial para o nosso cliente.
 *
 * HONESTIDADE / ESCOPO: isto é COBERTURA DE CONTEÚDO (o que cada um comunica),
 * derivada do material coletado — NÃO é ranking de SEO (posição no Google,
 * volume de busca, backlinks). SEO de verdade exige API paga (Ahrefs/SEMrush) —
 * passo futuro, declarado. O mapa é interpretação (derivado), com fonte no
 * conteúdo real de cada concorrente.
 *
 * Store: data/cobertura.json por cliente (atômico, RADAR_DATA_DIR p/ teste).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { completeViaGateway } from "@/lib/gateway";
import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import type { DiagnosticoConcorrente } from "@/lib/diagnostico/schema";

export type TemaCobertura = {
  tema: string;
  /** nomes dos concorrentes que cobrem o tema (do conteúdo coletado). */
  cobertoPor: string[];
  /** true quando ≤1 concorrente cobre (whitespace = oportunidade). */
  whitespace: boolean;
};

export type CoberturaConteudo = {
  clientName: string;
  temas: TemaCobertura[];
  /** concorrentes considerados (transparência da base). */
  concorrentes: string[];
  gerado_em: string;
  tipo: "derivado";
  /** nota de escopo (content coverage ≠ SEO ranking). */
  observacao: string;
};

const OBSERVACAO_ESCOPO =
  "Cobertura de conteúdo (o que cada concorrente comunica), derivada do material coletado — não é ranking de SEO (posição no Google/volume de busca/backlinks), que exige ferramenta paga.";

// ── store ────────────────────────────────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "cobertura.json");
}
type CoberturaFile = { coberturas: CoberturaConteudo[] };

function readFileSafe(): CoberturaFile {
  const path = filePath();
  if (!existsSync(path)) return { coberturas: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CoberturaFile;
    return parsed && Array.isArray(parsed.coberturas) ? parsed : { coberturas: [] };
  } catch {
    return { coberturas: [] };
  }
}
function writeFileSafe(file: CoberturaFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

export function getCobertura(clientName: string): CoberturaConteudo | null {
  return readFileSafe().coberturas.find((c) => c.clientName === clientName) ?? null;
}
export function saveCobertura(c: CoberturaConteudo): CoberturaConteudo {
  const file = readFileSafe();
  const idx = file.coberturas.findIndex((x) => x.clientName === c.clientName);
  if (idx >= 0) file.coberturas[idx] = c;
  else file.coberturas.push(c);
  writeFileSafe(file);
  return c;
}

// ─── MULTI-TENANT (item 2): API org-scoped (Supabase/org_docs ou JSON). ──

const DOC_KIND = "cobertura";

/** A cobertura salva do cliente, na org da sessão (ou JSON). */
export async function loadCobertura(clientName: string): Promise<CoberturaConteudo | null> {
  if (!supabaseEnabled()) return getCobertura(clientName);
  return sbGetDoc<CoberturaConteudo | null>(DOC_KIND, clientName, null);
}

/** Salva a cobertura na org da sessão (ou JSON). */
export async function persistCobertura(c: CoberturaConteudo): Promise<CoberturaConteudo> {
  if (!supabaseEnabled()) return saveCobertura(c);
  await sbSetDoc(DOC_KIND, c.clientName, c);
  return c;
}

// ── análise ──────────────────────────────────────────────────────────────────

/** O material de conteúdo de UM concorrente (o que ele comunica). */
function materialDe(d: DiagnosticoConcorrente): string {
  const partes: string[] = [];
  for (const dif of d.posicionamento.diferenciais.slice(0, 6)) if (dif.valor) partes.push(dif.valor);
  for (const p of d.posicionamento.produtos.slice(0, 10)) partes.push(`${p.nome}${p.descricao ? `: ${p.descricao}` : ""}`);
  for (const it of d.news?.itens ?? []) partes.push(it.titulo);
  for (const t of d.temas_vigiados ?? []) partes.push(t);
  return partes.join(" · ");
}

const SYSTEM =
  "Você analisa a COBERTURA DE CONTEÚDO de um mercado B2B. Recebe, por concorrente, o material que ele comunica (diferenciais, produtos, títulos de notícias/blog). " +
  "Tarefa: (1) identifique de 5 a 9 TEMAS relevantes do mercado que aparecem no material; (2) para cada tema, liste quais concorrentes o cobrem (SÓ os que têm evidência no material). " +
  "REGRAS DE HONESTIDADE: só temas REALMENTE presentes no material; só marque um concorrente num tema se o material dele evidencia; NÃO invente cobertura. Temas curtos (2-4 palavras). " +
  'Responda SÓ JSON: {"temas":[{"tema":"...","cobertoPor":["ConcorrenteA","ConcorrenteB"]}]}';

/**
 * Gera a cobertura de conteúdo do mercado do cliente a partir dos diagnósticos.
 * whitespace = tema coberto por ≤1 concorrente. NÃO salva (a rota decide).
 * Lança se <2 concorrentes com conteúdo. Nunca inventa cobertura.
 */
export async function analisarCobertura(clientName: string, diags: DiagnosticoConcorrente[]): Promise<CoberturaConteudo> {
  const comConteudo = diags.filter((d) => materialDe(d).trim().length > 20);
  if (comConteudo.length < 2) {
    throw new Error("Cobertura precisa de ≥2 concorrentes com conteúdo coletado (diferenciais/produtos/notícias).");
  }
  const nomes = comConteudo.map((d) => d.concorrente_nome);
  const bloco = comConteudo.map((d) => `### ${d.concorrente_nome}\n${materialDe(d)}`).join("\n\n");

  let raw: { temas?: Array<{ tema?: unknown; cobertoPor?: unknown }> } = {};
  try {
    const content = await completeViaGateway({
      system: SYSTEM,
      prompt: `MERCADO DO CLIENTE: ${clientName}\nCONCORRENTES E O QUE COMUNICAM:\n\n${bloco}\n\nMapeie os temas e quem cobre cada um, honesto.`,
    });
    const m = content.match(/\{[\s\S]*\}/);
    if (m) raw = JSON.parse(m[0]);
  } catch {
    raw = {};
  }

  const nomeSet = new Map(nomes.map((n) => [n.toLowerCase(), n]));
  const temas: TemaCobertura[] = (Array.isArray(raw.temas) ? raw.temas : [])
    .map((t) => {
      const tema = typeof t?.tema === "string" ? t.tema.trim() : "";
      if (!tema) return null;
      const cobertoPor = Array.isArray(t?.cobertoPor)
        ? [...new Set(t.cobertoPor.filter((x): x is string => typeof x === "string").map((x) => nomeSet.get(x.trim().toLowerCase())).filter((x): x is string => Boolean(x)))]
        : [];
      return { tema, cobertoPor, whitespace: cobertoPor.length <= 1 };
    })
    .filter((x): x is TemaCobertura => Boolean(x))
    .slice(0, 9);

  return {
    clientName,
    temas,
    concorrentes: nomes,
    gerado_em: new Date().toISOString(),
    tipo: "derivado",
    observacao: OBSERVACAO_ESCOPO,
  };
}
