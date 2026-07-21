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
const { completeViaGateway } = await import("@/lib/gateway");

const alvo = await effectiveProvider();
console.log(`provider efetivo (sem contexto de org → default): ${alvo}`);

const t0 = Date.now();
const resp = await completeViaGateway({
  system: "Você responde em português do Brasil, curtíssimo.",
  prompt: "Responda apenas com a palavra: funcionando",
});
console.log(`resposta (${Date.now() - t0}ms): ${resp.slice(0, 120)}`);
console.log(resp.toLowerCase().includes("funcionando") ? "\n✅ motor respondeu pelo roteador.\n" : "\n⚠️ respondeu, mas fora do esperado — ver acima.\n");
