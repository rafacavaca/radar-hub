/**
 * VOCABULÁRIO DA AGÊNCIA (P13, org-level) — deixa a agência renomear os TERMOS
 * que ela vê no Radar (Concorrente, Área, Prioridade…) pro nome que ela já usa
 * com o cliente. É rótulo (software): neutro por padrão, na língua do comprador.
 *
 * Fonte única: um mapa {termo → rótulo custom} por org (org_docs kind `vocab`,
 * key `global`; JSON em data/vocab.json no clássico). O resolvedor `rotulo()` é
 * PURO — servidor e cliente resolvem pelo mesmo mapa (o cliente recebe o mapa
 * via VocabProvider). Guarda só o que DIFERE do padrão (mapa mínimo).
 *
 * Lote ③: começa com os termos visíveis no pitch. Novos termos entram só
 * acrescentando à lista — o mecanismo já cobre.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";

/** Os termos renomeáveis (chave estável + rótulo padrão + o que é, pra a tela). */
export const VOCAB_TERMS = [
  { key: "concorrentes", label: "Concorrentes", desc: "quem a agência monitora" },
  { key: "contas_chave", label: "Contas-chave", desc: "as contas que o cliente quer cuidar" },
  { key: "areas", label: "Áreas", desc: "as óticas de leitura (comercial, produto, marketing)" },
  { key: "prioridade", label: "Prioridade", desc: "o peso de um sinal (Alta · Média · Baixa)" },
  { key: "oportunidade", label: "Oportunidade", desc: "um gancho acionável num sinal" },
  { key: "base_conhecimento", label: "Base de conhecimento", desc: "o que o Radar sabe do cliente" },
] as const;

export type VocabKey = (typeof VOCAB_TERMS)[number]["key"];
export type VocabMap = Partial<Record<VocabKey, string>>;

const DEFAULTS = Object.fromEntries(VOCAB_TERMS.map((t) => [t.key, t.label])) as Record<VocabKey, string>;
const KEYS = new Set<string>(VOCAB_TERMS.map((t) => t.key));

/** O rótulo efetivo de um termo: o custom da agência, ou o padrão. PURO. */
export function rotulo(vocab: VocabMap | null | undefined, key: VocabKey): string {
  const custom = vocab?.[key]?.trim();
  return custom && custom.length > 0 ? custom : DEFAULTS[key];
}

/** O rótulo PADRÃO de um termo (sem override). */
export function rotuloPadrao(key: VocabKey): string {
  return DEFAULTS[key];
}

/** Sanitiza um mapa cru: só termos conhecidos, sem vazio, e sem o que == padrão. */
export function sanitizarVocab(raw: unknown): VocabMap {
  const out: VocabMap = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!KEYS.has(k) || typeof v !== "string") continue;
      const clean = v.trim();
      if (clean && clean !== DEFAULTS[k as VocabKey]) out[k as VocabKey] = clean;
    }
  }
  return out;
}

const DOC_KIND = "vocab";
const DOC_KEY = "global";

// ── JSON fallback (clássico/testes) ──────────────────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "vocab.json");
}
function readJson(): VocabMap {
  const p = filePath();
  if (!existsSync(p)) return {};
  try {
    return sanitizarVocab(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return {};
  }
}
function writeJson(map: VocabMap): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── API org-scoped ───────────────────────────────────────────────────────────

/** O vocabulário da org (mapa mínimo de overrides). Nunca lança. */
export async function loadVocab(): Promise<VocabMap> {
  if (!supabaseEnabled()) return readJson();
  return sanitizarVocab(await sbGetDoc<VocabMap | null>(DOC_KIND, DOC_KEY, null));
}

/** Grava o vocabulário (sanitizado) e devolve o mapa que ficou. */
export async function saveVocab(map: VocabMap): Promise<VocabMap> {
  const sane = sanitizarVocab(map);
  if (!supabaseEnabled()) writeJson(sane);
  else await sbSetDoc(DOC_KIND, DOC_KEY, sane);
  return sane;
}
