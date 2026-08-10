/**
 * /api/base — a BASE DE CONHECIMENTO NATIVA de um cliente (D14). Três ações:
 *   { acao: "descobrir", cliente, siteUrl? }  → lê o site (Lente 1) → itens inferidos
 *   { acao: "confirmar", cliente, id, autoridade } → promove inferido→confirmado
 *   { acao: "descartar", cliente, id }        → remove um item
 *
 * Org-scoped: o store usa a org do contexto (RLS + filtro). Guard extra: o
 * cliente precisa existir na watchlist DA ORG (404 caso contrário). Descobrir é
 * caro (Firecrawl+LLM) → rate-limit por org + custo medido em descobrirDoSite.
 */

import { NextResponse, type NextRequest } from "next/server";

import { descobrirDoSite } from "@/lib/brain-nativo/descobrir";
import {
  addBrainItems,
  brainItemId,
  confirmBrainItem,
  discardBrainItem,
  loadBrainSite,
  saveBrainSite,
} from "@/lib/brain-nativo/store";
import { BRAIN_TIPOS, type BrainTipo } from "@/lib/brain-nativo/schema";
import { currentOrgId } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { LIMITES, rateLimit, respostaRateLimit } from "@/lib/rate-limit";
import { loadWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a descoberta lê o site (Firecrawl) + LLM

export async function POST(req: NextRequest) {
  if (!supabaseEnabled()) {
    return NextResponse.json({ error: "Base de conhecimento disponível só no modo org." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    acao?: string;
    cliente?: string;
    siteUrl?: string;
    id?: string;
    autoridade?: string;
    texto?: string;
    tipo?: string;
  } | null;

  const acao = body?.acao;
  const cliente = (body?.cliente ?? "").trim();
  if (!cliente) return NextResponse.json({ error: "Cliente ausente." }, { status: 400 });

  // o cliente precisa ser da org do contexto (org-scoped por natureza + UX honesta)
  const watchlist = await loadWatchlist();
  const client = watchlist.clients.find((c) => c.name === cliente);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado nesta org." }, { status: 404 });

  try {
    if (acao === "descobrir") {
      const org = (await currentOrgId()) ?? "sem-org";
      const rl = rateLimit(`brain:${org}`, LIMITES.dossie.limit, LIMITES.dossie.windowMs);
      if (rl.limited) return respostaRateLimit(rl);
      let siteUrl = (body?.siteUrl ?? "").trim();
      if (!siteUrl) siteUrl = await loadBrainSite(cliente); // lembra o último site
      if (!siteUrl) {
        return NextResponse.json({ error: "Informe o site do cliente pra descobrir." }, { status: 400 });
      }
      await saveBrainSite(cliente, siteUrl);
      const res = await descobrirDoSite(cliente, siteUrl);
      return NextResponse.json({ data: res });
    }

    if (acao === "confirmar") {
      const id = (body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "id ausente." }, { status: 400 });
      const autoridade = body?.autoridade === "referencia" ? "referencia" : "verdade";
      await confirmBrainItem(cliente, id, autoridade);
      return NextResponse.json({ data: { ok: true } });
    }

    if (acao === "descartar") {
      const id = (body?.id ?? "").trim();
      if (!id) return NextResponse.json({ error: "id ausente." }, { status: 400 });
      await discardBrainItem(cliente, id);
      return NextResponse.json({ data: { ok: true } });
    }

    if (acao === "adicionar") {
      // entrada GUIADA/manual: o que só a agência sabe (voz, regras, ICP). Vem da
      // fonte humana → entra CONFIRMADO. Se já existia (inferido), é promovido.
      const texto = (body?.texto ?? "").replace(/\s+/g, " ").trim();
      if (!texto) return NextResponse.json({ error: "Escreva o conhecimento." }, { status: 400 });
      const tipo: BrainTipo =
        typeof body?.tipo === "string" && (BRAIN_TIPOS as string[]).includes(body.tipo)
          ? (body.tipo as BrainTipo)
          : "posicionamento";
      const autoridade = body?.autoridade === "referencia" ? "referencia" : "verdade";
      const id = brainItemId(tipo, texto);
      const { added } = await addBrainItems(cliente, [
        { id, texto, tipo, autoridade, status: "confirmado", origem: "manual", data: new Date().toISOString() },
      ]);
      if (added === 0) await confirmBrainItem(cliente, id, autoridade); // já existia → promove
      return NextResponse.json({ data: { ok: true } });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
