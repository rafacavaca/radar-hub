/**
 * REPOSITÓRIO genérico dos STORES PEQUENOS (item 2 — cutover) sobre `org_docs`.
 * Cada documento é (kind, key) com a forma JSON que o app já usa em `data` —
 * mesmo envelope das tabelas grandes, RLS escopa por org da sessão. Evita uma
 * tabela por store sem abrir mão do isolamento.
 *
 * Convenção: stores "arquivo único" (lista global) usam key fixa (ex.: "global"
 * ou o nome do cliente); a leitura devolve o `fallback` quando não há doc.
 *
 * FILTRO EXPLÍCITO de org em toda leitura/apagamento: no caminho do usuário é
 * redundante com a RLS (defesa dupla); no do COLETOR (admin, ignora RLS) é O
 * isolamento. Sem org no contexto -> fallback (leitura honesta e vazia).
 */

import { supabaseRouteClient, currentOrgId } from "@/lib/db/session";

/** Lê um doc (kind,key) da org do contexto; `fallback` se não existe. Nunca lança. */
export async function sbGetDoc<T>(kind: string, key: string, fallback: T): Promise<T> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return fallback;
    const sb = await supabaseRouteClient();
    const { data, error } = await sb
      .from("org_docs")
      .select("data")
      .eq("org_id", orgId)
      .eq("kind", kind)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return ((data as { data: T }).data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Todos os docs de um kind na org do contexto (stores por-cliente). Nunca lança. */
export async function sbListDocs<T>(kind: string): Promise<Array<{ key: string; data: T }>> {
  try {
    const orgId = await currentOrgId();
    if (!orgId) return [];
    const sb = await supabaseRouteClient();
    const { data, error } = await sb.from("org_docs").select("key, data").eq("org_id", orgId).eq("kind", kind);
    if (error || !data) return [];
    return data as Array<{ key: string; data: T }>;
  } catch {
    return [];
  }
}

/** Grava (upsert) um doc (kind,key) na org do contexto. org_id explícito; RLS valida. */
export async function sbSetDoc(kind: string, key: string, data: unknown): Promise<void> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error(`Sem org no contexto — não há onde gravar ${kind}/${key}.`);
  const sb = await supabaseRouteClient();
  const { error } = await sb.from("org_docs").upsert(
    { org_id: orgId, kind, key, data: data ?? {}, updated_at: new Date().toISOString() },
    { onConflict: "org_id,kind,key" },
  );
  if (error) throw new Error(`${kind}/${key}: falha ao gravar: ${error.message}`);
}

/** Apaga um doc (kind,key) da org do contexto. */
export async function sbDeleteDoc(kind: string, key: string): Promise<void> {
  const orgId = await currentOrgId();
  if (!orgId) throw new Error(`Sem org no contexto — não há onde apagar ${kind}/${key}.`);
  const sb = await supabaseRouteClient();
  const { error } = await sb.from("org_docs").delete().eq("org_id", orgId).eq("kind", kind).eq("key", key);
  if (error) throw new Error(`${kind}/${key}: falha ao apagar: ${error.message}`);
}
