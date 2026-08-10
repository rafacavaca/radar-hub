/**
 * STORE do BRAIN NATIVO (D14) — CRUD dos itens de conhecimento de um cliente na
 * org do contexto. Guardado em `org_docs` (kind `brain`, key = cliente), um doc
 * `{ items: BrainItem[] }` por cliente. Org-scoped (org_docs + RLS): o Brain de
 * uma agência NUNCA vaza pra outra, nem por cliente de nome idêntico.
 *
 * Regras que garantem a honestidade:
 * - `addBrainItems` funde por id (dedupe): re-descobrir NÃO duplica um fato e
 *   NUNCA rebaixa um `confirmado` de volta a `inferido`.
 * - `confirmBrainItem` é o ÚNICO caminho pra `confirmado` — é o humano decidindo.
 *
 * Modo org (Supabase) apenas — sem Supabase é no-op (não há org onde escrever).
 */

import { createHash } from "node:crypto";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";

import {
  BRAIN_TIPOS,
  type BrainAutoridade,
  type BrainItem,
  type BrainStats,
  type BrainTipo,
  type BrainTipoStat,
} from "./schema";

const KIND = "brain";
const KIND_CONFIG = "brain-config";
/** Teto por cliente — cabe na curadoria e no prompt do analista sem explodir. */
const MAX_ITENS = 400;

type Doc = { items: BrainItem[] };
type Config = { siteUrl?: string };

/** O site guardado pra descoberta deste cliente ("" se ainda não há). */
export async function loadBrainSite(cliente: string): Promise<string> {
  if (!cliente || !supabaseEnabled()) return "";
  const cfg = await sbGetDoc<Config>(KIND_CONFIG, cliente, {});
  return (cfg?.siteUrl ?? "").trim();
}

/** Lembra o site usado na descoberta (pra prefill e re-descoberta). */
export async function saveBrainSite(cliente: string, siteUrl: string): Promise<void> {
  if (!cliente || !supabaseEnabled()) return;
  await sbSetDoc(KIND_CONFIG, cliente, { siteUrl: siteUrl.trim() });
}

/** id determinístico a partir do (tipo, texto) — a chave do dedupe. */
export function brainItemId(tipo: BrainTipo, texto: string): string {
  const norm = texto.replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha1").update(`${tipo}:${norm}`).digest("hex").slice(0, 16);
}

/** Os itens do Brain deste cliente na org do contexto (vazio se não há / sem org). */
export async function loadBrainItems(cliente: string): Promise<BrainItem[]> {
  if (!cliente || !supabaseEnabled()) return [];
  const doc = await sbGetDoc<Doc>(KIND, cliente, { items: [] });
  return Array.isArray(doc?.items) ? doc.items : [];
}

async function save(cliente: string, items: BrainItem[]): Promise<void> {
  await sbSetDoc(KIND, cliente, { items: items.slice(0, MAX_ITENS) });
}

/**
 * Funde itens novos (descoberta/ingestão) por id. NÃO duplica um id já existente
 * e NÃO mexe no que já está lá (preserva `confirmado`). Devolve quantos entraram.
 */
export async function addBrainItems(
  cliente: string,
  novos: BrainItem[],
): Promise<{ added: number; skipped: number }> {
  if (!supabaseEnabled() || novos.length === 0) return { added: 0, skipped: novos.length };
  const atuais = await loadBrainItems(cliente);
  const porId = new Map(atuais.map((i) => [i.id, i]));
  let added = 0;
  let skipped = 0;
  for (const n of novos) {
    if (porId.has(n.id)) {
      skipped++; // já existe (confirmado ou inferido) — não rebaixa, não duplica
      continue;
    }
    porId.set(n.id, n);
    added++;
  }
  if (added > 0) await save(cliente, [...porId.values()]);
  return { added, skipped };
}

/** Promove um item a `confirmado` com a autoridade que o humano decidiu. */
export async function confirmBrainItem(
  cliente: string,
  id: string,
  autoridade: BrainAutoridade,
): Promise<void> {
  if (!supabaseEnabled()) return;
  const items = await loadBrainItems(cliente);
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.status = "confirmado";
  it.autoridade = autoridade;
  await save(cliente, items);
}

/** Descarta um item (lixo/duplicado). */
export async function discardBrainItem(cliente: string, id: string): Promise<void> {
  if (!supabaseEnabled()) return;
  const items = await loadBrainItems(cliente);
  const next = items.filter((i) => i.id !== id);
  if (next.length !== items.length) await save(cliente, next);
}

/** Contadores honestos pra o cabeçalho da Revisar ("X tipos · Y fontes · N aguardando você"). */
export async function brainStats(cliente: string): Promise<BrainStats> {
  const items = await loadBrainItems(cliente);
  const porTipo = Object.fromEntries(
    BRAIN_TIPOS.map((t) => [t, { total: 0, inferido: 0, confirmado: 0 }]),
  ) as Record<BrainTipo, BrainTipoStat>;
  const fontes = new Set<string>();
  let confirmados = 0;
  for (const i of items) {
    const bucket = porTipo[i.tipo];
    if (bucket) {
      bucket.total++;
      if (i.status === "confirmado") bucket.confirmado++;
      else bucket.inferido++;
    }
    if (i.status === "confirmado") confirmados++;
    const fonte = i.fonte_url || i.fonte_titulo; // material = o nome do arquivo é a fonte
    if (fonte) fontes.add(fonte);
  }
  const tipos = BRAIN_TIPOS.filter((t) => porTipo[t].total > 0).length;
  return {
    itens: items.length,
    confirmados,
    aguardando: items.length - confirmados,
    tipos,
    fontes: fontes.size,
    porTipo,
  };
}
