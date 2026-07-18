/**
 * CENTRAL DE TREINAMENTO (/treinamento) — material da agência-cliente sobre o
 * Radar. Login-gated (o proxy exige sessão em toda rota; não está na allowlist)
 * e noindex (o X-Robots-Tag global do next.config já cobre; o `robots` abaixo é
 * cinto-e-suspensório). Chrome-less no AppShell: a própria tela carrega a barra
 * de conteúdo, no design system.
 *
 * PÚBLICO × LOGIN: por ora, LOGIN — é material da agência-cliente. Abrir depois
 * é barato: adicionar "/treinamento" à allowlist do proxy (src/proxy.ts).
 */

import type { Metadata } from "next";

import { TreinamentoView } from "@/components/treinamento/treinamento-view";
import { NOVIDADES } from "@/lib/treinamento/novidades";

export const metadata: Metadata = {
  title: "Central de Treinamento — Radar",
  robots: { index: false, follow: false },
};

export default function TreinamentoPage() {
  return <TreinamentoView novidades={NOVIDADES} />;
}
