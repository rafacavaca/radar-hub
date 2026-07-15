/**
 * VOCABULÁRIO — núcleo PURO (sem node:fs), seguro pro bundle do CLIENTE.
 * O catálogo de termos + o resolvedor. O store (loadVocab/saveVocab, com fs +
 * Supabase) vive em `@/lib/vocab` e re-exporta tudo daqui. Componentes-cliente
 * importam SEMPRE daqui (`@/lib/vocab-terms`), nunca de `@/lib/vocab`.
 */

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
