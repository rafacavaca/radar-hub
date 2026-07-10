/**
 * E-MAIL DO DIGEST (ritual F1) — opt-in. Destinatário POR ORG:
 *
 *  1. o configurado no /admin (org_docs kind "org-config" key "digest",
 *     campo emailTo) — cada agência recebe o PRÓPRIO digest, nunca o de outra
 *     (a leitura é org-scoped: roda dentro do contexto da org no cron);
 *  2. fallback: RADAR_DIGEST_EMAIL_TO (env global) SÓ para a org designada
 *     (RADAR_DIGEST_EMAIL_ORG, default "formare") — o e-mail do Rafael.
 *
 * Envs: RESEND_API_KEY (obrigatória pro disparo) · RADAR_DIGEST_EMAIL_FROM
 * (remetente verificado; até verificar o domínio, o default de teste do Resend
 * só entrega pro dono da conta). Sem chave -> "sem-config"; sem destinatário
 * -> "sem-destinatario" (log honesto, zero efeito). O render é puro.
 */

import { sbGetDoc } from "@/lib/db/repo-org-docs";
import { supabaseEnabled } from "@/lib/db/supabase";
import type { Digest, DigestItem } from "@/lib/digest";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function itemHTML(item: DigestItem, voltou: boolean): string {
  const fonte = item.fonte?.url
    ? `<a href="${esc(item.fonte.url)}" style="color:#78716c">${esc(item.fonte.titulo || item.fonte.url)}</a>`
    : "sem fonte externa";
  return `
  <tr><td style="padding:12px 0;border-top:1px solid #e7e5e4">
    <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a8a29e">
      ${esc(item.clientName)} · ${voltou ? "adiado ontem" : esc(item.origem)}
    </div>
    <div style="font-size:15px;font-weight:600;color:#1c1917;margin-top:3px">${esc(item.titulo)}</div>
    <div style="font-size:13px;color:#57534e;margin-top:3px">${esc(item.detalhe)}</div>
    ${item.acao ? `<div style="font-size:13px;color:#44403c;margin-top:3px"><b>Ação:</b> ${esc(item.acao)}</div>` : ""}
    <div style="font-size:11px;color:#a8a29e;margin-top:5px">${fonte}${item.data ? ` · ${esc(item.data.slice(0, 10))}` : ""}</div>
  </td></tr>`;
}

/** HTML do digest (puro, testável). Sóbrio, sem imagem, lê bem em qualquer cliente. */
export function renderDigestEmailHTML(digest: Digest, appUrl: string): string {
  const corpo = digest.tranquilo
    ? `<tr><td style="padding:28px 0;text-align:center;color:#57534e;font-size:14px">
         ☀ <b>Dia tranquilo.</b><br/>Nada exige tua atenção agora.
       </td></tr>`
    : [
        ...digest.adiados.map((i) => itemHTML(i, true)),
        ...digest.itens.map((i) => itemHTML(i, false)),
      ].join("\n");
  const obs = digest.observacoes.length
    ? `<tr><td style="padding-top:14px;font-size:11px;color:#a8a29e">${digest.observacoes.map(esc).join("<br/>")}</td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:24px">
      <tr><td>
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a8a29e">Radar · Hoje</div>
        <div style="font-size:19px;font-weight:700;color:#1c1917;margin-top:2px">Digest de ${esc(digest.day)}</div>
      </td></tr>
      ${corpo}
      ${obs}
      <tr><td style="padding-top:18px;font-size:12px;color:#78716c">
        Processa o inbox na tela <a href="${esc(appUrl)}/hoje" style="color:#dc2626">Hoje</a> — Atuado · Amanhã · Ignorar.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export type EnvioDigest = "enviado" | "sem-config" | "sem-destinatario" | `erro: ${string}`;

/**
 * Envia o digest por e-mail: destinatário da PRÓPRIA org (config do /admin) ou,
 * na org designada, o fallback global. Nunca lança — devolve o desfecho pro log.
 */
export async function maybeSendDigestEmail(digest: Digest, orgSlug: string): Promise<EnvioDigest> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "sem-config";

  // 1º o destinatário configurado NA org (leitura org-scoped, dentro do contexto);
  // 2º o fallback global, só pra org designada (o e-mail do dono).
  let to: string | undefined;
  if (supabaseEnabled()) {
    const cfg = await sbGetDoc<{ emailTo?: string } | null>("org-config", "digest", null);
    to = cfg?.emailTo || undefined;
  }
  if (!to) {
    const designada = process.env.RADAR_DIGEST_EMAIL_ORG || "formare";
    to = orgSlug === designada ? process.env.RADAR_DIGEST_EMAIL_TO : undefined;
  }
  if (!to) return "sem-destinatario";

  const from = process.env.RADAR_DIGEST_EMAIL_FROM || "Radar <onboarding@resend.dev>";
  const appUrl = process.env.RADAR_APP_URL || "https://radar.formare.tech";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: digest.tranquilo ? `Radar hoje — dia tranquilo (${digest.day})` : `Radar hoje — ${digest.itens.length + digest.adiados.length} item(ns) (${digest.day})`,
        html: renderDigestEmailHTML(digest, appUrl),
      }),
    });
    if (!res.ok) return `erro: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`;
    return "enviado";
  } catch (err) {
    return `erro: ${(err as Error).message.slice(0, 120)}`;
  }
}
