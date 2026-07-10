/**
 * /api/prospects/concorrentes — CURADORIA de concorrentes (feedback do Rafael).
 * Indicar manual + confirmar/descartar sugestões. É BARATO (só edita o doc de
 * curadoria org-scoped; não re-gera o dossiê nem gasta crédito).
 *
 * POST { cliente, id, acao }:
 *   - "add"      { nome, nota? }  → adiciona concorrente manual
 *   - "remover"  { nome }         → remove um manual
 *   - "confirmar"{ nome }         → valida uma sugestão (mantém)
 *   - "descartar"{ nome }         → descarta uma sugestão (some)
 *   - "reabrir"  { nome }         → volta uma sugestão a pendente (tira de conf/rej)
 * -> { data: { curadoria } }
 */

import { NextResponse, type NextRequest } from "next/server";

import { getProspect, loadCuradoria, saveCuradoria } from "@/lib/prospects/store";
import type { CuradoriaConcorrentes } from "@/lib/prospects/schema";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const cliente = typeof body?.cliente === "string" ? body.cliente.trim() : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const acao = typeof body?.acao === "string" ? body.acao : "";
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";
  if (!cliente || !id || !acao || !nome) {
    return NextResponse.json({ error: "Envie cliente, id, acao e nome." }, { status: 400 });
  }
  // valida que o prospect é da org (o store já é org-scoped; isto é 404 honesto).
  if (!(await getProspect(cliente, id))) {
    return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  }

  const cur: CuradoriaConcorrentes = await loadCuradoria(id);
  const n = norm(nome);

  switch (acao) {
    case "add": {
      const nota = typeof body?.nota === "string" ? body.nota.trim() : "";
      if (!cur.manuais.some((m) => norm(m.nome) === n)) {
        cur.manuais.push({ nome, ...(nota ? { nota } : {}) });
      }
      cur.rejeitados = cur.rejeitados.filter((r) => norm(r) !== n); // indicar destrava rejeição
      break;
    }
    case "remover":
      cur.manuais = cur.manuais.filter((m) => norm(m.nome) !== n);
      break;
    case "confirmar":
      if (!cur.confirmados.some((c) => norm(c) === n)) cur.confirmados.push(nome);
      cur.rejeitados = cur.rejeitados.filter((r) => norm(r) !== n);
      break;
    case "descartar":
      if (!cur.rejeitados.some((r) => norm(r) === n)) cur.rejeitados.push(nome);
      cur.confirmados = cur.confirmados.filter((c) => norm(c) !== n);
      break;
    case "reabrir":
      cur.confirmados = cur.confirmados.filter((c) => norm(c) !== n);
      cur.rejeitados = cur.rejeitados.filter((r) => norm(r) !== n);
      break;
    default:
      return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  }

  await saveCuradoria(id, cur);
  return NextResponse.json({ data: { curadoria: cur } });
}
