/**
 * ANALISTAS — a tela onde o Rafael vê e afina COMO cada uma das três lentes
 * pensa, por cliente (comercial, produto, marketing).
 *
 * Server component no espírito de "transparência dos agentes": lê a config das
 * lentes direto do disco (`readLenses`, nunca lança e semeia o padrão) e entrega
 * ao editor client. Sem lógica aqui — só leitura e enquadramento.
 */

import { readLenses } from "@/lib/lenses";

import { LensConfigEditor } from "@/components/lens-config-editor";

export const dynamic = "force-dynamic";

export default function AnalistasPage() {
  const file = readLenses();

  return (
    <section className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-stone-400">Analistas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
          Como cada lente pensa
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Três analistas leem cada sinal — comercial, produto e marketing. Ajuste a régua de cada
          um; o padrão já vem pronto.
        </p>
      </header>

      <div className="mt-8">
        <LensConfigEditor initial={file} />
      </div>
    </section>
  );
}
