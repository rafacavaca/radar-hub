/**
 * IMPLANTAÇÃO — o REGISTRO do critério da agência dentro do Radar (org-level).
 * Não é tela operacional: é o documento da implantação, ativo de venda. A
 * agência VÊ (read-only); só o super_admin ajusta (os links de edição só
 * aparecem pra ele). Dois níveis:
 *   1) Critério da agência — como lemos e recebemos (vale p/ todas as contas).
 *   2) Quem observamos — por conta: concorrentes, contas-chave, base, áreas.
 *
 * Operacional (adicionar concorrente, afinar régua) continua nas abas do
 * cliente — aqui só o retrato + a proveniência da implantação.
 */

import Link from "next/link";

import { brainOwnerOrgId, isBrainDoorConfigured } from "@/lib/brain";
import { loadAutomacoes, proximaExecucao } from "@/lib/automacoes";
import { currentOrgId, isSuperAdmin, supabaseRouteClient } from "@/lib/db/session";
import { sbGetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { LENS_DEFAULTS, LENS_IDS, LENS_LABEL, loadLenses } from "@/lib/lenses";
import { completude, loadParametrizacao, REGISTRO_KEY, statusDe, type ParamId, type Parametrizacao } from "@/lib/parametrizacao";
import { loadVocab, rotulo, VOCAB_TERMS } from "@/lib/vocab";
import { loadWatchlist, pillarOf } from "@/lib/watchlist";

import { VocabEditor } from "@/components/vocab-editor";

export const dynamic = "force-dynamic";

function dataPtBR(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

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

/** Cabeçalho de um dos dois NÍVEIS. */
function Nivel({ n, titulo, hint, children }: { n: string; titulo: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline gap-2 border-b border-stone-200 pb-2">
        <span className="text-[12px] font-semibold text-stone-400">{n}</span>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-800">{titulo}</h2>
      </div>
      <p className="mt-1 text-[12px] text-stone-400">{hint}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

/** Um parâmetro do critério: nome + selo + conteúdo (read-only). */
function Item({ ficha, id, nome, editar, children }: { ficha: Parametrizacao; id: ParamId; nome: string; editar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-stone-900">{nome}</h3>
        <Selo ficha={ficha} id={id} />
        {editar ? <span className="ml-auto">{editar}</span> : null}
      </div>
      <div className="text-[13px] text-stone-600">{children}</div>
    </div>
  );
}

function Ajustar({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-900">
      {label} →
    </Link>
  );
}

export default async function ImplantacaoPage() {
  const orgId = await currentOrgId();
  const superAdmin = supabaseEnabled() ? await isSuperAdmin() : true;

  const [watchlist, lensesFile, automacoes, ficha, vocab] = await Promise.all([
    loadWatchlist(),
    loadLenses(),
    loadAutomacoes(),
    loadParametrizacao(REGISTRO_KEY),
    loadVocab(),
  ]);
  const now = new Date();

  // nome da agência (RLS deixa o membro ver a própria org) + e-mail do digest
  let orgName = "sua agência";
  let emailTo: string | undefined;
  if (supabaseEnabled() && orgId) {
    try {
      const sb = await supabaseRouteClient();
      const { data: orgRow } = await sb.from("orgs").select("name").eq("id", orgId).maybeSingle();
      if (orgRow?.name) orgName = orgRow.name as string;
    } catch {
      /* degrada pro fallback */
    }
    emailTo = (await sbGetDoc<{ emailTo?: string }>("org-config", "digest", {})).emailTo;
  }

  const brainDono = isBrainDoorConfigured() && !!brainOwnerOrgId() && orgId === brainOwnerOrgId();
  const comp = completude(ficha);

  const lensesDe = (name: string) => lensesFile.clients.find((c) => c.clientName === name)?.lenses ?? [];

  return (
    <section className="mx-auto max-w-[1000px] px-5 py-8 sm:px-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Implantação</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-stone-900">
          O critério da {orgName} dentro do Radar
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-[13px] text-stone-500">
          O que o Radar observa e como pensa, definido na implantação. Cada definição começa{" "}
          <span className="font-medium text-amber-700">pendente</span> até ser revisada.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-[12px] text-stone-500">
          <span>
            Parametrizado na implantação de <span className="font-medium text-stone-700">{ficha.implantadoEm ? dataPtBR(ficha.implantadoEm) : "—"}</span>
          </span>
          <span>
            Revisado <span className="font-medium text-stone-700">{dataPtBR(ficha.revisadoEm)}</span>
          </span>
          <span className="ml-auto">
            <span className="font-medium text-stone-700">{comp.definidos}</span>/{comp.total} definidos
          </span>
        </div>
        {!superAdmin ? (
          <p className="mt-2 text-[12px] text-stone-400">Para ajustar qualquer definição, fale com a gente.</p>
        ) : null}
      </header>

      {/* ── NÍVEL 1 — CRITÉRIO DA AGÊNCIA ──────────────────────────────── */}
      <Nivel n="1" titulo="Critério da agência" hint="Como a agência lê e recebe — vale para todas as contas.">
        <Item
          ficha={ficha}
          id="regras_area"
          nome="Régua de leitura das áreas"
          editar={superAdmin ? <Ajustar href="/analistas" label="Afinar" /> : undefined}
        >
          <ul className="space-y-1.5">
            {LENS_IDS.map((id) => (
              <li key={id}>
                <span className="font-medium text-stone-800">{LENS_LABEL[id]}:</span>{" "}
                <span className="text-stone-500">{LENS_DEFAULTS[id].regua}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-stone-400">Régua padrão da agência — hoje afinável por conta (aba Áreas); vira padrão único no próximo lote.</p>
        </Item>

        <Item ficha={ficha} id="regua_prioridade" nome="Régua de prioridade · corte de ruído">
          Prioridade <span className="font-medium text-stone-800">Alta</span> a partir de 70, <span className="font-medium text-stone-800">Média</span> a partir de 40. Sem piso de severidade — a régua de cada área é que filtra o ruído.
          <p className="mt-1 text-[12px] text-stone-400">Padrão do sistema; edição por-agência chega na Fase 1.5.</p>
        </Item>

        <Item
          ficha={ficha}
          id="cadencia"
          nome="Cadência"
          editar={superAdmin ? <Ajustar href="/automacoes" label="Ajustar em Automações" /> : undefined}
        >
          Varredura de concorrentes: <span className="font-medium text-stone-800">{proximaExecucao(automacoes.diagnostico, now)}</span> · Resumo do dia: <span className="font-medium text-stone-800">{proximaExecucao(automacoes.digest, now)}</span>.
        </Item>

        <Item
          ficha={ficha}
          id="destinatarios"
          nome="Destinatários"
          editar={superAdmin ? <Ajustar href="/admin" label="Ajustar em Agências" /> : undefined}
        >
          {emailTo ? (
            <>Resumo por e-mail para <span className="font-medium text-stone-800">{emailTo}</span>.</>
          ) : (
            <span className="text-stone-500">Sem destinatário de e-mail configurado.</span>
          )}
        </Item>

        <Item ficha={ficha} id="rotulos" nome="Rótulos da agência">
          {superAdmin ? (
            <VocabEditor initial={vocab} />
          ) : (
            <ul className="space-y-1">
              {VOCAB_TERMS.map((t) => (
                <li key={t.key}>
                  <span className="font-medium text-stone-800">{rotulo(vocab, t.key)}</span>
                  {rotulo(vocab, t.key) !== t.label ? <span className="text-stone-400"> (padrão: {t.label})</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Item>
      </Nivel>

      {/* ── NÍVEL 2 — QUEM OBSERVAMOS ──────────────────────────────────── */}
      <Nivel n="2" titulo="Quem observamos" hint="Por conta — os concorrentes, contas-chave, base de conhecimento e áreas de cada cliente.">
        {watchlist.clients.length === 0 ? (
          <p className="text-[13px] text-stone-400">Nenhuma conta cadastrada ainda.</p>
        ) : (
          watchlist.clients.map((client) => {
            const conc = client.competitors.filter((k) => pillarOf(k, client.mode) === "concorrente");
            const contas = client.competitors.filter((k) => pillarOf(k, client.mode) === "conta-chave");
            const areas = lensesDe(client.name).filter((l) => l.enabled).map((l) => LENS_LABEL[l.id]);
            const q = `?cliente=${encodeURIComponent(client.name)}`;
            return (
              <div key={client.name} className="rounded-xl border border-stone-200 bg-white px-4 py-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-stone-900">{client.name}</h3>
                  <span className="text-[11px] text-stone-400">{brainDono ? "Base: Brain do Formare" : "Base: modo reduzido"}</span>
                </div>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
                      Concorrentes {superAdmin ? <Ajustar href={`/vigiar${q}`} label="ver" /> : null}
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-stone-700">{conc.length > 0 ? conc.map((c) => c.name).join(" · ") : <span className="text-stone-400">nenhum</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
                      Contas-chave {superAdmin ? <Ajustar href={`/contas/vigiar${q}`} label="ver" /> : null}
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-stone-700">{contas.length > 0 ? contas.map((c) => c.name).join(" · ") : <span className="text-stone-400">nenhuma</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400">
                      Áreas ativas {superAdmin ? <Ajustar href={`/analistas${q}`} label="ver" /> : null}
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-stone-700">{areas.length > 0 ? areas.join(" · ") : <span className="text-stone-400">nenhuma</span>}</dd>
                  </div>
                </dl>
              </div>
            );
          })
        )}
      </Nivel>

      <p className="mt-10 border-t border-stone-200 pt-4 text-[12px] text-stone-400">
        Registro da implantação. Próximos lotes: rótulos por-agência, régua/alertas como critério único da agência, e a base de conhecimento local.
      </p>
    </section>
  );
}
