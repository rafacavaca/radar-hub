/**
 * AUTOMAÇÕES — o painel único (org-scoped) onde o Rafael liga/desliga o que roda
 * sozinho e escolhe a frequência/dia. Server: carrega a config e computa a
 * próxima execução (fuso Brasil); a AutomacoesView cuida da interação.
 */

import { loadAutomacoes, proximaExecucao } from "@/lib/automacoes";

import { AutomacoesView } from "@/components/automacoes/automacoes-view";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const config = await loadAutomacoes();
  const now = new Date();
  const proximas = {
    digest: proximaExecucao(config.digest, now),
    diagnostico: proximaExecucao(config.diagnostico, now),
  };

  return <AutomacoesView config={config} proximas={proximas} />;
}
