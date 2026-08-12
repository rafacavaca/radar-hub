/**
 * HISTÓRICO (ritual) — a superfície separada dos estados do Hoje: o que foi
 * Atuado/Adiado/Ignorado/Arquivado, por estado, com data. O inbox do Hoje segue
 * curado; isto é o arquivo (durável, org-scoped). Server: lista os registros.
 */

import { calcularBalanco } from "@/lib/balanco";
import { listarHistorico } from "@/lib/briefing-estado";

import { HistoricoView } from "@/components/historico/historico-view";

export const dynamic = "force-dynamic";

export default async function HistoricoPage() {
  const now = new Date();
  const registros = await listarHistorico();
  const balancos = {
    30: calcularBalanco(registros, 30, now),
    60: calcularBalanco(registros, 60, now),
    90: calcularBalanco(registros, 90, now),
  };
  return (
    <div className="mx-auto max-w-[860px] px-5 py-8 sm:px-6">
      <HistoricoView registros={registros} balancos={balancos} />
    </div>
  );
}
