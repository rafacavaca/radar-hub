/**
 * BASE — MODO PORTA (D14). A org DONA (Formare) NÃO constrói Brain nativo: seus
 * clientes têm o Brain rico no OS Formare, lido pela porta. Esta tela mostra esse
 * conhecimento em LEITURA (nunca escreve no OS pela Base) — com o selo honesto
 * "vem do Formare OS". Sem construtor (Descobrir/upload/confirmar): a curadoria
 * é feita no OS. Componente de servidor (só exibe).
 */

import type { BrainNode } from "@/lib/brain";
import { formatDateShort } from "@/lib/format";

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Rótulo curto de origem do nó (o "tipo" que a porta serve). */
function tipoDe(n: BrainNode): string {
  return n.material_kind || n.type || n.layer || "conhecimento";
}

export function BasePortaView({ cliente, nodes }: { cliente: string; nodes: BrainNode[] }) {
  const verdade = nodes.filter((n) => n.authority === "canonical");
  const referencia = nodes.filter((n) => n.authority === "reference");

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Base de conhecimento</p>
      <h1 className="mt-1 text-[22px] font-bold tracking-tight text-stone-900">{cliente}</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-stone-500">
        Este cliente usa o <b className="font-semibold text-stone-700">Brain do Formare OS</b>. O Radar lê o conhecimento
        confirmado pela porta (só leitura) — a curadoria é feita no OS.
      </p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-800">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Vem do Formare OS · {nodes.length} {nodes.length === 1 ? "fato confirmado" : "fatos confirmados"}
      </div>

      {nodes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">
            O Brain do Formare OS ainda não tem conhecimento confirmado deste cliente.
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Enriqueça a base no OS Formare — o Radar passa a ler automaticamente pela porta.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <Grupo titulo="Verdade institucional" nodes={verdade} cor="bg-emerald-50 text-emerald-700" />
          <Grupo titulo="Referência" nodes={referencia} cor="bg-blue-50 text-blue-700" />
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, nodes, cor }: { titulo: string; nodes: BrainNode[]; cor: string }) {
  if (nodes.length === 0) return null;
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-stone-500">
        {titulo} <span className="text-stone-400">({nodes.length})</span>
      </h2>
      <ul className="mt-2 space-y-2">
        {nodes.map((n, i) => (
          <li key={i} className="rounded-lg border border-stone-200 bg-white px-3.5 py-3">
            <p className="text-[14px] leading-snug text-stone-800">{clean(n.content)}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
              <span className={"rounded-full px-1.5 py-0.5 font-semibold " + cor}>{tipoDe(n)}</span>
              {n.updated_at ? <span>{formatDateShort(n.updated_at)}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
