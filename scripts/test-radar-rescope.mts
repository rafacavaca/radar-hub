/**
 * Smoke RE-SCOPE das lentes — a régua/time/ação viram CRITÉRIO DA AGÊNCIA
 * (org-level) e as ÁREAS ATIVAS seguem POR CLIENTE. Prova o que importa:
 *  (1) contrato do LOOP preservado — loadActiveLensesFor devolve LensConfig
 *      completo (id/enabled/team/action/regua), senão o analista quebra;
 *  (2) régua org-level — editar por um cliente vale pra TODOS da agência;
 *  (3) áreas ativas por-cliente — desligar numa conta não afeta as outras.
 * Zero rede — store JSON isolado (RADAR_DATA_DIR).
 *
 * Uso: npm run smoke:rescope
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-rescope-"));
delete process.env.RADAR_DB;

const { loadLensesFor, loadActiveLensesFor, persistLensUpdate, persistLensReset } = await import("@/lib/lenses");

type Criterio = { nome: string; feito: boolean };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean) => criterios.push({ nome: n, feito: f });

console.log("\n=== Smoke RE-SCOPE — régua org-level, áreas ativas por-cliente ===\n");

// ── 1. CONTRATO DO LOOP: LensConfig completo ──
const alpha0 = await loadActiveLensesFor("Alpha");
add("loop-safe: 3 áreas ativas por padrão", alpha0.length === 3);
add(
  "loop-safe: cada lente tem id/enabled/team/action/regua (o analista precisa da régua)",
  alpha0.every((l) => !!l.id && l.enabled === true && !!l.team && !!l.action && typeof l.regua === "string" && l.regua.length > 10),
);

// ── 2. RÉGUA É ORG-LEVEL: editar via Alpha muda Beta ──
await persistLensUpdate("Alpha", "comercial", { regua: "RÉGUA-NOVA-DA-AGENCIA — sobe quando o teste manda" });
const betaComercial = (await loadLensesFor("Beta")).find((l) => l.id === "comercial");
add("régua org-level: editar via Alpha vale pra Beta (mesma agência)", betaComercial?.regua === "RÉGUA-NOVA-DA-AGENCIA — sobe quando o teste manda");

// time/ação também são org-level
await persistLensUpdate("Alpha", "marketing", { team: "Time X da agência" });
const betaMkt = (await loadLensesFor("Beta")).find((l) => l.id === "marketing");
add("time/ação org-level: editar via Alpha vale pra Beta", betaMkt?.team === "Time X da agência");

// ── 3. ÁREAS ATIVAS SÃO POR-CLIENTE: desligar em Alpha não afeta Beta ──
await persistLensUpdate("Alpha", "produto", { enabled: false });
const alphaProduto = (await loadLensesFor("Alpha")).find((l) => l.id === "produto");
const betaProduto = (await loadLensesFor("Beta")).find((l) => l.id === "produto");
add("áreas ativas por-cliente: produto OFF em Alpha, ON em Beta", alphaProduto?.enabled === false && betaProduto?.enabled === true);

const alphaAtivas = await loadActiveLensesFor("Alpha");
add("loadActiveLensesFor exclui a área desligada (Alpha: 2 ativas, sem produto)", alphaAtivas.length === 2 && !alphaAtivas.some((l) => l.id === "produto"));
add("Beta segue com as 3 ativas (não herdou o OFF de Alpha)", (await loadActiveLensesFor("Beta")).length === 3);

// ── 4. RESET da régua é org-level ──
await persistLensReset("Beta", "comercial"); // reset disparado via Beta
const alphaComercial = (await loadLensesFor("Alpha")).find((l) => l.id === "comercial");
add("reset da régua é org-level (via Beta restaura o padrão pra Alpha)", !!alphaComercial?.regua.startsWith("Sobe quando o movimento mexe"));

// ── 5. ALERTAS org-level (o par da régua): editar via um cliente vale pra todos ──
const { loadRegras, persistRegras } = await import("@/lib/diagnostico/alertas-store");
const regrasAntes = await loadRegras("Alpha");
add("alertas: lista completa de regras (padrão)", regrasAntes.length > 0 && regrasAntes.every((r) => typeof r.tipo === "string"));
await persistRegras("Alpha", regrasAntes.map((r) => (r.tipo === "anuncios_variacao" ? { ...r, limiar: 99 } : r)));
const regrasBeta = await loadRegras("Beta");
add("alertas org-level: editar regra via Alpha vale pra Beta (mesma agência)", regrasBeta.find((r) => r.tipo === "anuncios_variacao")?.limiar === 99);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "✅" : "❌"} ${c.nome}`);
  if (!c.feito) ok = false;
}
console.log(ok ? "\nRE-SCOPE VERDE ✅ — régua da agência, áreas por-cliente, loop intacto.\n" : "\nRE-SCOPE VERMELHO ❌ — ver acima.\n");
process.exit(ok ? 0 : 1);
