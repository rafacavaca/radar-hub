/**
 * /api/implantacao/import — importa a FICHA da implantação (contrato v1). Só
 * super_admin (server-verified); aplica SEMPRE na org da sessão (uma Ficha nunca
 * cruza orgs). Dois modos, nunca um sem o outro:
 *   - `preview`: parseia + DIFERENCIA (o que vai mudar) — read-only, não grava.
 *   - `apply`:   parseia + APLICA só os `definido` e devolve o relatório honesto.
 *
 * POST { json: string|object, mode: "preview"|"apply" }
 *   preview → { data: { diff } }   |   apply → { data: { report } }
 */

import { NextResponse } from "next/server";

import { isSuperAdmin, currentOrgId, supabaseRouteClient } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { applyFicha, diffFicha, loadCurrentState, parseFicha } from "@/lib/implantacao/ficha";

export const dynamic = "force-dynamic";

async function orgName(): Promise<string | undefined> {
  if (!supabaseEnabled()) return undefined;
  try {
    const orgId = await currentOrgId();
    if (!orgId) return undefined;
    const sb = await supabaseRouteClient();
    const { data } = await sb.from("orgs").select("name").eq("id", orgId).maybeSingle();
    return (data?.name as string) || undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  if (supabaseEnabled() && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Só um super_admin pode importar a Ficha da implantação." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { json?: unknown; mode?: unknown } | null;
  const mode = body?.mode === "apply" ? "apply" : "preview";

  const parsed = parseFicha(body?.json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    if (mode === "preview") {
      const [current, nome] = await Promise.all([loadCurrentState(), orgName()]);
      const diff = diffFicha(parsed.ficha, current, nome);
      return NextResponse.json({ data: { diff } });
    }
    const report = await applyFicha(parsed.ficha, new Date());
    return NextResponse.json({ data: { report } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha no import" }, { status: 500 });
  }
}
