/**
 * E-MAIL do dossiê em PDF (F2) — reusa o provedor do digest (Resend). Mesmo
 * destinatário POR ORG (config do /admin) + fallback global só na org designada.
 * O PDF vai como ANEXO. Sem chave/destino → 'sem-config'/'sem-destinatario'
 * (honesto, zero efeito). Nunca lança — devolve o desfecho pro cron.
 */

import { sbGetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import { formatDateTimePtBR } from "@/lib/format";
import type { Prospect } from "@/lib/prospects/schema";

export type EnvioPdf = "enviado" | "sem-config" | "sem-destinatario" | `erro: ${string}`;

async function destinatario(orgSlug: string): Promise<string | undefined> {
  if (supabaseEnabled()) {
    const cfg = await sbGetDoc<{ emailTo?: string } | null>("org-config", "digest", null);
    if (cfg?.emailTo) return cfg.emailTo;
  }
  const designada = process.env.RADAR_DIGEST_EMAIL_ORG || "formare";
  return orgSlug === designada ? process.env.RADAR_DIGEST_EMAIL_TO : undefined;
}

/** Envia o PDF do dossiê por e-mail (anexo), pra o destinatário da org. */
export async function sendDossiePdfEmail(prospect: Prospect, pdf: Uint8Array, orgSlug: string): Promise<EnvioPdf> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "sem-config";
  const to = await destinatario(orgSlug);
  if (!to) return "sem-destinatario";

  const from = process.env.RADAR_DIGEST_EMAIL_FROM || "Radar <onboarding@resend.dev>";
  const quando = prospect.reuniaoEm ? formatDateTimePtBR(prospect.reuniaoEm) : "em breve";
  const nome = prospect.nome.replace(/[^\w-]+/g, "-").toLowerCase();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `Dossiê pronto: ${prospect.nome} — reunião ${quando}`,
        html:
          `<div style="font-family:Arial,sans-serif;color:#1c1917;max-width:520px">` +
          `<p style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a8a29e">Radar · Prospect</p>` +
          `<h2 style="margin:2px 0 8px">${prospect.nome}</h2>` +
          `<p style="color:#57534e;font-size:14px">Sua reunião é <b>${quando}</b>. O dossiê (perfil, concorrentes, sinais, encaixe, munição) está no PDF em anexo — e vivo no Radar.</p>` +
          `<p style="color:#a8a29e;font-size:12px">Honestidade: cada ponto traz [fato]/[inferência]/[não encontrado] + fonte. Confira antes de usar.</p>` +
          `</div>`,
        attachments: [{ filename: `dossie-${nome}.pdf`, content: Buffer.from(pdf).toString("base64") }],
      }),
    });
    if (!res.ok) return `erro: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`;
    return "enviado";
  } catch (err) {
    return `erro: ${(err as Error).message.slice(0, 120)}`;
  }
}
