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

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Data curta do design: "dd mmm aaaa" minúsculo (ex.: "02 jul 2026").
 * Nunca inventa: data ausente/ inválida -> "" (o chamador decide o texto).
 * Guarda contra o bug do epoch: 31 dez 1969 / datas < 2000 -> "".
 */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return "";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${dia} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Idade em dias entre a data e agora (nowIso — pra ser puro/testável). */
export function ageInDays(iso: string | null | undefined, nowIso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date(nowIso);
  if (Number.isNaN(d.getTime()) || Number.isNaN(now.getTime()) || d.getUTCFullYear() < 2000) {
    return null;
  }
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}
