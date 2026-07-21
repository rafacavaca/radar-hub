"use client";

/**
 * AUTO-REFRESH quando o Radar está MORNO — quando a tela é servida de um cache
 * de dia anterior (o de hoje ainda não existe), dispara UMA vez, em background,
 * o aquecimento (/api/run?force=1) e recarrega a página quando termina. Assim a
 * tela abre NA HORA (com o dado de ontem) e se atualiza sozinha, em vez de
 * pendurar numa coleta a frio.
 *
 * Guarda: 1×/dia por sessão do navegador (evita re-disparar a cada navegação e
 * abas concorrentes). Mostra uma pílula honesta "atualizando" enquanto roda.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function hojeUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AutoRefreshStale({ needsRefresh }: { needsRefresh?: boolean }) {
  const router = useRouter();
  const jaDisparou = useRef(false);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    if (!needsRefresh || jaDisparou.current) return;
    jaDisparou.current = true;

    // dedupe por dia/sessão — se já pedimos o aquecimento hoje, não repete.
    const chave = `radar:warm:${hojeUTC()}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* sessionStorage indisponível — segue sem a guarda */
    }

    setAtivo(true);
    fetch("/api/run?force=1", { method: "GET" })
      .then((r) => {
        if (r.ok) router.refresh();
      })
      .catch(() => {
        /* aquecimento falhou — o "Rodar agora" manual segue disponível */
      })
      .finally(() => setAtivo(false));
  }, [needsRefresh, router]);

  if (!ativo) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-md"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
      atualizando o Radar…
    </div>
  );
}
