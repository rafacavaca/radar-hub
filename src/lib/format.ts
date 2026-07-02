/**
 * Formatação em pt-BR para a UI (datas/horas legíveis para o Rafael).
 * Puro — sem dependências, seguro em server e client.
 */

const DATE_TIME_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Ex.: "02 de julho de 2026, 20:28". String vazia/ inválida -> "". */
export function formatDateTimePtBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_TIME_FMT.format(date);
}
