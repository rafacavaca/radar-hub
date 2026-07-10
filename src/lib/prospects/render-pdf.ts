/**
 * RENDER HTML → PDF (F2 redesign) — Chrome headless (puppeteer). É a virada:
 * o PDF nasce de um TEMPLATE HTML/CSS desenhado (fonte, cor, layout, SVG
 * vetorial), não de um gerador de texto. Só assim se controla a apresentação.
 *
 * VPS APERTADA: a RAM é curta (~1GB livre), então lançamos UM Chrome por vez,
 * com flags econômicas (--single-process, sem /dev/shm, sem gpu) e FECHAMOS
 * sempre (finally). PDF é ação de baixa frequência (botão/cron) — o pico é
 * transitório. Um lock em memória serializa chamadas concorrentes.
 */

import type { Browser } from "puppeteer";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage", // a VPS tem /dev/shm pequeno — usa /tmp
  "--single-process", // 1 processo só: menos RAM (ok pra render único)
  "--no-zygote",
  "--disable-gpu",
];

// serializa: nunca dois Chrome ao mesmo tempo (protege a RAM).
let cadeia: Promise<unknown> = Promise.resolve();

async function comLock<T>(fn: () => Promise<T>): Promise<T> {
  const anterior = cadeia.catch(() => {});
  let liberar!: () => void;
  cadeia = new Promise<void>((r) => (liberar = r));
  await anterior;
  try {
    return await fn();
  } finally {
    liberar();
  }
}

/**
 * Renderiza um HTML completo em PDF A4. Fecha o browser sempre. Espera as fontes
 * (Google Fonts) carregarem antes de imprimir — nítido e fiel. `footerHtml`
 * (opcional) vira o rodapé corrido (paginação) na margem inferior.
 */
export async function htmlToPdf(html: string, opts: { footerHtml?: string } = {}): Promise<Uint8Array> {
  return comLock(async () => {
    const puppeteer = (await import("puppeteer")).default;
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30000 });
      // FORÇA o fetch das fontes (Google Fonts é async) e espera terminarem —
      // sem isto o render sai no fallback (Arial), não em Archivo.
      await page
        .evaluate(async () => {
          const f = (document as unknown as { fonts: { load: (s: string) => Promise<unknown>; ready: Promise<unknown> } }).fonts;
          await Promise.all([f.load("400 16px Archivo"), f.load("600 16px Archivo"), f.load("700 16px Archivo"), f.load("800 16px Archivo")]).catch(() => {});
          await f.ready;
        })
        .catch(() => {});
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: Boolean(opts.footerHtml),
        headerTemplate: "<span></span>",
        footerTemplate: opts.footerHtml ?? "<span></span>",
        // topo/laterais full-bleed (o papel sangra); rodapé corrido embaixo.
        margin: { top: "0", right: "0", bottom: opts.footerHtml ? "14mm" : "0", left: "0" },
      });
      return pdf;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}
