/**
 * Desempilhamento de rótulos do 2x2 (E1). Garante que rótulos de pontos
 * coincidentes/próximos NUNCA se sobreponham: por LADO (esq/dir), ordena por y
 * e empurra cada rótulo pra baixo o mínimo (lineHeight) pra não colar no
 * anterior. Pura e determinística — testável fora do React.
 */

export type PontoRotulo = { label: string; x: number; y: number };
export type RotuloDodged = PontoRotulo & { labelY: number; side: "start" | "end"; deslocado: boolean };

export function dodgeLabels(
  pts: PontoRotulo[],
  opts: { width: number; lineHeight: number; top: number; bottom: number },
): RotuloDodged[] {
  const { width, lineHeight: LH, top, bottom } = opts;
  const ordenados = [...pts].sort((a, b) => a.y - b.y);
  const acc: Record<"start" | "end", RotuloDodged[]> = { start: [], end: [] };

  for (const p of ordenados) {
    const side: "start" | "end" = p.x > width * 0.62 ? "end" : "start";
    const lista = acc[side];
    const anteriorY = lista.length ? lista[lista.length - 1].labelY : -Infinity;
    let labelY = Math.max(p.y, top, anteriorY + LH);
    if (labelY > bottom) labelY = bottom;
    lista.push({ ...p, side, labelY, deslocado: Math.abs(labelY - p.y) > 2 });
  }
  return [...acc.start, ...acc.end];
}
