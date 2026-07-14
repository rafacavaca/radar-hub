"use client";

/**
 * SAIR — encerra a sessão (POST /api/sair) e volta pro /entrar. No rodapé da
 * navegação. Importante no piloto (usuários externos / dispositivos compartilhados).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LogOutIcon } from "@/components/icons";

export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sair() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/sair", { method: "POST" });
    } catch {
      /* mesmo se falhar o revoke, o proxy barra sem cookie válido */
    }
    router.push("/entrar");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={busy}
      title={collapsed ? "Sair" : undefined}
      aria-label={collapsed ? "Sair" : undefined}
      className={
        (collapsed ? "justify-center " : "gap-2.5 px-2 ") +
        "flex w-full items-center rounded-md py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
      }
    >
      <LogOutIcon className="h-[18px] w-[18px] shrink-0 text-stone-500" />
      {!collapsed ? <span>{busy ? "Saindo…" : "Sair"}</span> : null}
    </button>
  );
}
