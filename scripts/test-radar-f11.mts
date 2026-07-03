/**
 * Smoke test da F11 — o "juiz" do NÓ VISÃO (monitor de identidade).
 *
 * Duas camadas:
 *   A) VISÃO COMPUTACIONAL DETERMINÍSTICA (sem IA, sem rede) — o coração
 *      verificável: extrair paleta de um print, calcular a assinatura (aHash) e
 *      medir mudança visual entre capturas. Imagens sintéticas -> resultado exato.
 *   B) VISÃO POR IA ponta-a-ponta — prova que o endpoint ISOLADO do motor
 *      (/complete-vision) responde e que o cliente do Radar o consome (manda uma
 *      imagem verde e confirma que a IA vê "verde"). Prova também que o motor
 *      do Formare ganhou visão sem quebrar (o endpoint responde).
 *
 * Uso: npm run smoke:f11
 */

import { PNG } from "pngjs";
import { config } from "dotenv";

config({ path: ".env.local" });

const { analyzePng, hashDistance, visualChangePct } = await import("@/lib/visual");
const { analyzeImagesViaGateway } = await import("@/lib/gateway-vision");

type Criterio = { nome: string; feito: boolean; detalhe?: string };

/** PNG sólido w×h de uma cor RGB. */
function solid(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** PNG com metade de cima e de baixo em lumas diferentes (padrão testável). */
function halves(w: number, h: number, topLuma: number, bottomLuma: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const v = y < h / 2 ? topLuma : bottomLuma;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function rodar(): Promise<Criterio[]> {
  const criterios: Criterio[] = [];

  // A1) paleta: print vermelho -> cor dominante avermelhada.
  const vermelho = analyzePng(solid(120, 120, [210, 40, 40]));
  const azul = analyzePng(solid(120, 120, [40, 60, 210]));
  const top = vermelho.palette[0];
  const rgbFromHex = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [rr, rg, rb] = top ? rgbFromHex(top.hex) : [0, 0, 0];
  criterios.push({
    nome: "Paleta: extrai a cor dominante do print (vermelho -> tom avermelhado)",
    feito: Boolean(top) && rr > rg && rr > rb && top.pct > 50,
    detalhe: top ? `dominante=${top.hex} (${top.pct}%), azul[0]=${azul.palette[0]?.hex}` : "sem paleta",
  });

  // A2) aHash: assinatura de 64 bits válida (16 hex).
  const a = analyzePng(halves(64, 64, 0, 255)); // topo escuro, base clara
  const valido = /^[0-9a-f]{16}$/.test(a.aHash);
  criterios.push({
    nome: "Assinatura visual (aHash) é um hash de 64 bits válido",
    feito: valido,
    detalhe: `aHash=${a.aHash}`,
  });

  // A3) mudança visual: padrão vs seu INVERSO -> ~100%; idêntico -> 0%.
  const b = analyzePng(halves(64, 64, 255, 0)); // invertido
  const distInverso = visualChangePct(a.aHash, b.aHash);
  const distIgual = hashDistance(a.aHash, a.aHash);
  criterios.push({
    nome: "Mudança visual: inverso ~100% · idêntico 0% (detecta redesign)",
    feito: distInverso >= 80 && distIgual === 0,
    detalhe: `inverso=${distInverso}%, idêntico=${distIgual}`,
  });

  // B) VISÃO POR IA ponta-a-ponta (endpoint isolado do motor).
  try {
    const verde = solid(90, 90, [30, 170, 60]);
    const out = await analyzeImagesViaGateway({
      system: "Você é um analista visual. Responda em pt-BR.",
      prompt: "Que cor PREDOMINA nesta imagem? Responda com UMA palavra.",
      images: [{ media_type: "image/png", data: verde.toString("base64") }],
    });
    const viuVerde = /verde/i.test(out);
    criterios.push({
      nome: "Visão por IA (endpoint isolado do motor) enxerga a imagem",
      feito: viuVerde,
      detalhe: `resposta="${out.trim().slice(0, 40)}"`,
    });
  } catch (err) {
    criterios.push({
      nome: "Visão por IA (endpoint isolado do motor) enxerga a imagem",
      feito: false,
      detalhe: (err as Error).message,
    });
  }

  return criterios;
}

async function main(): Promise<void> {
  console.log("\n=== Smoke F11 — Nó Visão (identidade: cores, assinatura, IA) ===\n");
  let tudoVerde = true;
  for (const c of await rodar()) {
    console.log(`${c.feito ? "✅" : "⬜"} ${c.nome}${c.detalhe ? `  — ${c.detalhe}` : ""}`);
    if (!c.feito) tudoVerde = false;
  }
  console.log();
  if (tudoVerde) {
    console.log("F11 VERDE ✅ — mede cores/assinatura por conta própria e enxerga com IA.");
    process.exit(0);
  }
  console.log("F11 ainda NÃO completa — critérios acima em branco.");
  process.exit(1);
}

main().catch((err) => {
  console.error("Smoke falhou com erro:", err);
  process.exit(1);
});
