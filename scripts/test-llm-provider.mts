/**
 * Smoke LLM-PROVIDER — o roteador do motor (DeepSeek padrão · Claude opção +
 * fallback · troca por-org pelo super_admin).
 *
 * Parte 1 (SEMPRE, sem rede/DB): a LÓGICA de decisão —
 *   default = DeepSeek; sem DEEPSEEK_API_KEY degrada pro Claude; LLM_PROVIDER
 *   muda o default; sanitização; ordem de fallback (efetivo primeiro, filtra o
 *   indisponível).
 * Parte 2 (se houver chaves Supabase): persistência POR-ORG + isolamento —
 *   setOrgProvider(A) não vaza pra B; loadProvider lê o da org no contexto.
 *
 * Uso: npm run smoke:llm
 */

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n=== Smoke LLM-PROVIDER — roteador do motor ===\n");

// ── Parte 1: pura/env — força CLÁSSICO (sem Supabase) e controla as chaves ────
delete process.env.RADAR_DB;
delete process.env.RADAR_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.LLM_PROVIDER;

const { providerPadrao, sanitizarProvider, effectiveProvider } = await import("@/lib/llm/provider");
const { deepseekConfigured } = await import("@/lib/llm/deepseek");
const { ordemProviders } = await import("@/lib/gateway");

add("Default do sistema = DeepSeek", providerPadrao() === "deepseek", `padrao=${providerPadrao()}`);
add("Sem chave → deepseekConfigured=false", deepseekConfigured() === false);
add("Sem chave, efetivo DEGRADA pro Claude", (await effectiveProvider()) === "claude");

process.env.DEEPSEEK_API_KEY = "sk-teste-nao-usada";
add("Com chave → deepseekConfigured=true e efetivo=DeepSeek", deepseekConfigured() === true && (await effectiveProvider()) === "deepseek");

process.env.LLM_PROVIDER = "claude";
add("LLM_PROVIDER=claude muda o DEFAULT do sistema", providerPadrao() === "claude");
delete process.env.LLM_PROVIDER;

add(
  "sanitizarProvider: conhecidos passam, lixo → default",
  sanitizarProvider("claude") === "claude" && sanitizarProvider("deepseek") === "deepseek" && sanitizarProvider("xyz") === "deepseek",
);

add("ordem: alvo DeepSeek → [deepseek, claude]", eq(ordemProviders("deepseek", { deepseek: true, claude: true }), ["deepseek", "claude"]));
add("ordem: alvo Claude → [claude, deepseek]", eq(ordemProviders("claude", { deepseek: true, claude: true }), ["claude", "deepseek"]));
add("ordem: filtra o indisponível (deepseek off) → [claude]", eq(ordemProviders("deepseek", { deepseek: false, claude: true }), ["claude"]));
add("ordem: nenhum configurado → []", ordemProviders("deepseek", { deepseek: false, claude: false }).length === 0);

// ── Parte 2: persistência + isolamento por org (só com Supabase) ──────────────
const { config } = await import("dotenv");
config({ path: ".env.local" });
const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE) {
  console.log("\n(sem chaves Supabase — Parte 2 de isolamento por-org pulada)\n");
} else {
  process.env.RADAR_DB = "supabase";
  process.env.RADAR_ADMIN_CONTEXT = "1";
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const stamp = process.env.RADAR_ISO_STAMP || "llmprov";
  const a = { slug: `test-llm-a-${stamp}`, name: "Org A (llm)" };
  const b = { slug: `test-llm-b-${stamp}`, name: "Org B (llm)" };
  await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
  const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
  const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
  const aId = aRow!.id as string;
  const bId = bRow!.id as string;

  const { setOrgProvider, listOrgProviders } = await import("@/lib/db/admin-ops");
  const { runAsOrgCollector } = await import("@/lib/db/collector-org");
  const { loadProvider } = await import("@/lib/llm/provider");

  await setOrgProvider(aId, "claude");
  const provs = await listOrgProviders();
  add("setOrgProvider(A,'claude') aparece em listOrgProviders; B não", provs[aId] === "claude" && provs[bId] === undefined, `A=${provs[aId]} B=${provs[bId] ?? "—"}`);

  const provA = await runAsOrgCollector(aId, () => loadProvider());
  const provB = await runAsOrgCollector(bId, () => loadProvider());
  add("loadProvider lê o da org: A=claude (escolhido), B=deepseek (default)", provA === "claude" && provB === "deepseek", `A=${provA} B=${provB}`);

  await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nLLM-PROVIDER VERDE ✅ — DeepSeek padrão, Claude opção+fallback, troca por-org isolada.\n" : "\nLLM-PROVIDER VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
