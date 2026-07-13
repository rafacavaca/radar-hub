/**
 * STORE do CONTEXTO PRIVADO (F1) — dado CONFIDENCIAL do vendedor (arquivos +
 * notas) fundido no dossiê. GUARDRAIL Nº1 (inegociável): ISOLAMENTO POR ORG.
 *
 * Reusa `org_docs` (mesmo RLS/org provado no isolamento do item 2) — NÃO precisa
 * de migração nova e herda o isolamento já testado:
 *   - metadados + texto extraído → kind `prospect-contexto`, key = prospectId;
 *   - BYTES do arquivo (base64)  → kind `prospect-arquivo`,  key = fileId.
 * O arquivo bruto NUNCA tem URL pública — só a rota autenticada o serve, lendo
 * pela SESSÃO (RLS devolve só o da própria org). service_role jamais aqui.
 *
 * Limites: tamanho por arquivo + nº por prospect (avisa ao aproximar). Custo do
 * resumo (LLM, quando o texto é longo) é medido em usage_event.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbDeleteDoc, sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { completeViaGateway } from "@/lib/gateway";
import { extrairTexto } from "@/lib/prospects/extrair";
import { runWithUsage } from "@/lib/usage/context";
import type { ContextoItem } from "@/lib/prospects/schema";

export const MAX_ARQUIVO_BYTES = 8 * 1024 * 1024; // 8 MB por arquivo
export const MAX_ITENS_PROSPECT = 12; // teto de contexto por prospect
const RESUMIR_ACIMA = 2500; // texto maior que isto → resume 1x no upload

const KIND_LISTA = "prospect-contexto";
const KIND_ARQUIVO = "prospect-arquivo";

// ── JSON fallback (clássico/testes) ─────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "prospect-contexto.json");
}
type JsonFile = { itens: Record<string, ContextoItem[]>; bytes: Record<string, { mime: string; nome: string; b64: string }> };
function readJson(): JsonFile {
  const p = filePath();
  if (!existsSync(p)) return { itens: {}, bytes: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as JsonFile;
    return { itens: parsed?.itens ?? {}, bytes: parsed?.bytes ?? {} };
  } catch {
    return { itens: {}, bytes: {} };
  }
}
function writeJson(f: JsonFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(f), "utf8");
  renameSync(tmp, p);
}

function fileId(prospectId: string, nome: string, criadoEm: string): string {
  return createHash("sha1").update(`${prospectId}:${nome}:${criadoEm}`).digest("hex").slice(0, 16);
}

// ── leitura (org-scoped) ────────────────────────────────────────────────────

/** Itens de contexto de um prospect, na org do contexto (ou JSON). Novos 1º. */
export async function loadContexto(prospectId: string): Promise<ContextoItem[]> {
  const itens = supabaseEnabled()
    ? await sbGetDoc<ContextoItem[]>(KIND_LISTA, prospectId, [])
    : (readJson().itens[prospectId] ?? []);
  return [...itens].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

async function saveLista(prospectId: string, itens: ContextoItem[]): Promise<void> {
  if (supabaseEnabled()) await sbSetDoc(KIND_LISTA, prospectId, itens);
  else {
    const f = readJson();
    f.itens[prospectId] = itens;
    writeJson(f);
  }
}

// ── resumo (LLM, 1x no upload; medido) ──────────────────────────────────────

async function resumir(nome: string, texto: string, clientName: string): Promise<string | undefined> {
  if (texto.length <= RESUMIR_ACIMA) return undefined;
  try {
    return await runWithUsage(
      { clientName, feature: "prospect_contexto", entidadeTipo: "geral", entidadeNome: nome },
      () =>
        completeViaGateway({
          system:
            "Você resume um documento INTERNO de vendas (proposta, portfólio, edital, notas). Faça um resumo FIEL em 4-8 linhas, factual, preservando números, prazos, escopo e pedidos explícitos. NÃO invente; se algo não está no texto, não acrescente.",
          prompt: `DOCUMENTO: ${nome}\n\n${texto.slice(0, 20000)}\n\nResuma, fiel.`,
        }),
    );
  } catch {
    return undefined; // sem resumo, o dossiê usa o texto truncado — honesto
  }
}

// ── adicionar ARQUIVO (extrai + guarda bytes + resume) ──────────────────────

export type AddArquivoResult = { item: ContextoItem; erro?: string };

export async function addArquivo(
  prospectId: string,
  clientName: string,
  nome: string,
  mime: string | undefined,
  bytes: Uint8Array,
): Promise<AddArquivoResult> {
  if (bytes.byteLength > MAX_ARQUIVO_BYTES) {
    throw new Error(`Arquivo grande demais (máx. ${Math.round(MAX_ARQUIVO_BYTES / 1024 / 1024)} MB).`);
  }
  const atuais = await loadContexto(prospectId);
  if (atuais.length >= MAX_ITENS_PROSPECT) {
    throw new Error(`Limite de ${MAX_ITENS_PROSPECT} itens de contexto neste prospect — remova algum antes.`);
  }

  const extra = await extrairTexto(bytes, nome, mime);
  const resumo = extra.legivel ? await resumir(nome, extra.texto, clientName) : undefined;
  const criadoEm = new Date().toISOString();
  const id = fileId(prospectId, nome, criadoEm);

  const item: ContextoItem = {
    id,
    prospectId,
    tipo: "arquivo",
    nome,
    mime,
    tamanho: bytes.byteLength,
    texto: extra.texto,
    resumo,
    legivel: extra.legivel,
    temArquivo: true,
    criadoEm,
  };

  // guarda os BYTES (base64) org-scoped — servidos só pela rota autenticada.
  const b64 = Buffer.from(bytes).toString("base64");
  if (supabaseEnabled()) await sbSetDoc(KIND_ARQUIVO, id, { mime: mime ?? "application/octet-stream", nome, b64 });
  else {
    const f = readJson();
    f.bytes[id] = { mime: mime ?? "application/octet-stream", nome, b64 };
    writeJson(f);
  }

  await saveLista(prospectId, [item, ...atuais]);
  return { item, erro: extra.legivel ? undefined : extra.motivo };
}

// ── adicionar NOTA (texto livre — o ouro às vezes é uma frase) ──────────────

export async function addNota(prospectId: string, texto: string): Promise<ContextoItem> {
  const corpo = texto.trim();
  if (corpo.length < 3) throw new Error("Escreva a nota (o que você sabe que não está publicado).");
  const atuais = await loadContexto(prospectId);
  if (atuais.length >= MAX_ITENS_PROSPECT) {
    throw new Error(`Limite de ${MAX_ITENS_PROSPECT} itens de contexto — remova algum antes.`);
  }
  const criadoEm = new Date().toISOString();
  const item: ContextoItem = {
    id: fileId(prospectId, "nota", criadoEm),
    prospectId,
    tipo: "nota",
    nome: "Nota interna",
    texto: corpo.slice(0, 8000),
    legivel: true,
    temArquivo: false,
    criadoEm,
  };
  await saveLista(prospectId, [item, ...atuais]);
  return item;
}

// ── remover (ação do usuário; nunca hard-delete automático) ─────────────────

export async function removeContexto(prospectId: string, id: string): Promise<void> {
  const itens = await loadContexto(prospectId);
  const alvo = itens.find((i) => i.id === id);
  await saveLista(prospectId, itens.filter((i) => i.id !== id));
  if (alvo?.temArquivo) {
    if (supabaseEnabled()) await sbDeleteDoc(KIND_ARQUIVO, id).catch(() => {});
    else {
      const f = readJson();
      delete f.bytes[id];
      writeJson(f);
    }
  }
}

// ── baixar bytes (só a rota autenticada chama — RLS já escopou por org) ──────

export async function loadArquivoBytes(id: string): Promise<{ mime: string; nome: string; bytes: Buffer } | null> {
  const doc = supabaseEnabled()
    ? await sbGetDoc<{ mime: string; nome: string; b64: string } | null>(KIND_ARQUIVO, id, null)
    : (readJson().bytes[id] ?? null);
  if (!doc) return null;
  return { mime: doc.mime, nome: doc.nome, bytes: Buffer.from(doc.b64, "base64") };
}
