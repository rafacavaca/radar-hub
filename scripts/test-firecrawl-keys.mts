/**
 * Smoke ROTAÇÃO DE CHAVES FIRECRAWL — o Rafael tem 3 contas (cada ~1000/mês,
 * renovando em dias diferentes). Prova, SEM REDE, a mecânica que as usa "de forma
 * organizada": lê os slots do env, preenche uma até a cota e passa pra próxima,
 * marca esgotada na recusa, e RESETA o contador quando o dia de renovação passa.
 *
 * Uso: npm run smoke:firecrawl
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), "radar-fckeys-"));

// 3 chaves fictícias com cota baixa (fácil de esgotar) e dias próprios.
process.env.FIRECRAWL_API_KEY = "fc-teste-um-0000000000000000000000";
process.env.FIRECRAWL_KEY1_QUOTA = "2";
process.env.FIRECRAWL_KEY1_RENOVA = "14";
process.env.FIRECRAWL_API_KEY_2 = "fc-teste-dois-000000000000000000000";
process.env.FIRECRAWL_KEY2_QUOTA = "2";
process.env.FIRECRAWL_KEY2_RENOVA = "2";
process.env.FIRECRAWL_API_KEY_3 = "fc-teste-tres-000000000000000000000";
// slot 3 sem QUOTA no env → deve cair no default (1000); com RENOVA 17.
process.env.FIRECRAWL_KEY3_RENOVA = "17";

const { carregarChaves, ordemDeTentativa, registrarUso, marcarEsgotada, statusChaves, inicioCicloAtual } = await import(
  "@/lib/firecrawl-keys"
);

type Criterio = { nome: string; feito: boolean; detalhe?: string };
const criterios: Criterio[] = [];
const add = (n: string, f: boolean, d?: string) => criterios.push({ nome: n, feito: f, detalhe: d });

console.log("\n=== Smoke FIRECRAWL KEYS — rodízio por cota + reset por renovação ===\n");

const now = new Date("2026-07-20T12:00:00.000Z"); // dia 20: ciclos → k1=14/jul, k2=2/jul, k3=17/jul

// ── 1. carregar do env (slots, quota default, renovaDia) ──
const chaves = carregarChaves();
add("Lê as 3 chaves do env (slots 1-3)", chaves.length === 3 && chaves.map((c) => c.slot).join(",") === "1,2,3");
add("Quota do env respeitada (k1=2)", chaves[0].quota === 2);
add("Quota ausente cai no default 1000 (k3)", chaves[2].quota === 1000);
add("renovaDia lido por chave (k2=2, k3=17)", chaves[1].renovaDia === 2 && chaves[2].renovaDia === 17);
add("id é estável e único por chave", chaves[0].id !== chaves[1].id && chaves[0].id === carregarChaves()[0].id);

const [k1, k2, k3] = chaves;

// ── 2. ordem de tentativa começa no slot 1 ──
add("Ordem inicial: slot 1 primeiro", ordemDeTentativa(now)[0].slot === 1);
add("Nada esgotado no começo (restante cheio)", statusChaves(now).every((s) => !s.esgotada && s.usados === 0));

// ── 3. gasta a chave 1 até a cota → rotaciona pra 2 ──
registrarUso(k1.id, now);
add("1 uso na k1 conta (usados=1)", statusChaves(now).find((s) => s.slot === 1)!.usados === 1);
add("k1 ainda tem cota → segue no topo", ordemDeTentativa(now)[0].slot === 1);
registrarUso(k1.id, now); // agora usados=2 == quota
add("k1 na cota → sai do topo (rotaciona p/ slot 2)", ordemDeTentativa(now)[0].slot === 2);
add("k1 marcada esgotada no status", statusChaves(now).find((s) => s.slot === 1)!.esgotada === true);

// ── 4. esgota a 2 também → cai na 3 ──
registrarUso(k2.id, now);
registrarUso(k2.id, now);
add("k2 esgotada → topo vira slot 3", ordemDeTentativa(now)[0].slot === 3);
add("k3 (default 1000) intacta e disponível", statusChaves(now).find((s) => s.slot === 3)!.restante === 1000);

// ── 5. marcarEsgotada (recusa da API 402) tira a chave na hora ──
marcarEsgotada(k3.id, now);
add("marcarEsgotada zera a cota da k3", statusChaves(now).find((s) => s.slot === 3)!.esgotada === true);
add("Todas esgotadas: ordem ainda devolve 3 (última tentativa é da API)", ordemDeTentativa(now).length === 3);
add("Disponível total no ciclo = 0 quando todas esgotadas", statusChaves(now).reduce((s, c) => s + c.restante, 0) === 0);

// ── 6. RESET por renovação: mês seguinte, contador volta a zero ──
const proxCiclo = new Date("2026-08-16T12:00:00.000Z"); // passou 14/ago (k1) e 2/ago (k2); 17 ainda não p/ k3
add("k1 reseta no novo ciclo (usados 0 de novo)", statusChaves(proxCiclo).find((s) => s.slot === 1)!.usados === 0);
add("k2 reseta no novo ciclo", statusChaves(proxCiclo).find((s) => s.slot === 2)!.usados === 0);
add(
  "k3 NÃO reseta antes do dia 17 (ciclo ainda 17/jul)",
  statusChaves(proxCiclo).find((s) => s.slot === 3)!.esgotada === true,
);

// ── 7. início do ciclo: casos de borda ──
add("Ciclo com dia 14: 20/jul → 14/jul", inicioCicloAtual(new Date("2026-07-20T00:00:00Z"), 14) === "2026-07-14");
add("Ciclo com dia 14: 10/jul → 14/jun (antes do dia)", inicioCicloAtual(new Date("2026-07-10T00:00:00Z"), 14) === "2026-06-14");
add("Sem renovaDia: início = dia 1 do mês", inicioCicloAtual(new Date("2026-07-20T00:00:00Z"), undefined) === "2026-07-01");
add("Renova 31 num mês curto (fev) → clampa no último dia", inicioCicloAtual(new Date("2026-03-15T00:00:00Z"), 31) === "2026-02-28");

// ── 8. só carrega o que existe no env ──
delete process.env.FIRECRAWL_API_KEY_3;
delete process.env.FIRECRAWL_KEY3_RENOVA;
add("Remover slot 3 do env → carrega só 2 chaves", carregarChaves().length === 2);

// ── Resultado ──
console.log("── Resultado ──");
let ok = true;
for (const c of criterios) {
  console.log(`${c.feito ? "OK " : "XX "} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
  if (!c.feito) ok = false;
}
console.log(
  ok
    ? "\nFIRECRAWL KEYS VERDE — rodízio por cota, reset por renovação, só o que está no env.\n"
    : "\nFIRECRAWL KEYS VERMELHO — ver acima.\n",
);
process.exit(ok ? 0 : 1);
