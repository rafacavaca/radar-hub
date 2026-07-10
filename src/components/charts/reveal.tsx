"use client";

/**
 * REVEAL dos gráficos (F2) — a animação de entrada dispara quando o gráfico
 * ENTRA NA VIEWPORT (não tudo de uma vez no load), e é desligada por completo
 * quando o usuário pede menos movimento (prefers-reduced-motion).
 *
 * Como funciona: o wrapper só monta o gráfico quando visível (IntersectionObserver,
 * uma vez) — o Recharts anima na montagem, então "entrar na tela" = "desenhar".
 * Reserva a altura antes de montar pra não haver salto de layout.
 */

import { useEffect, useRef, useState } from "react";

/** true quando o usuário pediu menos movimento — os charts desligam a animação. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function ChartReveal({ height, children }: { height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // sem IO (browser antigo) → mostra direto, honesto.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {visible ? children : null}
    </div>
  );
}
