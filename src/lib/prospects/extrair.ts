/**
 * EXTRAÇÃO de texto do CONTEXTO PRIVADO (F1) — PDF (unpdf), DOCX (mammoth), TXT.
 * Roda no servidor, SEM LLM (extração é local e barata). PDF escaneado/imagem
 * sem texto → `legivel: false` ("não foi possível ler"); NUNCA inventa conteúdo.
 * OCR fica pra F2.
 */

export type ExtracaoResult = { texto: string; legivel: boolean; motivo?: string };

const MIN_TEXTO = 12; // menos que isto = considera "não deu pra ler" (escaneado/vazio)

/** Detecta o tipo pelo mime/nome e extrai o texto. Nunca lança — devolve honesto. */
export async function extrairTexto(bytes: Uint8Array, nome: string, mime?: string): Promise<ExtracaoResult> {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  const m = (mime ?? "").toLowerCase();

  try {
    if (m.includes("pdf") || ext === "pdf") return await extrairPdf(bytes);
    if (m.includes("word") || m.includes("officedocument") || ext === "docx") return await extrairDocx(bytes);
    if (m.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
      const texto = new TextDecoder("utf-8").decode(bytes).trim();
      return finalizar(texto);
    }
    if (m.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return { texto: "", legivel: false, motivo: "imagem — leitura de texto (OCR) chega na F2." };
    }
    return { texto: "", legivel: false, motivo: `tipo não suportado (${ext || m || "desconhecido"}).` };
  } catch (err) {
    return { texto: "", legivel: false, motivo: `falha ao ler: ${(err as Error).message.slice(0, 120)}` };
  }
}

async function extrairPdf(bytes: Uint8Array): Promise<ExtracaoResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const texto = (Array.isArray(text) ? text.join("\n") : text).trim();
  if (texto.length < MIN_TEXTO) {
    return { texto: "", legivel: false, motivo: "PDF sem texto (provavelmente escaneado/imagem) — OCR chega na F2." };
  }
  return finalizar(texto);
}

async function extrairDocx(bytes: Uint8Array): Promise<ExtracaoResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return finalizar((value ?? "").trim());
}

function finalizar(texto: string): ExtracaoResult {
  if (texto.length < MIN_TEXTO) return { texto: "", legivel: false, motivo: "arquivo sem texto legível." };
  // teto de caracteres (o resumo cuida do resto) — mantém o store enxuto.
  return { texto: texto.slice(0, 60000), legivel: true };
}
