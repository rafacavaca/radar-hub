/**
 * Coletor RD Station — desde a F2 é só um ATALHO para o coletor genérico
 * (`collectBlog`) apontado pra fonte de blog do seed. Mantido porque o smoke F1
 * (`scripts/test-radar-f1.mts`) prova o loop histórico por aqui.
 *
 * A lógica real (listagem -> filtrar posts -> raspar -> RawEvent[]) vive em
 * `src/lib/collectors/blog.ts`, parametrizada pela watchlist (fontes por
 * concorrente desde o ajuste de descoberta de fontes).
 */

import { collectBlog, type CollectBlogOptions } from "@/lib/collectors/blog";
import { WATCHLIST_SEED } from "@/lib/watchlist";
import type { RawEvent } from "@/lib/types";

export type CollectRDStationOptions = CollectBlogOptions;

/** Coleta os posts recentes do blog do RD Station (o concorrente do F1). */
export async function collectRDStation(
  opts: CollectRDStationOptions = {},
): Promise<RawEvent[]> {
  const rdStation = WATCHLIST_SEED.clients[0].competitors[0];
  return collectBlog(rdStation, rdStation.sources[0], opts);
}
