/**
 * TEMPLATE HTML/CSS do dossiê (F2 redesign) — o documento PREMIUM que o Chrome
 * headless imprime em PDF. Design system fiel: Archivo, papel quente #F6F4EF,
 * vermelho radar #B8443C de acento; SVG vetorial pros gráficos.
 *
 * HONESTIDADE ELEGANTE: [fato]/[inferência]/[não encontrado] viram SELOS
 * discretos; fontes viram refs pequenas; sem dado é dito com classe. Beleza não
 * apaga proveniência — o vendedor repete isto na reunião.
 *
 * Gráfico só com DADO REAL: o gauge de encaixe é derivado (marcado); a timeline
 * de sinais é vertical (não fabrica posição por data quando a data falta);
 * comparativo de concorrentes NÃO é forçado (prospect não tem métrica) — vira
 * lista curada e honesta.
 */

import { formatDateShort, formatDateTimePtBR } from "@/lib/format";
import { gaugeEncaixeSvg, nivelEncaixe } from "@/lib/prospects/svg";
import { NATUREZA_LABEL, type ConcorrenteExibido, type Dossie, type Natureza, type Ponto, type Prospect } from "@/lib/prospects/schema";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function selo(nat: Natureza): string {
  const cls = nat === "fato" ? "s-fato" : nat === "inferencia" ? "s-inf" : "s-ne";
  return `<span class="selo ${cls}">${NATUREZA_LABEL[nat]}</span>`;
}
function src(url?: string, titulo?: string): string {
  if (!url) return "";
  return `<a class="src" href="${esc(url)}">${esc(titulo || host(url))}</a>`;
}
/** linha de ponto: texto + selo + fonte. */
function pontoLinha(p: Ponto): string {
  return `<div class="pl">${esc(p.texto)} ${selo(p.natureza)} ${src(p.fonte_url, p.fonte_titulo)}</div>`;
}

const COR_TIPO: Record<string, string> = {
  expansão: "#1f8a4c",
  contratação: "#2a6fdb",
  produto: "#7a5cc0",
  rodada: "#c07a12",
  parceria: "#3a9db0",
  notícia: "#8c8578",
};

const RADAR_MARK = `<svg viewBox="0 0 40 40" width="26" height="26" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="17" fill="none" stroke="#B8443C" stroke-width="1.5" opacity="0.35"/><circle cx="20" cy="20" r="10" fill="none" stroke="#B8443C" stroke-width="1.5" opacity="0.55"/><circle cx="20" cy="20" r="3.5" fill="#B8443C"/><line x1="20" y1="20" x2="34" y2="9" stroke="#B8443C" stroke-width="1.5"/></svg>`;

export function dossieToHtml(dossie: Dossie, prospect: Prospect, concorrentes: ConcorrenteExibido[]): string {
  const d = dossie;
  const nv = nivelEncaixe(d.encaixe);
  const sinalQuente = d.sinais[0];
  const meta = [prospect.reuniaoEm ? `Reunião: ${formatDateTimePtBR(prospect.reuniaoEm)}` : "", prospect.contato ? `Contato: ${esc(prospect.contato)}` : ""].filter(Boolean).join(" · ");

  // ── snapshot executivo ──
  const snapshot = `
  <section class="snap">
    <div class="snap-l">
      <div class="snap-row"><span class="snap-k">Perfil</span><span>${esc(d.perfil.resumo.texto)}</span></div>
      ${sinalQuente ? `<div class="snap-row"><span class="snap-k">Sinal quente</span><span>${esc(sinalQuente.titulo)} ${src(sinalQuente.fonte_url, sinalQuente.fonte_titulo)}</span></div>` : ""}
      ${d.encaixe.angulo ? `<div class="snap-row"><span class="snap-k">Ângulo</span><span class="snap-ang">${esc(d.encaixe.angulo.texto)}</span></div>` : ""}
    </div>
    <div class="snap-r">
      ${gaugeEncaixeSvg(nv)}
      <div class="gauge-cap">encaixe <span class="selo s-inf">derivado</span></div>
      <div class="gauge-note">${esc(nv.nota)}</div>
    </div>
  </section>`;

  // ── perfil ──
  const stats = [
    d.perfil.produtos.length ? `<div class="stat"><b>${d.perfil.produtos.length}</b><span>soluções</span></div>` : "",
    d.perfil.paginas_lidas.length ? `<div class="stat"><b>${d.perfil.paginas_lidas.length}</b><span>páginas lidas</span></div>` : "",
    d.perfil.porte?.texto ? `<div class="stat stat-w"><b>Porte</b><span>${esc(d.perfil.porte.texto)}</span></div>` : "",
  ].filter(Boolean).join("");
  const perfil = `
  <section class="card">
    <h2>Perfil da empresa</h2>
    <p class="lead">${esc(d.perfil.resumo.texto)} ${selo(d.perfil.resumo.natureza)} ${src(d.perfil.resumo.fonte_url)}</p>
    ${d.perfil.tagline?.texto ? `<p class="tagline">“${esc(d.perfil.tagline.texto)}”</p>` : ""}
    ${stats ? `<div class="stats">${stats}</div>` : ""}
    ${d.perfil.produtos.length ? `<div class="chips">${d.perfil.produtos.map((p) => `<span class="chip">${esc(p.texto)}</span>`).join("")}</div>` : ""}
  </section>`;

  // ── sinais (timeline vertical — honesta com/sem data) ──
  const sinais = d.sinais.length
    ? `<section class="card">
        <h2>Sinais recentes <span class="cnt">${d.sinais.length}</span></h2>
        <div class="tl">
          ${d.sinais.map((s) => `
            <div class="tl-item">
              <span class="tl-dot" style="background:${COR_TIPO[s.tipo] ?? "#8c8578"}"></span>
              <div class="tl-body">
                <div class="tl-title">${esc(s.titulo)}</div>
                <div class="tl-meta"><span class="tipo" style="color:${COR_TIPO[s.tipo] ?? "#8c8578"}">${esc(s.tipo)}</span>${s.data ? ` · ${formatDateShort(s.data)}` : ""} ${src(s.fonte_url, s.fonte_titulo)}</div>
              </div>
            </div>`).join("")}
        </div>
      </section>`
    : `<section class="card"><h2>Sinais recentes</h2><p class="empty">Sem movimentos públicos recentes encontrados — sem dado, sem invenção.</p></section>`;

  // ── concorrentes (curados — sem gráfico: prospect não tem métrica comparável) ──
  const concHtml = concorrentes.length
    ? `<section class="card">
        <h2>Concorrentes dela <span class="cnt">${concorrentes.length}</span></h2>
        <div class="conc">
          ${concorrentes.map((c) => {
            const badge = c.origem === "manual" ? `<span class="cb cb-man">você indicou</span>` : c.estado === "confirmado" ? `<span class="cb cb-ok">confirmado</span>` : `<span class="cb cb-val">validar</span>`;
            return `<div class="conc-item"><div class="conc-h">${esc(c.nome)} ${badge}</div><div class="conc-n">${esc(c.nota.texto)} ${src(c.nota.fonte_url, c.nota.fonte_titulo)}</div></div>`;
          }).join("")}
        </div>
        <p class="micro">Concorrentes de prospect vêm de busca (inferência) ou da sua indicação — sem métrica pública comparável, não forçamos um gráfico.</p>
      </section>`
    : "";

  // ── como nós encaixamos (seção-ouro) ──
  const encaixe = `
  <section class="card gold">
    <h2 class="gold-h">Como nós encaixamos <span class="selo ${d.encaixe.brain_mode === "live" ? "s-fato" : "s-inf"}">${d.encaixe.brain_mode === "live" ? "Brain real" : d.encaixe.brain_mode === "fixture" ? "Brain rascunho" : "sem Brain"}</span></h2>
    ${d.encaixe.angulo ? `<div class="ang"><span class="ang-k">Ângulo de abertura</span><p>${esc(d.encaixe.angulo.texto)}</p></div>` : ""}
    ${d.encaixe.dores.length || d.encaixe.ganchos.length ? `
      <div class="two">
        <div class="two-col">
          <div class="two-k dor-k">Dores prováveis</div>
          ${d.encaixe.dores.length ? d.encaixe.dores.map((p) => `<div class="two-item dor">${esc(p.texto)}</div>`).join("") : `<div class="empty">— nenhuma dor clara mapeada</div>`}
        </div>
        <div class="two-col">
          <div class="two-k gan-k">Como resolvemos</div>
          ${d.encaixe.ganchos.length ? d.encaixe.ganchos.map((p) => `<div class="two-item gan">${esc(p.texto)}</div>`).join("") : `<div class="empty">— sem gancho da nossa oferta</div>`}
        </div>
      </div>` : `<p class="empty">Sem encaixe mapeado ${d.encaixe.brain_mode === "none" ? "— este cliente não tem Brain no Formare." : "— nada claro cruzou com a nossa oferta."}</p>`}
  </section>`;

  // ── munição ──
  const municao = (d.municao.perguntas.length || d.municao.objecoes.length)
    ? `<section class="card">
        <h2>Munição de reunião</h2>
        ${d.municao.perguntas.length ? `<div class="mk">Perguntas pra fazer</div><ol class="perg">${d.municao.perguntas.map((p) => `<li>${esc(p.texto)}</li>`).join("")}</ol>` : ""}
        ${d.municao.objecoes.length ? `<div class="mk">Objeções prováveis &amp; resposta</div><div class="objs">${d.municao.objecoes.map((o) => `<div class="obj"><div class="obj-q">“${esc(o.objecao)}”</div><div class="obj-a">→ ${esc(o.resposta)}</div></div>`).join("")}</div>` : ""}
      </section>`
    : "";

  const obs = d.observacoes.length ? `<section class="card obs"><div class="mk">Transparência da base</div>${d.observacoes.map((o) => `<div class="obs-l">· ${esc(o)}</div>`).join("")}</section>` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #F6F4EF; color: #14130f; font-family: Archivo, "Helvetica Neue", Arial, sans-serif; font-size: 10.5px; line-height: 1.5; }
  .page { padding: 26px 34px 20px; }
  a { color: inherit; text-decoration: none; }
  h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; color: #8c8578; margin: 0 0 8px; }
  .cnt { display: inline-block; background: #ece7dd; color: #8c8578; border-radius: 8px; padding: 0 6px; font-size: 9px; vertical-align: middle; }
  /* selos de honestidade */
  .selo { display: inline-block; border-radius: 8px; padding: 1px 6px; font-size: 8px; font-weight: 700; vertical-align: middle; }
  .s-fato { background: #e7effb; color: #2a6fdb; } .s-inf { background: #f6ecd8; color: #c07a12; } .s-ne { background: #ece7dd; color: #8c8578; }
  .src { font-size: 8.5px; color: #a89f8e; border-bottom: 1px dotted #cfc7b8; }
  /* cabeçalho */
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14130f; padding-bottom: 12px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .brand b { font-size: 14px; font-weight: 800; letter-spacing: -.01em; }
  .kicker { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #B8443C; }
  .pname { font-size: 26px; font-weight: 800; letter-spacing: -.02em; line-height: 1.05; margin: 2px 0 0; }
  .psite { font-size: 10px; color: #8c8578; }
  .pmeta { font-size: 9px; color: #8c8578; text-align: right; }
  /* snapshot */
  .snap { display: flex; gap: 14px; background: #fff; border: 1px solid #e7e2d8; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; break-inside: avoid; }
  .snap-l { flex: 1; }
  .snap-row { display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px solid #f0ece3; }
  .snap-row:last-child { border-bottom: 0; }
  .snap-k { flex: 0 0 74px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #B8443C; padding-top: 1px; }
  .snap-ang { font-weight: 600; }
  .snap-r { flex: 0 0 168px; text-align: center; border-left: 1px solid #f0ece3; padding-left: 12px; }
  .gauge-cap { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #8c8578; margin-top: -6px; }
  .gauge-note { font-size: 8px; color: #a89f8e; margin-top: 2px; }
  /* cards */
  .card { background: #fff; border: 1px solid #e7e2d8; border-radius: 12px; padding: 13px 16px; margin-bottom: 12px; break-inside: avoid; }
  .lead { font-size: 11.5px; margin: 0 0 6px; }
  .tagline { border-left: 2px solid #e7e2d8; padding-left: 8px; color: #8c8578; font-style: italic; margin: 6px 0; }
  .pl { padding: 2px 0; }
  .stats { display: flex; gap: 18px; margin: 8px 0; }
  .stat { display: flex; flex-direction: column; } .stat b { font-size: 16px; font-weight: 800; } .stat span { font-size: 8.5px; color: #8c8578; text-transform: uppercase; letter-spacing: .05em; }
  .stat-w b { font-size: 9px; color: #B8443C; } .stat-w span { text-transform: none; letter-spacing: 0; color: #3a362e; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .chip { border: 1px solid #e7e2d8; background: #faf8f3; border-radius: 20px; padding: 3px 9px; font-size: 9.5px; }
  /* timeline */
  .tl { position: relative; padding-left: 4px; }
  .tl-item { position: relative; padding: 0 0 10px 18px; border-left: 2px solid #e7e2d8; margin-left: 4px; }
  .tl-item:last-child { border-left-color: transparent; padding-bottom: 0; }
  .tl-dot { position: absolute; left: -6px; top: 2px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #F6F4EF; }
  .tl-title { font-weight: 600; }
  .tl-meta { font-size: 8.5px; color: #a89f8e; margin-top: 1px; }
  .tl-meta .tipo { text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
  /* concorrentes */
  .conc { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
  .conc-item { padding: 5px 0; }
  .conc-h { font-weight: 700; }
  .conc-n { font-size: 9px; color: #6b6559; }
  .cb { display: inline-block; border-radius: 8px; padding: 0 5px; font-size: 7.5px; font-weight: 700; vertical-align: middle; }
  .cb-man { background: #14130f; color: #fff; } .cb-ok { background: #e6f3ec; color: #1f8a4c; } .cb-val { background: #f6ecd8; color: #c07a12; }
  .micro { font-size: 8px; color: #a89f8e; margin: 8px 0 0; }
  /* encaixe (ouro) */
  .gold { border-color: #edc9c5; background: linear-gradient(180deg, #fbf1f0 0%, #fff 42%); }
  .gold-h { color: #B8443C; }
  .ang { background: #fff; border-left: 3px solid #B8443C; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
  .ang-k { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #B8443C; }
  .ang p { font-size: 12px; font-weight: 600; margin: 3px 0 0; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .two-k { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
  .dor-k { color: #a0526d; } .gan-k { color: #1f8a4c; }
  .two-item { font-size: 9.5px; padding: 6px 9px; border-radius: 7px; margin-bottom: 5px; }
  .two-item.dor { background: #fbf0f3; } .two-item.gan { background: #eef6f0; }
  /* munição */
  .mk { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #8c8578; margin: 8px 0 5px; }
  .perg { margin: 0; padding-left: 18px; } .perg li { padding: 2px 0; }
  .objs { display: grid; gap: 5px; }
  .obj { border: 1px solid #e7e2d8; border-radius: 8px; padding: 6px 10px; }
  .obj-q { font-style: italic; color: #8c8578; } .obj-a { margin-top: 1px; }
  .empty { color: #a89f8e; font-size: 9.5px; }
  .obs { background: #f0ece3; }
  .obs-l { font-size: 8.5px; color: #8c8578; }
</style></head>
<body><div class="page">
  <div class="head">
    <div>
      <div class="brand">${RADAR_MARK}<b>Radar</b><span class="kicker">Dossiê de Prospect</span></div>
      <div class="pname">${esc(d.nome)}</div>
      <div class="psite">${esc(d.siteUrl.replace(/^https?:\/\//, ""))}</div>
    </div>
    <div class="pmeta">${meta ? esc(meta).replace(/ · /g, "<br>") : ""}${meta ? "<br>" : ""}gerado ${formatDateTimePtBR(d.geradoEm)}</div>
  </div>
  ${snapshot}
  ${perfil}
  ${sinais}
  ${concHtml}
  ${encaixe}
  ${municao}
  ${obs}
</div></body></html>`;
}

/** rodapé corrido (paginação + nota de honestidade). */
export function dossieFooterHtml(): string {
  return `<div style="width:100%;font-family:Archivo,sans-serif;font-size:8px;color:#8c8578;background:#F6F4EF;padding:5px 34px;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;">
    <span>Radar · Dossiê de Prospect — fonte e data em cada insight</span>
    <span>pág <span class="pageNumber"></span>/<span class="totalPages"></span></span>
  </div>`;
}
