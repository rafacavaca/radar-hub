/**
 * ESTADOS DO BRIEFING (ritual diário, F1) — o inbox se PROCESSA: cada item do
 * digest pode ser marcado Atuado, Ignorado ou Adiado.
 *
 *  - Atuado/Ignorado: o item sai do digest (fica no histórico do dia gerado).
 *  - Adiado: o item VOLTA no digest de amanhã. O registro carrega um SNAPSHOT
 *    do item — mesmo que ele já não esteja no material do dia seguinte (cache
 *    novo), o adiado reaparece íntegro, com fonte e data originais.
 *
 * Store: JSON clássico (data/briefing-estado.json) ou org_docs (kind
 * `briefing-estado`, key "global") — mesmo padrão dos outros dispatchers.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { localDayKey } from "@/lib/schedules";
import type { DigestItem } from "@/lib/digest";

export type BriefingEstado = "atuado" | "ignorado" | "adiado";

export type EstadoRegistro = {
  estado: BriefingEstado;
  /** quando foi marcado (ISO). */
  em: string;
  /** adiado: dia local (YYYY-MM-DD) a partir do qual volta ao digest. */
  ate?: string;
  /** adiado: snapshot do item, pra reaparecer íntegro amanhã. */
  item?: DigestItem;
};

export type EstadosFile = Record<string, EstadoRegistro>;

/** Cap do store — registros mais antigos saem primeiro (é inbox, não arquivo). */
const MAX_REGISTROS = 800;
const DOC_KIND = "briefing-estado";
const DOC_KEY = "global";

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "briefing-estado.json");
}

function readFileSafe(): EstadosFile {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { estados?: EstadosFile };
    return parsed?.estados && typeof parsed.estados === "object" ? parsed.estados : {};
  } catch {
    return {};
  }
}

function writeFileSafe(estados: EstadosFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ estados }, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Aplica o cap mantendo os registros mais RECENTES (por `em`). */
function comCap(estados: EstadosFile): EstadosFile {
  const entries = Object.entries(estados);
  if (entries.length <= MAX_REGISTROS) return estados;
  entries.sort((a, b) => b[1].em.localeCompare(a[1].em));
  return Object.fromEntries(entries.slice(0, MAX_REGISTROS));
}

/** Dia local seguinte (YYYY-MM-DD, fuso Brasil) — quando o Adiado volta. */
export function proximoDiaLocal(now: Date): string {
  return localDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** Todos os estados marcados, na org do contexto (ou JSON). Nunca lança. */
export async function loadEstados(): Promise<EstadosFile> {
  if (!supabaseEnabled()) return readFileSafe();
  return sbGetDoc<EstadosFile>(DOC_KIND, DOC_KEY, {});
}

/**
 * Marca o estado de um item do digest. `item` é obrigatório no Adiado (é o
 * snapshot que volta amanhã). Devolve o registro gravado.
 */
export async function setEstado(
  itemId: string,
  estado: BriefingEstado,
  opts: { now?: Date; item?: DigestItem } = {},
): Promise<EstadoRegistro> {
  const now = opts.now ?? new Date();
  if (estado === "adiado" && !opts.item) {
    throw new Error("Adiar precisa do item (é o snapshot que reaparece amanhã).");
  }
  const registro: EstadoRegistro = {
    estado,
    em: now.toISOString(),
    ...(estado === "adiado" ? { ate: proximoDiaLocal(now), item: opts.item } : {}),
  };
  const estados = comCap({ ...(await loadEstados()), [itemId]: registro });
  if (!supabaseEnabled()) writeFileSafe(estados);
  else await sbSetDoc(DOC_KIND, DOC_KEY, estados);
  return registro;
}
