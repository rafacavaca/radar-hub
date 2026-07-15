/**
 * PARAMETRIZAÇÃO — a Ficha de um cliente dentro do Radar, organizada pelos 5
 * grupos do motor (QUEM OBSERVAMOS · DE ONDE VEM · COMO LEMOS · COMO CHEGA ·
 * COMO FALAMOS). Não é uma tela de "configurações": é a peça que a agência
 * mostra dizendo "este é o SEU critério, dentro do Radar".
 *
 * Reúne os editores que já existem (Monitorar, Analistas, Alertas), embutidos e
 * escopados a ESTE cliente; os parâmetros que valem pra agência inteira
 * (cadência, destinatários) aparecem com resumo honesto + link. Cada parâmetro
 * tem selo PENDENTE/DEFINIDO — nunca um default silencioso.
 *
 * Server component: só leitura e enquadramento (a troca de conta é pela sidebar
 * ou pelo seletor no topo). Org-scoped em todas as cargas.
 */

import Link from "next/link";

import { brainOwnerOrgId, isBrainDoorConfigured } from "@/lib/brain";
import { currentOrgId } from "@/lib/db/session";
import { loadAutomacoes, proximaExecucao } from "@/lib/automacoes";
import { loadDisparos, loadRegras } from "@/lib/diagnostico/alertas-store";
import { loadLenses } from "@/lib/lenses";
import { loadParametrizacao, completude, statusDe, type ParamId, type Parametrizacao } from "@/lib/parametrizacao";
import { loadSourceStatus } from "@/lib/source-status";
import { loadWatchlist, pillarOf } from "@/lib/watchlist";

import { AlertasDiagnostico } from "@/components/alertas-diagnostico";
import { LensConfigEditor } from "@/components/lens-config-editor";
import { WatchlistEditor } from "@/components/watchlist-editor";

export const dynamic = "force-dynamic";

function dataPtBR(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

/** Selo honesto de estado do parâmetro. */
function Selo({ ficha, id }: { ficha: Parametrizacao; id: ParamId }) {
  const definido = statusDe(ficha, id) === "definido";
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] " +
        (definido ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200")
      }
    >
      {definido ? "definido" : "pendente"}
    </span>
  );
}

/** Cabeçalho de um dos 5 grupos do motor. */
function Grupo({ eixo, hint, children }: { eixo: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="border-b border-stone-200 pb-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-800">{eixo}</h2>
        <p className="mt-0.5 text-[12px] text-stone-400">{hint}</p>
      </div>
      <div className="mt-5 space-y-6">{children}</div>
    </section>
  );
}

/** Bloco de um parâmetro: nome + selo (+ "vale p/ agência") + conteúdo. */
function Param({
  ficha,
  id,
  nome,
  agencia = false,
  children,
}: {
  ficha: Parametrizacao;
  id: ParamId;
  nome: string;
  agencia?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-stone-900">{nome}</h3>
        <Selo ficha={ficha} id={id} />
        {agencia ? (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 ring-1 ring-stone-200">
            vale p/ toda a agência
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Cartão neutro pros resumos/placeholders (parâmetros ainda não-embutidos). */
function Nota({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-[13px] text-stone-600">{children}</div>;
}

export default async function ParametrizacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  const params = await searchParams;
  const watchlist = await loadWatchlist();
  const allClients = watchlist.clients.map((c) => c.name);
  const cliente = params.cliente && allClients.includes(params.cliente) ? params.cliente : (allClients[0] ?? "");

  if (!cliente) {
    return (
      <section className="mx-auto max-w-[900px] px-5 py-8 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Parametrização</p>
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-base font-medium text-stone-700">Nenhum cliente ainda.</p>
          <p className="mt-1 text-sm text-stone-500">
            Use o <span className="font-medium text-stone-700">“+ Novo cliente”</span> no rodapé da barra lateral para começar.
          </p>
        </div>
      </section>
    );
  }

  const [sourceStatus, lensesFile, regras, disparos, automacoes, ficha, orgId] = await Promise.all([
    loadSourceStatus(),
    loadLenses(),
    loadRegras(cliente),
    loadDisparos(cliente),
    loadAutomacoes(),
    loadParametrizacao(cliente),
    currentOrgId(),
  ]);
  const now = new Date();

  const clientObj = watchlist.clients.find((c) => c.name === cliente)!;
  const scopedConc = { clients: [{ ...clientObj, competitors: clientObj.competitors.filter((k) => pillarOf(k, clientObj.mode) === "concorrente") }] };
  const scopedConta = { clients: [{ ...clientObj, competitors: clientObj.competitors.filter((k) => pillarOf(k, clientObj.mode) === "conta-chave") }] };
  const scopedLenses = { clients: lensesFile.clients.filter((c) => c.clientName === cliente) };

  // P4: dono do Brain do Formare lê pela porta; as demais agências operam em modo reduzido (base local chega no Lote ⑤).
  const brainDono = isBrainDoorConfigured() && !!brainOwnerOrgId() && orgId === brainOwnerOrgId();

  const comp = completude(ficha);
  const q = `?cliente=${encodeURIComponent(cliente)}`;

  return (
    <section className="mx-auto max-w-[900px] px-5 py-8 sm:px-6">
      {/* seletor de conta (a sidebar também troca) */}
      {allClients.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allClients.map((name) => (
            <Link
              key={name}
              href={`/parametrizacao?cliente=${encodeURIComponent(name)}`}
              className={
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors " +
                (name === cliente ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")
              }
            >
              {name}
            </Link>
          ))}
        </div>
      ) : null}

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Parametrização</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-stone-900">{cliente}</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13px] text-stone-500">
          O critério desta agência dentro do Radar — quem observamos, de onde vem, como lemos, como chega e como falamos.
          Cada parâmetro começa <span className="font-medium text-amber-700">pendente</span> até ser revisado na implantação.
        </p>

        {/* proveniência + completude */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-[12px] text-stone-500">
          <span>
            Implantação: <span className="font-medium text-stone-700">{ficha.implantadoEm ? dataPtBR(ficha.implantadoEm) : "pendente"}</span>
          </span>
          <span>
            Revisado: <span className="font-medium text-stone-700">{dataPtBR(ficha.revisadoEm)}</span>
          </span>
          <span className="ml-auto">
            <span className="font-medium text-stone-700">{comp.definidos}</span>/{comp.total} definidos
          </span>
        </div>
      </header>

      {/* ── QUEM OBSERVAMOS ─────────────────────────────────────────────── */}
      <Grupo eixo="Quem observamos" hint="O cliente, os concorrentes, as contas-chave e a base de conhecimento.">
        <Param ficha={ficha} id="clientes" nome="Cliente monitorado">
          <Nota>
            <span className="font-medium text-stone-800">{cliente}</span> — a conta cujo mercado o Radar acompanha.
          </Nota>
        </Param>

        <Param ficha={ficha} id="base_conhecimento" nome="Base de conhecimento">
          <Nota>
            {brainDono ? (
              <>Lê o <span className="font-medium text-stone-800">Brain do Formare</span> pela porta de leitura (só conhecimento confirmado).</>
            ) : (
              <>Sem base de conhecimento própria ainda — a agência opera em <span className="font-medium text-stone-800">modo reduzido honesto</span>. O editor da base local da implantação chega em breve.</>
            )}
          </Nota>
        </Param>

        <Param ficha={ficha} id="concorrentes" nome="Concorrentes">
          <WatchlistEditor initial={scopedConc} sourceStatus={sourceStatus} pillar="concorrente" />
        </Param>

        <Param ficha={ficha} id="contas_chave" nome="Contas-chave">
          <WatchlistEditor initial={scopedConta} sourceStatus={sourceStatus} pillar="conta-chave" />
        </Param>
      </Grupo>

      {/* ── DE ONDE VEM ─────────────────────────────────────────────────── */}
      <Grupo eixo="De onde vem" hint="As fontes que o Radar varre e os temas de mercado.">
        <Param ficha={ficha} id="fontes_temas" nome="Fontes e temas">
          <Nota>
            As <span className="font-medium text-stone-800">fontes</span> de cada concorrente e conta-chave são definidas acima, em cada card
            (“Descobrir fontes”). Os <span className="font-medium text-stone-800">temas de mercado</span> ficam editáveis aqui em breve.
          </Nota>
        </Param>
      </Grupo>

      {/* ── COMO LEMOS ──────────────────────────────────────────────────── */}
      <Grupo eixo="Como lemos" hint="As áreas que leem cada sinal, suas regras, e a régua de prioridade.">
        <Param ficha={ficha} id="areas_ativas" nome="Áreas ativas · regras">
          <p className="-mt-1 mb-2 text-[12px] text-stone-400">
            Comercial, Produto e Marketing — ligue/desligue e ajuste a régua de cada uma (P5 · P6).
          </p>
          <LensConfigEditor initial={scopedLenses} />
        </Param>

        <Param ficha={ficha} id="regua_prioridade" nome="Régua de prioridade · corte de ruído">
          <Nota>
            Hoje no <span className="font-medium text-stone-800">padrão do sistema</span>: prioridade Alta a partir de 70, Média a partir de 40.
            Não há piso de severidade — a régua de cada área é que filtra o ruído. Edição por-agência chega na Fase 1.5.
          </Nota>
        </Param>
      </Grupo>

      {/* ── COMO CHEGA ──────────────────────────────────────────────────── */}
      <Grupo eixo="Como chega" hint="Com que frequência varre e resume, pra quem, e quais alertas disparam.">
        <Param ficha={ficha} id="cadencia" nome="Cadência" agencia>
          <Nota>
            Varredura de concorrentes: <span className="font-medium text-stone-800">{proximaExecucao(automacoes.diagnostico, now)}</span> ·
            Resumo do dia: <span className="font-medium text-stone-800">{proximaExecucao(automacoes.digest, now)}</span>.{" "}
            <Link href="/automacoes" className="font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">Ajustar em Automações →</Link>
          </Nota>
        </Param>

        <Param ficha={ficha} id="destinatarios" nome="Destinatários" agencia>
          <Nota>
            O destinatário do resumo por e-mail é configurado por agência.{" "}
            <Link href="/admin" className="font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900">Ajustar em Admin →</Link>
          </Nota>
        </Param>

        <Param ficha={ficha} id="alertas" nome="Alertas">
          <AlertasDiagnostico cliente={cliente} regrasIniciais={regras} disparos={disparos} />
        </Param>
      </Grupo>

      {/* ── COMO FALAMOS ────────────────────────────────────────────────── */}
      <Grupo eixo="Como falamos" hint="O vocabulário que a agência vê no Radar.">
        <Param ficha={ficha} id="rotulos" nome="Rótulos da agência">
          <Nota>Renomear os termos que a agência vê (Concorrente, Área, Prioridade…) chega no próximo lote.</Nota>
        </Param>
      </Grupo>

      <p className="mt-10 border-t border-stone-200 pt-4 text-[12px] text-stone-400">
        Esqueleto da Ficha (Lote ②). Próximos lotes: rótulos por-agência, temas editáveis, selos “marcar definido” e a base de conhecimento local.
      </p>
    </section>
  );
}
