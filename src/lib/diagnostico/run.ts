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
import { runLente4 } from "@/lib/diagnostico/lente4";
import { runLentePreco } from "@/lib/diagnostico/lente-preco";
import { runLenteReputacao } from "@/lib/diagnostico/lente-reputacao";
import { runCamposCustom } from "@/lib/diagnostico/campos-custom";
import { runLenteVagas } from "@/lib/diagnostico/lente-vagas";
import { runLenteNews } from "@/lib/diagnostico/lente-news";
import { getDiagConfig } from "@/lib/diagnostico/config";
import { runEstrategia } from "@/lib/diagnostico/estrategia";
import { getDiagnostico, saveDiagnostico } from "@/lib/diagnostico/store";
import { appendDisparos, getRegras } from "@/lib/diagnostico/alertas-store";
import { avaliarRegras, diffSnapshots, toSnapshot } from "@/lib/diagnostico/movimento";
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

  // D — config do usuário (fontes extras, temas, campos custom).
  const config = getDiagConfig(clientName, competitorId);

  // Fato (F1): posicionamento + canais. Mídia (F2). Preço + reputação (Onda 1).
  // fontes extras (D) entram no crawl da Lente 1; suas `pages` alimentam os campos custom.
  const { posicionamento, paginas, pages } = await runLente1(name, siteUrl, config.fontesExtras);
  const canais = await runLente2(name, siteUrl, clientName, competitorId);
  const midia_paga = await runLente3(name);
  const preco = await runLentePreco(name, siteUrl);
  const reputacao = await runLenteReputacao(name, siteUrl);
  // D — campos customizados (reusa as páginas já coletadas, sem re-scrape).
  const campos_custom = await runCamposCustom(name, pages, config.camposCustom);
  // C2 vagas + C4 releases/notícias — alimentam o motor de movimento.
  const vagas = await runLenteVagas(name, siteUrl);
  const news = await runLenteNews(name, siteUrl);
  // Opinião + rascunho (F3) por último.
  const maturidade = await runLente4(name, posicionamento);
  const estrategia = await runEstrategia(clientName, name, posicionamento, maturidade);

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
  return saveDiagnostico(aplicarMovimentos(diag));
}

/**
 * F1a (puro, testável): anexa histórico + movimentos ao diagnóstico novo,
 * diffando contra a última varredura salva. Diagnósticos antigos (pré-F1a, sem
 * historico) contam como baseline real — o diff usa a projeção deles.
 */
export function aplicarMovimentos(novo: DiagnosticoConcorrente): DiagnosticoConcorrente {
  const anterior = getDiagnostico(novo.clientName, novo.concorrente_id);
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
