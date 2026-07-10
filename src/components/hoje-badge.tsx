"use client";

/**
 * BADGE DE NÃO-LIDOS da aba "Hoje" (ritual F1.4) — o gatilho do hábito. Busca
 * as chaves do digest de hoje (/api/hoje/ids), diffa com o localStorage de
 * vistos e mostra quantos sinais novos há desde a última visita. Some ao abrir
 * o Hoje (a view marca visto e dispara "radar:hoje-seen"). Recalcula a cada
 * navegação. Silencioso em erro (é enfeite de retenção, não pode quebrar nada).
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const SEEN_KEY = "radar:hoje:seen";

export function HojeBadge() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let vivo = true;
    async function recalc() {
      // na própria tela Hoje o contador é sempre 0 (a view marca tudo visto).
      if (pathname === "/hoje") {
        if (vivo) setCount(0);
        return;
      }
      try {
        const res = await fetch("/api/hoje/ids", { cache: "no-store" });
        const body = (await res.json()) as { data?: { keys?: string[] } };
        const keys = body.data?.keys ?? [];
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[];
        } catch {
          seen = [];
        }
        const seenSet = new Set(seen);
        if (vivo) setCount(keys.filter((k) => !seenSet.has(k)).length);
      } catch {
        if (vivo) setCount(0);
      }
    }
    recalc();
    const onSeen = () => setCount(0);
    window.addEventListener("radar:hoje-seen", onSeen);
    return () => {
      vivo = false;
      window.removeEventListener("radar:hoje-seen", onSeen);
    };
  }, [pathname]);

  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold tabular-nums text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
