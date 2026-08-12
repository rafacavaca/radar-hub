/**
 * ESTADOS DO BRIEFING (ritual diário) — o inbox se PROCESSA: cada item do digest
 * é marcado Atuado, Ignorado, Adiado ou Arquivado. É também o ARQUIVO desses
 * estados (a base do histórico) — durável, org-scoped.
 *
 *  - Atuado/Ignorado/Arquivado: o item sai do inbox de hoje (fica no histórico).
 *  - Adiado: VOLTA no digest de amanhã (guarda `ate` + o snapshot do item).
 *
 * DURABILIDADE (por que este ficheiro guarda tanto):
 *  - o SNAPSHOT do item entra em TODO estado (não só no adiado) — assim o
 *    histórico se renderiza sozinho, sem depender do material do dia;
 *  - guarda a `chave` estável do sinal (evento) — o filtro do inbox casa por ela,
 *    imune ao id-drift (o id do item deriva do headline do LLM, que pode variar);
 *  - guarda o AUTOR (quem marcou) e o `em` (quando, absoluto);
 *  - o teto é de ARQUIVO (não de inbox): nunca poda um adiado pendente.
 *
 * Store: org_docs (kind `briefing-estado`, key "global") ou JSON clássico.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseEnabled } from "@/lib/db/supabase";
import { sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { localDayKey } from "@/lib/schedules";
import type { DigestItem } from "@/lib/digest";

export type BriefingEstado = "atuado" | "ignorado" | "adiado" | "arquivado";

/** Quem marcou (capturado no momento da ação; org-scoped). */
export type EstadoAutor = { id: string; email?: string };

export type EstadoRegistro = {
  estado: BriefingEstado;
  /** quando foi marcado (ISO, absoluto). */
  em: string;
  /** adiado: dia local (YYYY-MM-DD) a partir do qual volta ao digest. */
  ate?: string;
  /** snapshot do item — em TODO estado (o histórico não depende do material do dia). */
  item: DigestItem;
  /** chave estável do sinal (evento) — o filtro do inbox casa por ela (anti id-drift). */
  chave: string;
  /** quem marcou (se a sessão tinha usuário). */
  por?: EstadoAutor;
};

export type EstadosFile = Record<string, EstadoRegistro>;

/** Teto de ARQUIVO — generoso; adiados pendentes NUNCA são podados. */
const MAX_REGISTROS = 5000;
const DOC_KIND = "briefing-estado";
const DOC_KEY = "global";

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "briefing-estado.json");
}

function readFileSafe(): EstadosFile {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { estados?: EstadosFile };
    return parsed?.estados && typeof parsed.estados === "object" ? parsed.estados : {};
  } catch {
    return {};
  }
}

function writeFileSafe(estados: EstadosFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = filePath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ estados }, null, 2), "utf8");
  renameSync(tmp, path);
}

/**
 * Teto de arquivo: se passar de MAX, mantém TODOS os adiados que ainda vão voltar
 * (nunca perde um snooze) + os registros mais RECENTES do resto. Não é mais o
 * "inbox de 800" que podava o histórico em silêncio.
 */
function comCap(estados: EstadosFile, now: Date): EstadosFile {
  const entries = Object.entries(estados);
  if (entries.length <= MAX_REGISTROS) return estados;
  const hoje = localDayKey(now);
  const pendente = ([, r]: [string, EstadoRegistro]) => r.estado === "adiado" && (r.ate ?? "") > hoje;
  const adiados = entries.filter(pendente);
  const resto = entries.filter((e) => !pendente(e)).sort((a, b) => b[1].em.localeCompare(a[1].em));
  const mantidos = [...adiados, ...resto.slice(0, Math.max(0, MAX_REGISTROS - adiados.length))];
  return Object.fromEntries(mantidos);
}

/** Dia local seguinte (YYYY-MM-DD, fuso Brasil) — quando o Adiado volta. */
export function proximoDiaLocal(now: Date): string {
  return localDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** Todos os estados marcados, na org do contexto (ou JSON). Nunca lança. */
export async function loadEstados(): Promise<EstadosFile> {
  if (!supabaseEnabled()) return readFileSafe();
  return sbGetDoc<EstadosFile>(DOC_KIND, DOC_KEY, {});
}

/**
 * O histórico como LISTA: mais recentes primeiro, 1 por CHAVE de sinal (se o
 * id derivou entre rodadas, mostra o registro mais recente — sem duplicar). É o
 * que a tela /historico consome; cada registro traz o snapshot + estado + `em`.
 */
export async function listarHistorico(): Promise<EstadoRegistro[]> {
  const estados = await loadEstados();
  const porChave = new Map<string, EstadoRegistro>();
  for (const reg of Object.values(estados)) {
    const k = reg.chave || reg.item.id;
    const atual = porChave.get(k);
    if (!atual || reg.em > atual.em) porChave.set(k, reg);
  }
  return [...porChave.values()].sort((a, b) => b.em.localeCompare(a.em));
}

/**
 * Marca o estado de um item do digest. O `item` (snapshot) é obrigatório —
 * é o que faz o histórico existir por si só. Devolve o registro gravado.
 */
export async function setEstado(
  itemId: string,
  estado: BriefingEstado,
  opts: { now?: Date; item?: DigestItem; por?: EstadoAutor } = {},
): Promise<EstadoRegistro> {
  const now = opts.now ?? new Date();
  if (!opts.item) {
    throw new Error("Marcar precisa do item (é o snapshot do histórico).");
  }
  const registro: EstadoRegistro = {
    estado,
    em: now.toISOString(),
    item: opts.item,
    chave: opts.item.sinalKey || itemId,
    ...(opts.por ? { por: opts.por } : {}),
    ...(estado === "adiado" ? { ate: proximoDiaLocal(now) } : {}),
  };
  const estados = comCap({ ...(await loadEstados()), [itemId]: registro }, now);
  if (!supabaseEnabled()) writeFileSafe(estados);
  else await sbSetDoc(DOC_KIND, DOC_KEY, estados);
  return registro;
}
