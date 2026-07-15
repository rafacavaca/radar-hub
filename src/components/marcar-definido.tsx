"use client";

/**
 * Selo INTERATIVO da Implantação (P13/registro) — só o super_admin. Alterna um
 * parâmetro entre pendente↔definido (POST /api/implantacao) e recarrega, pra a
 * completude e a data de revisão valerem de verdade. `import type` do ParamId
 * (erasado — não puxa o store/fs pro bundle do cliente).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ParamId } from "@/lib/parametrizacao";

export function MarcarDefinido({ id, definido }: { id: ParamId; definido: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function alternar() {
    setBusy(true);
    try {
      const status = definido ? "pendente" : "definido";
      const res = await fetch("/api/implantacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid={`marcar-${id}`}
      onClick={alternar}
      disabled={busy}
      title={definido ? "Revisado na implantação — clique para marcar pendente" : "Marcar como revisado na implantação"}
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-50 " +
        (definido
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          : "bg-white text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50")
      }
    >
      {definido ? "definido ✓" : "marcar definido"}
    </button>
  );
}
