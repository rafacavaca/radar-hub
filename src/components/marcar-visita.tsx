"use client";

/**
 * Beacon de VISITA — ao abrir a Visão de um cliente, marca (após ~1,5s na tela,
 * pra contar como visita real) que este usuário viu este cliente AGORA. A
 * leitura de "desde sua última visita" acontece no servidor ANTES disto, então
 * o delta mostrado é o da visita anterior; a próxima visita zera. Dispara 1×.
 */

import { useEffect, useRef } from "react";

export function MarcarVisita({ cliente }: { cliente: string }) {
  const feito = useRef(false);

  useEffect(() => {
    if (!cliente || feito.current) return;
    feito.current = true;
    const t = setTimeout(() => {
      fetch("/api/visita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente }),
        keepalive: true,
      }).catch(() => {
        /* marcar visita é best-effort — não atrapalha a tela */
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [cliente]);

  return null;
}
