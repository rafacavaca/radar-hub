/**
 * /api/implantacao — marca um parâmetro do REGISTRO da agência como
 * definido/pendente (P13). Só super_admin (a agência é read-only). Ao marcar o
 * primeiro definido, o store carimba a data da implantação.
 *
 * POST { id, status } -> { data: { ficha } }
 */

import { NextResponse } from "next/server";

import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { definirParametro, PARAM_IDS, REGISTRO_KEY, type ParamId } from "@/lib/parametrizacao";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (supabaseEnabled() && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Só um super_admin pode marcar a implantação." }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { id?: string; status?: string } | null;
    const id = body?.id ?? "";
    const status = body?.status;
    if (!(PARAM_IDS as readonly string[]).includes(id) || (status !== "definido" && status !== "pendente")) {
      return NextResponse.json({ error: "Parâmetro ou estado inválido." }, { status: 400 });
    }
    const ficha = await definirParametro(REGISTRO_KEY, id as ParamId, status, new Date());
    return NextResponse.json({ data: { ficha } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao marcar" }, { status: 500 });
  }
}
