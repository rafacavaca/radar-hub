/**
 * NOTAS DE ROADMAP (F6) — a AÇÃO da lente Produto.
 *
 * Diferente de comercial/marketing (que viram card no Formare), a leitura de
 * produto é INTERNA: vira uma nota de roadmap guardada no banco PRÓPRIO do
 * Radar (`data/roadmap-notes.json`), listada na visão Produto. Não é conteúdo
 * do Formare — só viraria se fosse um ângulo de go-to-market (decisão humana).
 *
 * Mesmo padrão dos outros stores: escrita atômica, seed implícito, erros
 * amigáveis, RADAR_DATA_DIR pra teste isolado.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CrossInsight } from "@/lib/cross-reference";
import type { LensReading } from "@/lib/types";

export type RoadmapNote = {
  id: string;
  clientName: string;
  /** o movimento que originou a nota. */
  sinal: string;
  /** a leitura de produto (o corpo da nota). */
  leitura: string;
  /** a recomendação de roadmap. */
  acao: string;
  fonte: { url: string; titulo: string };
  concorrente?: string;
  score: number;
  createdAt: string;
};

type NotesFile = { notes: RoadmapNote[] };

function dataDir(): string {
  return process.env.RADAR_DATA_DIR || join(process.cwd(), "data");
}

function notesPath(): string {
  return join(dataDir(), "roadmap-notes.json");
}

function readFile(): NotesFile {
  const path = notesPath();
  if (!existsSync(path)) return { notes: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as NotesFile;
    if (parsed && Array.isArray(parsed.notes)) return parsed;
    return { notes: [] };
  } catch {
    return { notes: [] };
  }
}

function writeFile(file: NotesFile): void {
  mkdirSync(dataDir(), { recursive: true });
  const path = notesPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
  renameSync(tmp, path);
}

/** Notas de um cliente, mais novas primeiro. */
export function listNotes(clientName?: string): RoadmapNote[] {
  const notes = readFile().notes;
  const filtered = clientName ? notes.filter((n) => n.clientName === clientName) : notes;
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Guarda uma leitura de produto como nota de roadmap (idempotente por leitura). */
export function saveNoteFromReading(reading: LensReading): RoadmapNote {
  const id = createHash("sha1").update(`note:${reading.id}`).digest("hex").slice(0, 16);
  const file = readFile();

  const existing = file.notes.find((n) => n.id === id);
  if (existing) return existing; // já guardada — não duplica.

  const note: RoadmapNote = {
    id,
    clientName: reading.clientName,
    sinal: reading.sinal,
    leitura: reading.leitura,
    acao: reading.acao,
    fonte: reading.fonte,
    concorrente: reading.concorrente,
    score: reading.score,
    createdAt: new Date().toISOString(),
  };
  file.notes.push(note);
  writeFile(file);
  return note;
}

/** Guarda um insight interno×externo (F9) como nota de roadmap. Idempotente. */
export function saveNoteFromCross(insight: CrossInsight): RoadmapNote {
  const id = createHash("sha1").update(`note-cross:${insight.id}`).digest("hex").slice(0, 16);
  const file = readFile();
  const existing = file.notes.find((n) => n.id === id);
  if (existing) return existing;

  const note: RoadmapNote = {
    id,
    clientName: insight.clientName,
    sinal: insight.sinal,
    leitura: `Externo: ${insight.externo}\nInterno: ${insight.interno}`,
    acao: insight.oportunidade,
    fonte: insight.fonte,
    concorrente: insight.concorrente,
    score: insight.score,
    createdAt: new Date().toISOString(),
  };
  file.notes.push(note);
  writeFile(file);
  return note;
}

/** Apaga uma nota. Lança com mensagem amigável se não existe. */
export function deleteNote(noteId: string): void {
  const file = readFile();
  const before = file.notes.length;
  file.notes = file.notes.filter((n) => n.id !== noteId);
  if (file.notes.length === before) throw new Error("Nota não encontrada.");
  writeFile(file);
}
