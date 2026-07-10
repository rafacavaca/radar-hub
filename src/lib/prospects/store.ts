/**
 * STORE dos PROSPECTS (F1) — org-scoped via org_docs (mesmo padrão dos stores
 * pequenos: `supabaseEnabled() ? org_docs : JSON`). Isolamento por org: o
 * dossiê é do time de vendas daquela agência, ninguém mais vê.
 *
 *  - registros leves (kind "prospects", key = cliente → Prospect[]);
 *  - dossiê pesado à parte (kind "prospect-dossie", key = prospectId) — efêmero,
 *    regenerável; guardado só pra reabrir sem re-gastar crédito.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sbDeleteDoc, sbGetDoc, sbSetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { normalizeSiteUrl } from "@/lib/discovery";
import type { Dossie, Prospect } from "@/lib/prospects/schema";

const KIND_LISTA = "prospects";
const KIND_DOSSIE = "prospect-dossie";

// ── JSON de fallback (modo clássico / testes) ───────────────────────────────

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}
function filePath(): string {
  return join(dataDir(), "prospects.json");
}
type JsonFile = { lista: Record<string, Prospect[]>; dossies: Record<string, Dossie> };

function readJson(): JsonFile {
  const p = filePath();
  if (!existsSync(p)) return { lista: {}, dossies: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as JsonFile;
    return { lista: parsed?.lista ?? {}, dossies: parsed?.dossies ?? {} };
  } catch {
    return { lista: {}, dossies: {} };
  }
}
function writeJson(f: JsonFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const p = filePath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(f, null, 2), "utf8");
  renameSync(tmp, p);
}

// ── id estável (não usa Math.random no caminho do gateway; aqui é Node normal) ─

export function prospectId(clientName: string, siteUrl: string): string {
  // normaliza o site (esquema/barra/host) pra o id não depender de como o
  // usuário digitou; inválido cai no lowercase cru (defensivo, nunca lança).
  let canonical = siteUrl.trim().toLowerCase();
  try {
    canonical = normalizeSiteUrl(siteUrl).toLowerCase();
  } catch {
    /* mantém o cru */
  }
  return createHash("sha1").update(`${clientName}:${canonical}`).digest("hex").slice(0, 16);
}

// ── API org-scoped ──────────────────────────────────────────────────────────

/** Os prospects de um cliente, na org do contexto (ou JSON). Novos primeiro. */
export async function loadProspects(clientName: string): Promise<Prospect[]> {
  const lista = supabaseEnabled()
    ? await sbGetDoc<Prospect[]>(KIND_LISTA, clientName, [])
    : (readJson().lista[clientName] ?? []);
  return [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

async function saveLista(clientName: string, lista: Prospect[]): Promise<void> {
  if (supabaseEnabled()) {
    await sbSetDoc(KIND_LISTA, clientName, lista);
  } else {
    const f = readJson();
    f.lista[clientName] = lista;
    writeJson(f);
  }
}

/** Cria (ou atualiza) um prospect. Idempotente por (cliente, site). */
export async function upsertProspect(p: Prospect): Promise<Prospect> {
  const lista = await loadProspects(p.clientName);
  const idx = lista.findIndex((x) => x.id === p.id);
  if (idx >= 0) lista[idx] = { ...lista[idx], ...p };
  else lista.push(p);
  await saveLista(p.clientName, lista);
  return p;
}

/** Um prospect por id, dentro de um cliente. */
export async function getProspect(clientName: string, id: string): Promise<Prospect | null> {
  return (await loadProspects(clientName)).find((p) => p.id === id) ?? null;
}

/** Aplica um patch a um prospect (status, dossieEm, campos). */
export async function patchProspect(clientName: string, id: string, patch: Partial<Prospect>): Promise<Prospect | null> {
  const lista = await loadProspects(clientName);
  const idx = lista.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  lista[idx] = { ...lista[idx], ...patch };
  await saveLista(clientName, lista);
  return lista[idx];
}

/** Remove um prospect (e seu dossiê) da org. */
export async function removeProspect(clientName: string, id: string): Promise<void> {
  const lista = (await loadProspects(clientName)).filter((p) => p.id !== id);
  await saveLista(clientName, lista);
  if (supabaseEnabled()) {
    await sbDeleteDoc(KIND_DOSSIE, id).catch(() => {});
  } else {
    const f = readJson();
    delete f.dossies[id];
    writeJson(f);
  }
}

/** O dossiê salvo de um prospect (ou null se nunca gerado). */
export async function loadDossie(prospectId: string): Promise<Dossie | null> {
  if (supabaseEnabled()) return sbGetDoc<Dossie | null>(KIND_DOSSIE, prospectId, null);
  return readJson().dossies[prospectId] ?? null;
}

/** Guarda o dossiê gerado (org-scoped). */
export async function saveDossie(d: Dossie): Promise<Dossie> {
  if (supabaseEnabled()) {
    await sbSetDoc(KIND_DOSSIE, d.prospectId, d);
  } else {
    const f = readJson();
    f.dossies[d.prospectId] = d;
    writeJson(f);
  }
  return d;
}
