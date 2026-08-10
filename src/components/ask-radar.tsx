"use client";

/**
 * PERGUNTE AO RADAR — a versão de TELA (/perguntar): a mesma conversa da bolha
 * flutuante (`AskThread`), embrulhada num card, com o seletor de cliente no topo.
 */

import { useState } from "react";

import { AskThread } from "@/components/ask-thread";

export function AskRadar({ clients }: { clients: string[] }) {
  const [client, setClient] = useState(""); // "" = todos os clientes

  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
      <AskThread
        clients={clients}
        clientName={client || undefined}
        onClientChange={setClient}
        showSelector={clients.length > 1}
        scrollClass="max-h-[60vh] min-h-[18rem]"
        placeholder="Pergunte sobre concorrentes, movimentos, oportunidades…"
      />
    </div>
  );
}
