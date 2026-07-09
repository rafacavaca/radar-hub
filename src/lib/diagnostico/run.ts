/**
 * Orquestra o diagnóstico de UM concorrente: Lente 1 (posicionamento) + Lente 2
 * (canais) + Lente 3 (mídia) + Lente 4 (maturidade) + estratégia, monta o
 * schema e salva. On-demand (não é alta-frequência).
 *
 * F1a: cada varredura vira um Snapshot datado; o diff contra a varredura
 * anterior gera Movimento[] (timeline) e alimenta as regras de alerta.
 */

import { runLente1 } from "@/lib/diagnostico/lente1";
import { runLente2 } from "@/lib/diagnostico/lente2";
import { runLente3 } from "@/lib/diagnostico/lente3";
import { runLente4, perfilProvaDe, type PerfilProva } from "@/lib/diagnostico/lente4";
import { runLentePreco } from "@/lib/diagnostico/lente-preco";
import { runLenteReputacao } from "@/lib/diagnostico/lente-reputacao";
import { runCamposCustom } from "@/lib/diagnostico/campos-custom";
import { runLenteVagas } from "@/lib/diagnostico/lente-vagas";
import { runLenteNews } from "@/lib/diagnostico/lente-news";
import { loadDiagConfig } from "@/lib/diagnostico/config";
import { runEstrategia } from "@/lib/diagnostico/estrategia";
import { getDiagnostico, loadDiagnostico, loadDiagnosticos, persistDiagnostico } from "@/lib/diagnostico/store";
import { appendDisparos, getRegras } from "@/lib/diagnostico/alertas-store";
import { avaliarRegras, diffSnapshots, toSnapshot } from "@/lib/diagnostico/movimento";
import { runWithUsage } from "@/lib/usage/context";
import type { DiagnosticoConcorrente, Snapshot } from "@/lib/diagnostico/schema";

const MAX_SNAPSHOTS = 12;
const MAX_MOVIMENTOS = 100;

export async function runDiagnostico(input: {
  clientName: string;
  competitorId: string;
  name: string;
  siteUrl: string;
}): Promise<DiagnosticoConcorrente> {
  const { clientName, competitorId, name, siteUrl } = input;

  // MEDIÇÃO (item 1): tudo deste diagnóstico é atribuído ao CONCORRENTE — é o
  // que dá o "custo marginal de +1 concorrente". Cada lente rotula sua feature.
  return runWithUsage(
    { clientName, feature: "diagnostico", entidadeTipo: "concorrente", entidadeId: competitorId, entidadeNome: name },
    async () => {
      // D — config do usuário (fontes extras, temas, campos custom).
      const config = await loadDiagConfig(clientName, competitorId);

      // Fato (F1): posicionamento + canais. Mídia (F2). Preço + reputação (Onda 1).
      // fontes extras (D) entram no crawl da Lente 1; suas `pages` alimentam os campos custom.
      const { posicionamento, paginas, pages } = await runWithUsage({ feature: "lente_1" }, () => runLente1(name, siteUrl, config.fontesExtras));
      const canais = await runWithUsage({ feature: "lente_2" }, () => runLente2(name, siteUrl, clientName, competitorId));
      const midia_paga = await runWithUsage({ feature: "lente_3" }, () => runLente3(name));
      const preco = await runWithUsage({ etapa: "preco" }, () => runLentePreco(name, siteUrl));
      const reputacao = await runWithUsage({ etapa: "reputacao" }, () => runLenteReputacao(name, siteUrl));
      // D — campos customizados (reusa as páginas já coletadas, sem re-scrape).
      const campos_custom = await runWithUsage({ etapa: "campos_custom" }, () => runCamposCustom(name, pages, config.camposCustom));
      // C2 vagas + C4 releases/notícias — alimentam o motor de movimento.
      const vagas = await runWithUsage({ etapa: "vagas" }, () => runLenteVagas(name, siteUrl));
      const news = await runWithUsage({ etapa: "news" }, () => runLenteNews(name, siteUrl));
      // Opinião + rascunho (F3) por último. Maturidade é RELATIVA: passa os pares
      // (perfil de prova dos outros concorrentes já diagnosticados do cliente).
      const peers: PerfilProva[] = (await loadDiagnosticos(clientName))
        .filter((d) => d.concorrente_id !== competitorId)
        .map((d) => perfilProvaDe(d.concorrente_nome, d.posicionamento));
      const maturidade = await runWithUsage({ feature: "lente_4" }, () => runLente4(name, posicionamento, peers));
      const estrategia = await runWithUsage({ etapa: "estrategia" }, () => runEstrategia(clientName, name, posicionamento, maturidade));

      const diag: DiagnosticoConcorrente = {
        clientName,
        concorrente_id: competitorId,
        concorrente_nome: name,
        site_url: siteUrl,
        atualizado_em: new Date().toISOString(),
        paginas_rastreadas: paginas,
        posicionamento,
        canais,
        midia_paga,
        preco,
        reputacao,
        campos_custom,
        temas_vigiados: config.temas,
        vagas,
        news,
        maturidade,
        estrategia,
      };
      // anterior pré-carregado (org-scoped em modo Supabase) — mantém
      // aplicarMovimentos pura/síncrona (os smokes a testam direto).
      const anterior = await loadDiagnostico(clientName, competitorId);
      return persistDiagnostico(aplicarMovimentos(diag, anterior));
    },
  );
}

/**
 * Re-avalia a MATURIDADE (Lente 4) de TODOS os concorrentes de um cliente,
 * cada um relativo aos demais (perfil de prova como pares) — do posicionamento
 * JÁ salvo, sem re-scrape. Corrige o colapso de notas idênticas quando a lente
 * antiga julgava no vácuo. Nunca lança pelo LLM (cada falha vira nao_avaliado).
 */
export async function reavaliarMaturidadeCliente(clientName: string): Promise<Array<{ nome: string; nivel: string | null; score: number | null; status: string }>> {
  const diags = await loadDiagnosticos(clientName);
  const out: Array<{ nome: string; nivel: string | null; score: number | null; status: string }> = [];
  for (const d of diags) {
    const peers: PerfilProva[] = diags
      .filter((x) => x.concorrente_id !== d.concorrente_id)
      .map((x) => perfilProvaDe(x.concorrente_nome, x.posicionamento));
    const maturidade = await runWithUsage(
      { clientName, feature: "lente_4", entidadeTipo: "concorrente", entidadeId: d.concorrente_id, entidadeNome: d.concorrente_nome },
      () => runLente4(d.concorrente_nome, d.posicionamento, peers),
    );
    d.maturidade = maturidade;
    if (d.historico && d.historico.length > 0) d.historico[d.historico.length - 1].posicionamento = d.posicionamento;
    await persistDiagnostico(d);
    out.push({ nome: d.concorrente_nome, nivel: maturidade.nivel, score: maturidade.score, status: maturidade.status });
  }
  return out;
}

/**
 * F1a (puro, testável): anexa histórico + movimentos ao diagnóstico novo,
 * diffando contra a última varredura salva. Diagnósticos antigos (pré-F1a, sem
 * historico) contam como baseline real — o diff usa a projeção deles.
 *
 * `anterior` é INJETÁVEL (multi-tenant: o chamador passa a versão org-scoped);
 * ausente, cai no JSON síncrono — os smokes seguem chamando com 1 argumento.
 */
export function aplicarMovimentos(
  novo: DiagnosticoConcorrente,
  anterior: DiagnosticoConcorrente | null = getDiagnostico(novo.clientName, novo.concorrente_id),
): DiagnosticoConcorrente {
  const snapshotNovo = toSnapshot(novo);

  const historicoAnterior: Snapshot[] = anterior
    ? (anterior.historico ?? [toSnapshot(anterior)])
    : [];

  const movimentosNovos = diffSnapshots(historicoAnterior, snapshotNovo, novo.atualizado_em);

  const historico = [...historicoAnterior, snapshotNovo].slice(-MAX_SNAPSHOTS);
  const movimentos = [...movimentosNovos, ...(anterior?.movimentos ?? [])].slice(0, MAX_MOVIMENTOS);

  if (movimentosNovos.length > 0) {
    const regras = getRegras(novo.clientName);
    appendDisparos(
      avaliarRegras(regras, movimentosNovos, {
        clientName: novo.clientName,
        concorrenteId: novo.concorrente_id,
        concorrenteNome: novo.concorrente_nome,
      }),
    );
  }

  // battlecard/swot são DERIVADOS sob demanda — re-varrer não pode apagar o existente
  return {
    ...novo,
    historico,
    movimentos,
    battlecard: novo.battlecard ?? anterior?.battlecard ?? null,
    swot: novo.swot ?? anterior?.swot ?? null,
  };
}
