/**
 * PREPARO PRÉ-REUNIÃO (F2) — o "wow" do ritual, SEM Google: na véspera, o Radar
 * prepara o dossiê e (opcional) manda o PDF por e-mail, pra o vendedor acordar
 * com tudo pronto. Roda no cron per-org (mesma passada do digest matinal).
 *
 * IDEMPOTENTE e honesto com o crédito:
 *  - só prepara prospects com reunião AMANHÃ (janela véspera), status ativo;
 *  - gera o dossiê só se ainda NÃO existe (não re-gasta a cada hora);
 *  - marca `pdfEnviadoEm` pra não reenviar o e-mail no mesmo ciclo.
 * O gasto é previsível: só reuniões que o vendedor agendou de propósito.
 */

import { dossieToPdf } from "@/lib/prospects/pdf";
import { gerarDossie } from "@/lib/prospects/dossie";
import { mergeConcorrentes } from "@/lib/prospects/schema";
import { getProspect, loadCuradoria, loadDossie, loadProspects, patchProspect, saveDossie } from "@/lib/prospects/store";
import { localDayKey } from "@/lib/schedules";
import type { Prospect } from "@/lib/prospects/schema";

export type PreparoResult = {
  preparados: number; // dossiês gerados na véspera
  jaProntos: number; // reuniões de amanhã que já tinham dossiê
  emails: Array<{ nome: string; envio: string }>;
  erros: Array<{ nome: string; erro: string }>;
};

/** Prospects com reunião AMANHÃ (local Brasil), ativos, em todos os clientes da org. */
async function reunioesDeAmanha(clientes: string[], now: Date): Promise<Prospect[]> {
  const amanha = localDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const todos = (await Promise.all(clientes.map((c) => loadProspects(c)))).flat();
  return todos.filter((p) => p.status === "ativo" && p.reuniaoEm && localDayKey(new Date(p.reuniaoEm)) === amanha);
}

/**
 * Prepara os dossiês da véspera e envia o PDF por e-mail (se o provedor +
 * destinatário estiverem configurados — reusa o do digest). `sendPdfEmail` é
 * injetável (o smoke passa um mock; produção passa o real).
 */
export async function prepararReunioes(
  clientes: string[],
  now: Date,
  opts: { sendPdfEmail?: (p: Prospect, pdf: Uint8Array) => Promise<string> } = {},
): Promise<PreparoResult> {
  const res: PreparoResult = { preparados: 0, jaProntos: 0, emails: [], erros: [] };
  const alvos = await reunioesDeAmanha(clientes, now);

  for (const p of alvos) {
    try {
      let dossie = await loadDossie(p.id);
      if (!dossie) {
        dossie = await gerarDossie(p);
        await saveDossie(dossie);
        await patchProspect(p.clientName, p.id, { dossieEm: dossie.geradoEm });
        res.preparados++;
      } else {
        res.jaProntos++;
      }

      // e-mail do PDF (opt-in): só uma vez por prospect (marca pdfEnviadoEm).
      if (opts.sendPdfEmail) {
        const atual = await getProspect(p.clientName, p.id);
        if (atual && !atual.pdfEnviadoEm) {
          const curadoria = await loadCuradoria(p.id);
          const pdf = await dossieToPdf(dossie, atual, mergeConcorrentes(dossie.concorrentes, curadoria));
          const envio = await opts.sendPdfEmail(atual, pdf);
          res.emails.push({ nome: p.nome, envio });
          if (envio === "enviado") await patchProspect(p.clientName, p.id, { pdfEnviadoEm: now.toISOString() });
        }
      }
    } catch (err) {
      res.erros.push({ nome: p.nome, erro: (err as Error).message });
    }
  }
  return res;
}
