"use client";

/**
 * DOSSIÊ na TELA = o MESMO HTML do PDF, num iframe isolado (auto-altura). Assim
 * a tela é IDÊNTICA ao PDF (Rafael: "imprime esse HTML e já é o PDF") sem o
 * estilo do documento vazar pro app. Links abrem fora (base target no HTML).
 */

import { useEffect, useRef, useState } from "react";

export function DossieFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState(900);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const medir = () => {
      const doc = iframe.contentDocument;
      if (doc?.body) setAltura(doc.body.scrollHeight + 8);
    };
    iframe.addEventListener("load", medir);
    // re-mede quando fontes/imagens assentam e ao redimensionar a janela.
    const t = setTimeout(medir, 400);
    const t2 = setTimeout(medir, 1200);
    window.addEventListener("resize", medir);
    return () => {
      iframe.removeEventListener("load", medir);
      window.removeEventListener("resize", medir);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title="Dossiê"
      style={{ width: "100%", height: altura, border: "0", display: "block", borderRadius: 8, overflow: "hidden" }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}
