/**
 * Smoke ESTADOS DO BRIEFING (FASE 1) — o histórico durável. Prova:
 *  A. buildDigest é robusto a ID-DRIFT: um item reanalisado (id novo, MESMO
 *     evento/chave) marcado ignorado NÃO volta ao inbox — casa pela chave.
 *  B. o store guarda snapshot + chave + `em` + AUTOR em TODO estado (atuado/
 *     ignorado/adiado/arquivado); adiado guarda `ate`; re-marcar sobrescreve;
 *     e é ORG-SCOPED (org B não vê os estados de A).  [Supabase real]
 *
 * Uso: npm run smoke:estados
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type Crit = { nome: string; ok: boolean; det?: string };
const crit: Crit[] = [];
const add = (n: string, ok: boolean, d?: string) => crit.push({ nome: n, ok, det: d });

console.log("\n=== Smoke ESTADOS DO BRIEFING — histórico durável ===\n");

// ── A. anti id-drift (puro, sem rede) ────────────────────────────────────────
{
  const { buildDigest } = await import("@/lib/digest");
  const reading = (id: string, ev: string) => ({
    id, clientName: "X", sinal: `Sinal ${id}`, leitura: "o que significa", acao: "aja",
    lens: "comercial", eventIds: [ev], fonte: { titulo: "Fonte", url: "https://ex.test/" + id },
    publishedAt: "2026-08-10T00:00:00.000Z", score: 90,
  });
  const material = (readings: unknown[]) =>
    ({ clientes: ["X"], loop: { items: [], ranAt: "2026-08-10T12:00:00.000Z", readings }, disparos: [], relatoriosNovos: [], reunioes: [] }) as unknown as Parameters<typeof buildDigest>[0];
  // "lr:r1" (evento ev1) marcado IGNORADO — chave X::ev1
  const estados = {
    "lr:r1": {
      estado: "ignorado", em: "2026-08-09T00:00:00.000Z", chave: "X::ev1",
      item: { id: "lr:r1", kind: "leitura", clientName: "X", titulo: "Sinal r1", detalhe: "", origem: "Área comercial", score: 90, sinalKey: "X::ev1" },
    },
  } as unknown as Parameters<typeof buildDigest>[1];
  const now = new Date("2026-08-11T12:00:00.000Z");
  // reanálise: MESMO evento ev1, id NOVO r2 (o headline do LLM mudou)
  const drift = buildDigest(material([reading("r2", "ev1")]), estados, now);
  add("anti id-drift: item reanalisado (id novo, mesmo evento) NÃO volta ao inbox", drift.itens.length === 0, `itens=${drift.itens.length}`);
  // item de OUTRO sinal (ev2), não marcado → entra normalmente
  const outro = buildDigest(material([reading("r3", "ev2")]), estados, now);
  add("item de outro sinal (não marcado) entra no inbox", outro.itens.length === 1, `itens=${outro.itens.length}`);
}

// ── A2. balanço (colher o histórico) — agregação pura ────────────────────────
{
  const { calcularBalanco } = await import("@/lib/balanco");
  const reg = (estado: string, cliente: string, kind: string, em: string) =>
    ({ estado, em, chave: "k" + em, item: { id: "x", kind, clientName: cliente, titulo: "t", detalhe: "", origem: "o", score: 1 } }) as unknown as import("@/lib/briefing-estado").EstadoRegistro;
  const now = new Date("2026-08-11T12:00:00.000Z");
  const regs = [
    reg("atuado", "A", "leitura", "2026-08-10T00:00:00.000Z"),
    reg("atuado", "A", "alerta", "2026-08-09T00:00:00.000Z"),
    reg("ignorado", "B", "leitura", "2026-08-08T00:00:00.000Z"),
    reg("adiado", "A", "leitura", "2026-06-01T00:00:00.000Z"), // fora da janela de 30d
  ];
  const b30 = calcularBalanco(regs, 30, now);
  add("balanço: janela de 30d exclui o antigo (3 de 4)", b30.total.total === 3, `total=${b30.total.total}`);
  add("balanço: atuados + taxa de ação (2 de 3 = 67%)", b30.total.atuado === 2 && Math.round(b30.taxaAcao * 100) === 67, `atuado=${b30.total.atuado} taxa=${Math.round(b30.taxaAcao * 100)}%`);
  add("balanço: por cliente (A = 2 atuados)", b30.porCliente.find((l) => l.label === "A")?.contagem.atuado === 2, `A=${b30.porCliente.find((l) => l.label === "A")?.contagem.atuado}`);
  const b90 = calcularBalanco(regs, 90, now);
  add("balanço: janela de 90d inclui o antigo (4 de 4)", b90.total.total === 4, `total=${b90.total.total}`);
}

// ── B. store durável + org-scoped (Supabase real) ────────────────────────────
const URL = process.env.RADAR_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (URL && SERVICE) {
  process.env.RADAR_DB = "supabase";
  process.env.RADAR_ADMIN_CONTEXT = "1";
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { runAsOrgCollector } = await import("@/lib/db/collector-org");
  const { setEstado, loadEstados } = await import("@/lib/briefing-estado");

  const stamp = process.env.RADAR_ISO_STAMP || "est";
  const a = { slug: `test-est-a-${stamp}`, name: "Org A (est)" };
  const b = { slug: `test-est-b-${stamp}`, name: "Org B (est)" };
  await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
  const { data: aRow } = await admin.from("orgs").insert(a).select("id").single();
  const { data: bRow } = await admin.from("orgs").insert(b).select("id").single();
  const aId = aRow!.id as string;
  const bId = bRow!.id as string;

  const mkItem = (id: string) => ({ id, kind: "leitura" as const, clientName: "Cli", titulo: `T ${id}`, detalhe: "d", origem: "o", score: 50, sinalKey: `k-${id}` });
  const autor = { id: "user-1", email: "rafa@ex.test" };
  const t0 = new Date("2026-08-10T10:00:00.000Z");

  await runAsOrgCollector(aId, () => setEstado("i1", "atuado", { item: mkItem("i1"), por: autor, now: t0 }));
  await runAsOrgCollector(aId, () => setEstado("i2", "arquivado", { item: mkItem("i2"), por: autor, now: t0 }));
  await runAsOrgCollector(aId, () => setEstado("i3", "adiado", { item: mkItem("i3"), por: autor, now: t0 }));
  const estA = await runAsOrgCollector(aId, () => loadEstados());
  add(
    "guarda snapshot + chave + em + AUTOR em todo estado",
    estA["i1"]?.item?.id === "i1" && estA["i1"]?.chave === "k-i1" && !!estA["i1"]?.em && estA["i1"]?.por?.email === "rafa@ex.test",
    `i1: item=${estA["i1"]?.item?.id} chave=${estA["i1"]?.chave} por=${estA["i1"]?.por?.email}`,
  );
  add("arquivado é um estado válido", estA["i2"]?.estado === "arquivado");
  add("adiado guarda `ate` (próximo dia local)", estA["i3"]?.estado === "adiado" && !!estA["i3"]?.ate, `ate=${estA["i3"]?.ate}`);

  await runAsOrgCollector(aId, () => setEstado("i1", "ignorado", { item: mkItem("i1"), por: autor }));
  const estA2 = await runAsOrgCollector(aId, () => loadEstados());
  add("re-marcar sobrescreve (estado ATUAL)", estA2["i1"]?.estado === "ignorado", `i1=${estA2["i1"]?.estado}`);

  const estB = await runAsOrgCollector(bId, () => loadEstados());
  add("ORG-SCOPED: org B não vê os estados de A", Object.keys(estB).length === 0, `B=${Object.keys(estB).length}`);

  await admin.from("orgs").delete().in("slug", [a.slug, b.slug]);
} else {
  console.log("(sem Supabase — parte B pulada)");
}

console.log("── Resultado ──");
let ok = true;
for (const c of crit) { console.log(`${c.ok ? "✅" : "❌"} ${c.nome}${c.det ? `  — ${c.det}` : ""}`); if (!c.ok) ok = false; }
console.log(ok ? "\nESTADOS VERDE ✅ — durável (snapshot+autor+chave), org-scoped, anti id-drift.\n" : "\nESTADOS VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
