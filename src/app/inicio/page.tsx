/**
 * INÍCIO — a Home do Radar (landing pós-login; nunca cai num cliente aleatório).
 * DUAS ZONAS, com fronteira clara (não misturar os dois chapéus do dono):
 *   Zona A "O negócio" — SÓ super_admin, CROSS-ORG (plataforma). Gate no SERVIDOR.
 *   Zona B "Meus clientes" — ORG-SCOPED, todo mundo vê o seu (cockpit de saúde).
 *
 * Reuso: o cockpit usa o MESMO digest do Hoje (rollup por cliente) e a medição
 * do /custo; não recria o Hoje — linka pra ele pros itens do dia.
 */

import { isSuperAdmin } from "@/lib/db/session";
import { supabaseEnabled } from "@/lib/db/supabase";
import { loadCockpit } from "@/lib/inicio/cockpit";
import { loadNegocio, type NegocioResumo } from "@/lib/inicio/negocio";
import { InicioView } from "@/components/inicio/inicio-view";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const now = new Date();
  // Gate da Zona A no SERVIDOR: super_admin no modo Supabase; dono no clássico.
  const podeVerNegocio = supabaseEnabled() ? await isSuperAdmin() : true;

  const [cockpit, negocio] = await Promise.all([
    loadCockpit(now),
    podeVerNegocio ? loadNegocio(now).catch(() => null) : Promise.resolve<NegocioResumo | null>(null),
  ]);

  return <InicioView cockpit={cockpit} negocio={negocio} agora={now.toISOString()} />;
}
