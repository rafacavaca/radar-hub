/**
 * .ics do prospect (F2) — "adicionar ao meu calendário". É ESCRITA PRA FORA (o
 * vendedor baixa e põe na agenda dele), não leitura pra dentro → zero OAuth,
 * zero verificação Google, zero acesso à agenda do usuário. Respeitoso com a
 * privacidade e funciona pra toda agência já.
 *
 * Gera um VEVENT padrão (RFC 5545) a partir da data informada manualmente.
 */

import { createHash } from "node:crypto";

import type { Prospect } from "@/lib/prospects/schema";

/** Data ISO → carimbo UTC do iCalendar (YYYYMMDDTHHMMSSZ). */
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escapa vírgula/; e quebras de linha conforme o formato. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}

/** Dobra linhas longas em 75 octetos (RFC 5545) — evita cliente recusar. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

/**
 * O .ics de um prospect com reunião marcada. Duração padrão 1h. `appUrl` entra
 * na descrição pra o vendedor abrir o dossiê do evento. null se não há data.
 */
export function prospectToIcs(prospect: Prospect, appUrl: string): string | null {
  if (!prospect.reuniaoEm) return null;
  const start = new Date(prospect.reuniaoEm);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const uid = createHash("sha1").update(`prospect:${prospect.id}:${prospect.reuniaoEm}`).digest("hex").slice(0, 24) + "@radar.formare.tech";
  const link = `${appUrl.replace(/\/+$/, "")}/prospects/${prospect.id}?cliente=${encodeURIComponent(prospect.clientName)}`;
  const desc = [
    `Dossiê do Radar (perfil, concorrentes, sinais, aderência, preparação): ${link}`,
    prospect.contato ? `Contato: ${prospect.contato}` : "",
    prospect.contexto ? `Contexto: ${prospect.contexto}` : "",
  ].filter(Boolean).join("\\n");

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Radar Formare//Prospects//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(start.toISOString())}`,
    `DTEND:${icsStamp(end.toISOString())}`,
    `SUMMARY:${esc(`Reunião: ${prospect.nome}`)}`,
    `DESCRIPTION:${esc(desc)}`,
    `URL:${link}`,
    prospect.siteUrl ? `LOCATION:${esc(prospect.siteUrl)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(`Reunião com ${prospect.nome} em 2h — revise o dossiê`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return linhas.map(fold).join("\r\n") + "\r\n";
}
