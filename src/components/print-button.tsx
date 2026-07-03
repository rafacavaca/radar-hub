"use client";

/**
 * Botão de imprimir/exportar do modo apresentação (some na impressão).
 */

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 print:hidden"
    >
      Imprimir / salvar PDF
    </button>
  );
}
