/**
 * FICHA DE DIAGNÓSTICO por concorrente — renderiza o schema (Lentes 1-2),
 * agrupado: "Posicionamento & Mensagem" + "Presença & Canais". Cada campo
 * mostra SourceRef (fonte) + RecencyStamp (data). Campo/canal não achado
 * aparece como "não encontrado" em cinza — visível, honesto, não escondido.
 *
 * Componente de servidor (render puro). Molde: ficha-conta (mesmo padrão visual).
 */

import type { Campo, CanalAudit, CanalKey, DiagnosticoConcorrente } from "@/lib/diagnostico/schema";
import { CANAL_KEYS } from "@/lib/diagnostico/schema";
import { formatDateShort, formatDateTimePtBR } from "@/lib/format";

import { MovimentosTimeline } from "@/components/movimentos-timeline";
import { RecencyStamp, SourceRef } from "@/components/signal-meta";

const CANAL_LABEL: Record<CanalKey, string> = {
  site: "Site",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  blog: "Blog",
};

const CANAL_STATUS_LABEL: Record<CanalAudit["status"], string> = {
  encontrado: "presente",
  nao_localizado: "não localizado",
  requer_captura_linkedin: "requer captura (botão)",
};

function NaoEncontrado() {
  return <span className="text-sm text-stone-400">— não encontrado</span>;
}

/** Um campo escalar: valor + fonte + data, ou "não encontrado". */
function CampoView({ c, now }: { c: Campo; now: string }) {
  if (c.status !== "encontrado" || !c.valor) return <NaoEncontrado />;
  return (
    <span className="min-w-0">
      <span className="text-sm text-stone-800">{c.valor}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {c.fonte_url ? <SourceRef url={c.fonte_url} titulo={c.valor} /> : null}
        <RecencyStamp publishedAt={c.data_publicacao} collectedAt={c.data_coleta} now={now} />
      </span>
    </span>
  );
}

/** Uma linha rotulada do bloco de posicionamento. */
function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-stone-100 py-2.5 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ListaCampos({ campos, vazio, now }: { campos: Campo[]; vazio: string; now: string }) {
  if (campos.length === 0) return <span className="text-sm text-stone-400">— {vazio}</span>;
  return (
    <ul className="space-y-1.5">
      {campos.map((c, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm text-stone-800">{c.valor}</span>
          {c.fonte_url ? <SourceRef url={c.fonte_url} titulo={c.valor ?? undefined} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function FichaDiagnostico({ diag, now }: { diag: DiagnosticoConcorrente; now: string }) {
  const p = diag.posicionamento;

  return (
    <section
      data-testid="ficha-diagnostico"
      className="rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      {/* cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">{diag.concorrente_nome}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
            <SourceRef url={diag.site_url} />
            <span aria-hidden>·</span>
            <span>atualizado {formatDateTimePtBR(diag.atualizado_em)}</span>
            <span aria-hidden>·</span>
            <span>{diag.paginas_rastreadas.length} página(s) lida(s)</span>
          </p>
        </div>
      </header>

      {/* Movimentos (F1a) — SEMPRE visível, com estado honesto. */}
      {(diag.movimentos?.length ?? 0) > 0 ? (
        <div className="border-b border-stone-100 px-4 py-4 sm:px-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            Movimentos
          </p>
          <MovimentosTimeline movimentos={diag.movimentos!} />
        </div>
      ) : (
        <div className="border-b border-stone-100 px-4 py-3 sm:px-5">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Movimentos</p>
          <p className="mt-1 text-sm text-stone-400">
            {(diag.historico?.length ?? 0) >= 2 ? (
              <>Sem movimentos — nada mudou desde a varredura de {formatDateShort(diag.historico![diag.historico!.length - 2].data)}.</>
            ) : (
              <>Primeira varredura ({formatDateShort(diag.atualizado_em)}) — movimento é comparação entre varreduras; aparece a partir da próxima atualização.</>
            )}
          </p>
        </div>
      )}

      {/* Posicionamento & Mensagem */}
      <div className="px-4 py-4 sm:px-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">Posicionamento &amp; Mensagem</p>
        <Linha label="Tagline"><CampoView c={p.tagline} now={now} /></Linha>
        <Linha label="Propósito"><CampoView c={p.proposito} now={now} /></Linha>
        <Linha label="Posicionamento"><CampoView c={p.posicionamento} now={now} /></Linha>
        <Linha label="Diferenciais"><ListaCampos campos={p.diferenciais} vazio="não encontrados" now={now} /></Linha>
        <Linha label="Produtos">
          {p.produtos.length === 0 ? (
            <span className="text-sm text-stone-400">— não encontrados</span>
          ) : (
            <ul className="space-y-1.5">
              {p.produtos.map((pr, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium text-stone-900">{pr.nome}</span>
                  {pr.descricao ? <span className="text-sm text-stone-600">— {pr.descricao}</span> : null}
                  {pr.fonte_url ? <SourceRef url={pr.fonte_url} titulo={pr.nome} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Linha>
        <Linha label="Clientes"><ListaCampos campos={p.provas.clientes_citados} vazio="nenhum citado" now={now} /></Linha>
        <Linha label="Depoimentos"><CampoView c={p.provas.depoimentos} now={now} /></Linha>
        <Linha label="Premiações"><ListaCampos campos={p.provas.premiacoes} vazio="não encontradas" now={now} /></Linha>
        <Linha label="Big numbers"><ListaCampos campos={p.provas.big_numbers} vazio="não encontrados" now={now} /></Linha>
      </div>

      {/* Presença & Canais */}
      <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Presença &amp; Canais</p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {CANAL_KEYS.map((k: CanalKey) => {
            const ch = diag.canais[k];
            return (
              <div
                key={k}
                className={
                  "rounded-xl border p-3 " +
                  (ch.presente ? "border-stone-200 bg-stone-50/40" : "border-dashed border-stone-200 bg-white")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-900">{CANAL_LABEL[k]}</span>
                  <span className={"text-xs " + (ch.presente ? "text-emerald-700" : "text-stone-400")}>
                    {CANAL_STATUS_LABEL[ch.status]}
                  </span>
                </div>
                {ch.url ? <div className="mt-1"><SourceRef url={ch.url} /></div> : null}
                {ch.recencia?.data_publicacao ? (
                  <div className="mt-1">
                    <RecencyStamp publishedAt={ch.recencia.data_publicacao} collectedAt={ch.recencia.data_coleta} now={now} />
                  </div>
                ) : null}
                {ch.frequencia?.valor || ch.tipo_conteudo?.valor ? (
                  <p className="mt-1 text-xs text-stone-500">
                    {[ch.frequencia?.valor, ch.tipo_conteudo?.valor].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preço & Planos (F1b) — fato; sob_consulta quando o site esconde. */}
      {diag.preco ? (
        <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            Preço &amp; Planos
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                (diag.preco.status === "encontrado"
                  ? "bg-emerald-50 text-emerald-700"
                  : diag.preco.status === "sob_consulta"
                    ? "bg-stone-100 text-stone-500"
                    : "bg-stone-100 text-stone-400")
              }
            >
              {diag.preco.status === "encontrado"
                ? "preço público"
                : diag.preco.status === "sob_consulta"
                  ? "sob consulta"
                  : "sem página de preço"}
            </span>
          </p>
          {diag.preco.planos.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {diag.preco.planos.map((p, i) => (
                <div key={i} className="rounded-xl border border-stone-200 bg-stone-50/40 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-stone-900">{p.plano}</span>
                    {p.periodicidade ? <span className="text-[10px] uppercase tracking-wide text-stone-400">{p.periodicidade}</span> : null}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-stone-800">
                    {p.preco ?? <span className="font-normal text-stone-400">sob consulta</span>}
                  </p>
                  {p.features.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {p.features.slice(0, 4).map((f, j) => (
                        <li key={j} className="text-xs text-stone-500">· {f}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : diag.preco.resumo ? (
            <p className="text-sm text-stone-600">{diag.preco.resumo}</p>
          ) : (
            <p className="text-sm text-stone-400">— nenhuma página de preço pública encontrada no site</p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 text-xs text-stone-400">
            {diag.preco.fonte_url ? <SourceRef url={diag.preco.fonte_url} titulo="página de preços" /> : null}
            <RecencyStamp collectedAt={diag.preco.data_coleta} now={now} />
          </p>
        </div>
      ) : null}

      {/* Reputação (F1c) — nota/nº = fato; temas = derivados de reviews. */}
      {diag.reputacao ? (
        <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            Reputação
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              temas derivados de reviews
            </span>
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {diag.reputacao.fontes.map((f) => {
              const nome = { reclame_aqui: "Reclame Aqui", google: "Google", g2: "G2", capterra: "Capterra" }[f.fonte];
              return (
                <div
                  key={f.fonte}
                  className={
                    "rounded-xl border p-3 " +
                    (f.status === "coletado" ? "border-stone-200 bg-stone-50/40" : "border-dashed border-stone-200 bg-white")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-stone-900">{nome}</span>
                    {f.status === "coletado" ? (
                      <span className="text-sm font-semibold text-stone-800">
                        {f.nota !== null ? `${f.nota}` : "—"}
                        {f.escala ? <span className="ml-1 text-[10px] font-normal text-stone-400">/ {f.escala.split("-")[1]}</span> : null}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400">não coletado</span>
                    )}
                  </div>
                  {f.status === "coletado" ? (
                    <>
                      {f.n_avaliacoes !== null ? (
                        <p className="mt-0.5 text-xs text-stone-500">{f.n_avaliacoes} avaliações</p>
                      ) : null}
                      {f.temas_elogio.length ? (
                        <p className="mt-1.5 text-xs text-stone-600">
                          <span className="font-semibold text-emerald-700">elogios:</span> {f.temas_elogio.join(" · ")}
                        </p>
                      ) : null}
                      {f.temas_reclamacao.length ? (
                        <p className="mt-0.5 text-xs text-stone-600">
                          <span className="font-semibold text-red-700">reclamações:</span> {f.temas_reclamacao.join(" · ")}
                        </p>
                      ) : null}
                      {f.citacoes.length ? (
                        <ul className="mt-1.5 space-y-0.5">
                          {f.citacoes.slice(0, 2).map((c, i) => (
                            <li key={i} className="text-xs italic text-stone-500">“{c}”</li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 text-xs text-stone-400">
                        {f.fonte_url ? <SourceRef url={f.fonte_url} /> : null}
                        <RecencyStamp collectedAt={f.data_coleta} now={now} />
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] leading-snug text-stone-400">{f.observacao}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Campos customizados (D) — definidos pelo usuário, extração honesta. */}
      {diag.campos_custom && diag.campos_custom.length > 0 ? (
        <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            Campos personalizados
            {diag.temas_vigiados && diag.temas_vigiados.length > 0 ? (
              <span className="font-normal normal-case text-stone-400">· temas: {diag.temas_vigiados.join(", ")}</span>
            ) : null}
          </p>
          {diag.campos_custom.map((cc, i) => (
            <Linha key={i} label={cc.chave}>
              <CampoView c={cc.resposta} now={now} />
            </Linha>
          ))}
        </div>
      ) : null}

      {/* Mídia paga (Lente 3, F2) */}
      {diag.midia_paga ? (
        <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Mídia paga</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {(["meta", "linkedin", "google"] as const).map((plat) => {
              const m = diag.midia_paga![plat];
              return (
                <div key={plat} className="rounded-xl border border-stone-200 bg-stone-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize text-stone-900">{plat}</span>
                    <span className={"text-xs " + (m.anuncia ? "text-emerald-700" : "text-stone-400")}>
                      {m.status === "nao_localizado"
                        ? "não localizado"
                        : m.anuncia === false
                          ? "sem anúncios ativos"
                          : m.anuncia
                            ? "anunciando"
                            : "—"}
                    </span>
                  </div>
                  {m.n_anuncios_ativos != null ? (
                    <p className="mt-1 text-sm font-medium text-stone-800">{m.n_anuncios_ativos} anúncio(s) ativo(s)</p>
                  ) : null}
                  {m.mensagens.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {m.mensagens.slice(0, 3).map((msg, i) => (
                        <li key={i} className="text-xs italic text-stone-500">“{msg}”</li>
                      ))}
                    </ul>
                  ) : null}
                  {m.fonte_url ? <div className="mt-1"><SourceRef url={m.fonte_url} titulo="biblioteca de anúncios" /></div> : null}
                  {m.observacao ? <p className="mt-1 text-[11px] leading-snug text-stone-400">{m.observacao}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Maturidade (Lente 4, F3) — OPINIÃO, visualmente distinta do fato. */}
      {diag.maturidade?.status === "avaliado" ? (
        <div className="border-t border-stone-100 bg-amber-50/40 px-4 py-4 sm:px-5">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700">
            Maturidade de comunicação
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">opinião</span>
          </p>
          <p className="text-sm text-stone-800">
            <span className="font-semibold">{diag.maturidade.nivel}</span>
            {diag.maturidade.score != null ? ` · ${diag.maturidade.score}/100` : ""}
          </p>
          <p className="mt-0.5 text-sm text-stone-600">{diag.maturidade.evidencia}</p>
        </div>
      ) : null}

      {/* Estratégia (F3) — RASCUNHO, o estrategista decide. */}
      {diag.estrategia?.status === "rascunhado" ? (
        <div className="rounded-b-2xl border-t border-stone-100 bg-sky-50/30 px-4 py-4 sm:px-5">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-sky-800">
            Leitura estratégica
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">rascunho — o estrategista decide</span>
          </p>
          {diag.estrategia.percepcao_atual ? (
            <p className="text-sm text-stone-700"><span className="text-stone-400">Percepção atual: </span>{diag.estrategia.percepcao_atual}</p>
          ) : null}
          {diag.estrategia.caminhos.length ? (
            <div className="mt-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Caminhos p/ diferenciar</p>
              <ul className="mt-0.5 space-y-0.5">
                {diag.estrategia.caminhos.map((c, i) => <li key={i} className="text-sm text-stone-700">• {c}</li>)}
              </ul>
            </div>
          ) : null}
          {diag.estrategia.recomendacoes.length ? (
            <div className="mt-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Recomendações (rascunho)</p>
              <ul className="mt-0.5 space-y-0.5">
                {diag.estrategia.recomendacoes.map((c, i) => <li key={i} className="text-sm text-stone-700">• {c}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
