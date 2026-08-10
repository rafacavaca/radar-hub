/**
 * ÚLTIMA VISITA por (org, cliente, USUÁRIO) — alimenta o "desde sua última
 * visita" da Visão. Store em `org_docs` (kind `last-visit`, key = cliente), com
 * um mapa { userId: ISO } por dentro — assim é a visita DE CADA UM, não da
 * agência. Org-scoped (RLS + filtro explícito, como os outros stores).
 *
 * Fluxo: a Visão LÊ a última visita (antes de marcar) pra calcular a novidade;
 * um beacon do cliente MARCA `agora` ao abrir a tela (a próxima visita zera o
 * delta). No modo clássico (sem Supabase) é no-op — feature só do modo org.
 */

import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";

const KIND = "last-visit";
type VisitMap = Record<string, string>;

/** A última visita DESTE usuário a ESTE cliente (ISO), ou null se nunca visitou. */
export async function getLastVisit(clientName: string, userId: string): Promise<string | null> {
  if (!clientName || !userId || !supabaseEnabled()) return null;
  const map = await sbGetDoc<VisitMap>(KIND, clientName, {});
  const ts = map?.[userId];
  return typeof ts === "string" ? ts : null;
}

/** Marca `nowIso` como a visita deste usuário a este cliente (merge no mapa). */
export async function markVisit(clientName: string, userId: string, nowIso: string): Promise<void> {
  if (!clientName || !userId || !supabaseEnabled()) return;
  const map = (await sbGetDoc<VisitMap>(KIND, clientName, {})) ?? {};
  map[userId] = nowIso;
  await sbSetDoc(KIND, clientName, map);
}
