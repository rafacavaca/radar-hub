/**
 * VERIFICA O MOTOR AO VIVO — faz UMA chamada real pelo roteador
 * (completeViaGateway) e imprime o provider efetivo + a resposta. É uma chamada
 * PAGA (Claude ou DeepSeek, conforme o efetivo); rode manualmente, não no CI.
 *
 * Uso: npx tsx scripts/verify-motor.mts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const { effectiveProvider } = await import("@/lib/llm/provider");
const { completeViaDeepSeek, deepseekConfigured } = await import("@/lib/llm/deepseek");
const { completeViaGateway } = await import("@/lib/gateway");

const alvo = await effectiveProvider();
console.log(`DeepSeek configurado? ${deepseekConfigured()}`);
console.log(`provider efetivo (sem contexto de org → default): ${alvo}`);

// Sonda DIRETA ao DeepSeek — prova a CHAVE + o cliente (não se confunde com o
// fallback pro Claude, que o roteador faria se o DeepSeek falhasse).
if (deepseekConfigured()) {
  try {
    const t = Date.now();
    const r = await completeViaDeepSeek({ system: "Responda em pt-BR, curtíssimo.", prompt: "Responda apenas: funcionando" });
    console.log(`[DeepSeek DIRETO] (${Date.now() - t}ms): ${r.slice(0, 120)}`);
    console.log(r.toLowerCase().includes("funcionando") ? "✅ chave DeepSeek VÁLIDA — respondeu direto." : "⚠️ DeepSeek respondeu fora do esperado.");
  } catch (e) {
    console.log(`❌ DeepSeek DIRETO falhou: ${(e as Error).message}`);
  }
}

const t0 = Date.now();
const resp = await completeViaGateway({
  system: "Você responde em português do Brasil, curtíssimo.",
  prompt: "Responda apenas com a palavra: funcionando",
});
console.log(`[roteador] resposta (${Date.now() - t0}ms): ${resp.slice(0, 120)}`);
console.log(resp.toLowerCase().includes("funcionando") ? "\n✅ motor respondeu pelo roteador.\n" : "\n⚠️ respondeu, mas fora do esperado — ver acima.\n");
