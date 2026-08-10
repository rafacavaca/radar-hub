/**
 * Modelo do BRAIN NATIVO (D14) — o conhecimento que uma agência-cliente (uma org
 * SEM o OS Formare) constrói na PRÓPRIA org, no molde do Brain do OS: 5 tipos,
 * verdade/referência, confirmado/inferido, com fonte + data. Só o CONFIRMADO
 * alimenta o resto (dossiê, correlação, encaixe) — org-scoped (org_docs + RLS).
 *
 * Honesto por construção: a IA extrai como `inferido` (a dúvida dela, "aguarda
 * você") — só o humano promove a `confirmado`. Nunca vira verdade sozinho.
 *
 * Este ficheiro é PURO (tipos + rótulos) — pode ser importado pelo componente de
 * UI. A lógica com node:crypto/org_docs vive em `store.ts` (server-only).
 */

/** Os 5 tipos de conhecimento (o mesmo eixo da Curadoria do OS). */
export type BrainTipo =
  | "posicionamento"
  | "institucional"
  | "oferta_produto"
  | "concorrentes"
  | "mercado";

/** verdade = canônico (verdade institucional); referencia = apoio confirmado. */
export type BrainAutoridade = "verdade" | "referencia";

/** inferido = a IA extraiu e duvidou (aguarda humano); confirmado = o humano promoveu. */
export type BrainStatus = "confirmado" | "inferido";

/** De onde o item veio (o canal de ingestão). */
export type BrainOrigem = "site" | "upload" | "manual";

export type BrainItem = {
  /** id determinístico (hash de tipo+texto) — re-descobrir NÃO duplica o mesmo fato. */
  id: string;
  texto: string;
  tipo: BrainTipo;
  /** proposta enquanto `inferido`; final quando o humano confirma. */
  autoridade: BrainAutoridade;
  status: BrainStatus;
  origem: BrainOrigem;
  fonte_url?: string;
  fonte_titulo?: string;
  /** ISO — a data de coleta/registro (fonte + data em todo item). */
  data: string;
};

export const BRAIN_TIPOS: BrainTipo[] = [
  "posicionamento",
  "institucional",
  "oferta_produto",
  "concorrentes",
  "mercado",
];

export const BRAIN_TIPO_LABEL: Record<BrainTipo, string> = {
  posicionamento: "Posicionamento",
  institucional: "Institucional",
  oferta_produto: "Oferta & Produto",
  concorrentes: "Concorrentes",
  mercado: "Mercado",
};

export const BRAIN_AUTORIDADE_LABEL: Record<BrainAutoridade, string> = {
  verdade: "Verdade",
  referencia: "Referência",
};

/** Contadores por tipo, pro cabeçalho honesto da Revisar. */
export type BrainTipoStat = { total: number; inferido: number; confirmado: number };
export type BrainStats = {
  itens: number;
  confirmados: number;
  aguardando: number;
  tipos: number;
  fontes: number;
  porTipo: Record<BrainTipo, BrainTipoStat>;
};
