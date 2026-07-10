/**
 * PROMOVER prospect → conta-chave (F3). Núcleo testável: o `discover` (descoberta
 * de fontes) é INJETÁVEL — a rota passa o real (`discoverSources`), o smoke passa
 * um fake (sem rede). Dedupe por nome/site: nunca cria uma 2ª entidade da mesma
 * empresa. Marca o prospect como `promovido` (o dossiê continua acessível).
 */

import { addCompetitor, loadWatchlist, slugify, type AddSourceInput } from "@/lib/watchlist";
import { getProspect, patchProspect } from "@/lib/prospects/store";

export type PromoverResult = { contaId: string; jaExistia: boolean };

function mesmoSite(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export async function promoverProspect(
  cliente: string,
  id: string,
  opts: { discover: (site: string) => Promise<AddSourceInput[]> },
): Promise<PromoverResult> {
  const prospect = await getProspect(cliente, id);
  if (!prospect) throw new Error("prospect não encontrado");

  const contaId = slugify(prospect.nome);

  // DEDUPE — já existe essa entidade (por id/nome ou mesmo site)? Não duplica.
  const watchlist = await loadWatchlist();
  const client = watchlist.clients.find((c) => c.name === cliente);
  if (client?.competitors.some((c) => c.id === contaId || mesmoSite(c.siteUrl, prospect.siteUrl))) {
    await patchProspect(cliente, id, { status: "promovido" });
    return { contaId, jaExistia: true };
  }

  // fontes reais (fallback: o site como notícias) e adiciona como conta-chave.
  let sources: AddSourceInput[] = [];
  try {
    sources = await opts.discover(prospect.siteUrl);
  } catch {
    /* fallback abaixo */
  }
  if (sources.length === 0) sources = [{ kind: "noticias", url: prospect.siteUrl }];

  await addCompetitor(cliente, { name: prospect.nome, siteUrl: prospect.siteUrl, sources, pillar: "conta-chave" });
  await patchProspect(cliente, id, { status: "promovido" });
  return { contaId, jaExistia: false };
}
