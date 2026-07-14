/**
 * TEMPLATE ÚNICO do dossiê (fiel à referência do Rafael) — o MESMO HTML serve a
 * TELA (injetado) e o PDF (impresso pelo Chrome headless). Design system: Archivo,
 * papel #F6F4EF, vermelho #B8443C de acento; hierarquia/tamanhos idênticos à ref.
 *
 * HONESTIDADE: selos [fato]/[inferência]/[validar] discretos + fonte em tudo
 * (inclusive a faixa firmográfica, puxada de dados reais). Gráfico só com dado
 * real: gauge de encaixe derivado; nada fabricado.
 *
 * `@media print` tira o "sheet" (sombra/cantos) e o papel sangra o A4; o rodapé
 * corrido (paginação) vem do puppeteer. Responsivo pra ler bem no celular.
 */

import { formatDateShort, formatDateTimePtBR } from "@/lib/format";
import { nivelEncaixe } from "@/lib/prospects/svg";
import { type ConcorrenteExibido, type ContextoItem, type Dossie, type Natureza, type Prospect, type StatFirmo } from "@/lib/prospects/schema";

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
function srcLink(url?: string, titulo?: string): string {
  if (!url) return "";
  return `<a class="src" href="${esc(url)}">${esc(titulo || host(url))}</a>`;
}
function badge(nat: Natureza): string {
  const cls = nat === "fato" ? "b-fato" : nat === "inferencia" ? "b-inf" : nat === "interno" ? "b-int" : "b-ne";
  const txt = nat === "fato" ? "fato" : nat === "inferencia" ? "inferência" : "não encontrado";
  return `<span class="b ${cls}">${txt}</span>`;
}

/** gauge semicircular idêntico à ref (viewBox 180×104, r76), preenchido por pct. */
function gaugeSvg(pct: number, cor: string, mostra: boolean): string {
  const f = Math.max(0, Math.min(1, pct / 100));
  const x = (90 - 76 * Math.cos(Math.PI * f)).toFixed(1);
  const y = (100 - 76 * Math.sin(Math.PI * f)).toFixed(1);
  const grande = f > 0.5 ? 1 : 0;
  return `<svg viewBox="0 0 180 104" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 100 A76 76 0 0 1 166 100" fill="none" stroke="#e6e1d8" stroke-width="16" stroke-linecap="round"/>
    ${mostra ? `<path d="M14 100 A76 76 0 ${grande} 1 ${x} ${y}" fill="none" stroke="${cor}" stroke-width="16" stroke-linecap="round"/>` : ""}
  </svg>`;
}

const TIPO_CLS: Record<string, string> = { expansão: "exp", parceria: "par", produto: "pro", contratação: "par", rodada: "pro", notícia: "pro" };
const NIVEL_COR: Record<string, string> = { forte: "#3f7d52", médio: "#b98328", fraco: "#a9a196", "sem dado": "#a9a196" };

/** produto "Nome — descrição" → {nome, desc, b2b}. */
function splitProduto(texto: string): { nome: string; desc: string; b2b: boolean } {
  const i = texto.indexOf(" — ");
  const nome = i >= 0 ? texto.slice(0, i) : texto;
  const desc = i >= 0 ? texto.slice(i + 3) : "";
  return { nome, desc, b2b: /\b(PRO|Hospitality|B2B)\b/i.test(nome) };
}

export function dossieToHtml(dossie: Dossie, prospect: Prospect, concorrentes: ConcorrenteExibido[], contexto: ContextoItem[] = []): string {
  const d = dossie;
  const nv = nivelEncaixe(d.encaixe);
  const cor = NIVEL_COR[nv.nivel];
  const quente = d.sinais[0];
  const firmo = d.perfil.firmografia ?? [];

  const meta = [
    prospect.reuniaoEm ? `Reunião: <b>${esc(formatDateTimePtBR(prospect.reuniaoEm))}</b>` : "",
    prospect.contato ? `Contato: <b>${esc(prospect.contato)}</b>` : "",
    `Gerado ${esc(formatDateTimePtBR(d.geradoEm))}`,
  ].filter(Boolean).join("<br>");

  // ── faixa firmográfica (só com dado real; some se vazio) ──
  const stats = firmo.length
    ? `<div class="stats">${firmo.map((s: StatFirmo) => `
        <div class="stat"><div class="n">${esc(s.valor)}</div><div class="l">${esc(s.label)}${s.natureza === "inferencia" ? ` <span class="inf">inf</span>` : ""}${s.fonte_url ? ` · ${srcLink(s.fonte_url)}` : ""}</div></div>`).join("")}</div>`
    : "";

  // ── perfil & portfólio ──
  const sols = d.perfil.produtos.length
    ? `<div class="sols">${d.perfil.produtos.map((p) => {
        const { nome, desc, b2b } = splitProduto(p.texto);
        return `<div class="solitem"><b>${esc(nome)}</b>${b2b ? `<span class="b2b">B2B</span>` : ""}${desc ? ` — ${esc(desc)}` : ""} ${srcLink(p.fonte_url)}</div>`;
      }).join("")}</div>`
    : "";

  // ── concorrentes (curados) ──
  const compBadge = (c: ConcorrenteExibido) =>
    c.origem === "manual" ? `<span class="b b-man">você indicou</span>` : c.estado === "confirmado" ? `<span class="b b-ok">confirmado</span>` : `<span class="b b-val">validar</span>`;
  const concSec = concorrentes.length
    ? `<div class="sec">
        <div class="sectitle">Concorrentes dela <span class="cnt">${concorrentes.length}</span></div>
        <div class="comps">${concorrentes.map((c) => `<div class="comp"><span class="nm">${esc(c.nome)}</span> ${compBadge(c)}<br>${esc(c.nota.texto)} · ${srcLink(c.nota.fonte_url, c.nota.fonte_titulo)}</div>`).join("")}</div>
        <div class="note">Concorrentes do prospect vêm de busca (inferência) ou da sua indicação — sem métrica pública comparável, não forçamos um gráfico. Valide os certos, descarte o ruído.</div>
      </div>`
    : "";

  // ── sinais (timeline) ──
  const sinaisSec = d.sinais.length
    ? `<div class="sec">
        <div class="sectitle">Sinais recentes <span class="cnt">${d.sinais.length}</span></div>
        <div class="tl">${d.sinais.map((s) => {
          const cls = TIPO_CLS[s.tipo] ?? "pro";
          return `<div class="titem"><span class="d c-${cls}"></span><h4>${esc(s.titulo)}</h4><div class="sub"><span class="tag t-${cls}">${esc(s.tipo.toUpperCase())}</span>${s.data ? `${esc(formatDateShort(s.data))} · ` : ""}${srcLink(s.fonte_url, s.fonte_titulo)}</div></div>`;
        }).join("")}</div>
      </div>`
    : `<div class="sec"><div class="sectitle">Sinais recentes</div><div class="empty">Sem movimentos públicos recentes encontrados — sem dado, sem invenção.</div></div>`;

  // ── contexto privado (CONFIDENCIAL — do vendedor: arquivos/notas). interno. ──
  const ctxSec = contexto.length
    ? `<div class="sec">
        <div class="sectitle">Contexto privado <span class="cnt">${contexto.length}</span><span class="privbadge">confidencial</span></div>
        <div class="ctx">
          ${contexto.map((c) => {
            const corpo = c.legivel ? (c.resumo || c.texto).slice(0, 600) : "não foi possível ler o texto — OCR chega na F2 (nada é inventado).";
            return `<div class="ctxitem"><div class="ctxh"><span class="ctxtag">${c.tipo === "nota" ? "nota" : "arquivo"}</span> ${esc(c.nome)} <span class="b b-int">interno</span></div><div class="ctxb">${esc(corpo)}${c.legivel && (c.resumo || c.texto).length > 600 ? "…" : ""}</div></div>`;
          }).join("")}
        </div>
        <p class="micro">Fonte interna (arquivo/nota do vendedor) — confiança alta, mas <b>confidencial</b>. Não apresentar como público.</p>
      </div>`
    : "";

  // ── como nós encaixamos (ângulo já no herói; aqui só dor → resolve) ──
  const brainTag = d.encaixe.brain_mode === "live" ? "BASE REAL" : d.encaixe.brain_mode === "fixture" ? "BASE RASCUNHO" : "SEM BASE";
  const encaixeSec = `<div class="sec">
    <div class="sectitle">Nossa aderência <span class="brainbadge">${brainTag}</span></div>
    ${d.encaixe.dores.length || d.encaixe.ganchos.length ? `<div class="fit">
      <div class="fitcol"><h5>DORES PROVÁVEIS</h5>${(d.encaixe.dores.length ? d.encaixe.dores.map((p) => `<div class="fitrow">${esc(p.texto)}${p.natureza === "interno" ? badge("interno") : ""}</div>`) : [`<div class="empty">— nenhuma dor clara mapeada</div>`]).join("")}</div>
      <div class="fitcol"><h5>COMO A ${esc(d.clientName.toUpperCase())} RESOLVE</h5>${(d.encaixe.ganchos.length ? d.encaixe.ganchos.map((p) => `<div class="sol">${esc(p.texto)}${p.natureza === "interno" ? badge("interno") : ""}</div>`) : [`<div class="empty">— sem gancho da nossa oferta</div>`]).join("")}</div>
    </div>` : `<div class="empty">Sem aderência mapeada ${d.encaixe.brain_mode === "none" ? "— este cliente não tem base de conhecimento no Formare." : "— nada claro cruzou com a nossa oferta."}</div>`}
  </div>`;

  // ── munição ──
  const municaoSec = (d.municao.perguntas.length || d.municao.objecoes.length)
    ? `<div class="sec">
        <div class="sectitle">Preparação pra reunião</div>
        <div class="muni">
          <div><h5>PERGUNTAS PRA FAZER</h5><ul>${d.municao.perguntas.slice(0, 4).map((p) => `<li class="q">${esc(p.texto)}</li>`).join("")}</ul></div>
          <div><h5>OBJEÇÕES PROVÁVEIS &amp; RESPOSTA</h5><ul>${d.municao.objecoes.map((o) => `<li class="o"><b>“${esc(o.objecao)}”</b> — ${esc(o.resposta)}</li>`).join("")}</ul></div>
        </div>
      </div>`
    : "";

  const obsSec = d.observacoes.length ? `<div class="sec"><div class="sectitle">Transparência da base</div>${d.observacoes.map((o) => `<div class="note" style="font-style:normal">· ${esc(o)}</div>`).join("")}</div>` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{ --paper:#F6F4EF; --ink:#221f1a; --muted:#726b62; --faint:#a9a196; --red:#B8443C; --line:#e6e1d8; --green:#3f7d52; --amber:#b98328; --blue:#3b6ea5; }
  *{ box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ background:#e9e5dd; font-family:'Archivo',system-ui,sans-serif; color:var(--ink); -webkit-font-smoothing:antialiased; line-height:1.6; padding:32px 16px; }
  .sheet{ max-width:860px; margin:0 auto; background:var(--paper); border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,.10); overflow:hidden; }
  a{ color:inherit; }
  .topbar{ display:flex; justify-content:space-between; align-items:flex-start; padding:22px 52px; border-bottom:1px solid var(--line); }
  .brand{ display:flex; align-items:center; gap:9px; font-weight:700; letter-spacing:.3px; }
  .brand .dot{ width:12px; height:12px; border-radius:50%; background:var(--red); }
  .brand .kicker{ font-size:12px; letter-spacing:2px; color:var(--muted); font-weight:600; margin-left:6px; }
  .meta{ text-align:right; font-size:13px; color:var(--muted); line-height:1.7; }
  .meta b{ color:var(--ink); font-weight:600; }
  .hero{ display:grid; grid-template-columns:1fr 200px; gap:34px; align-items:center; padding:40px 52px 34px; }
  .company{ font-size:40px; font-weight:800; letter-spacing:-.5px; line-height:1.05; }
  .site{ font-size:14px; color:var(--muted); margin-top:4px; }
  .hotlabel{ display:inline-block; font-size:12px; font-weight:700; letter-spacing:1.5px; color:var(--red); margin:22px 0 8px; }
  .headline{ font-size:25px; font-weight:700; letter-spacing:-.3px; line-height:1.25; }
  .angle{ font-size:16px; color:#3c372f; margin-top:14px; max-width:52ch; }
  .angle b{ font-weight:700; }
  .gauge{ text-align:center; }
  .gauge svg{ width:180px; height:104px; display:block; margin:0 auto; }
  .gauge .val{ font-size:22px; font-weight:800; letter-spacing:.5px; margin-top:-8px; }
  .gauge .cap{ font-size:12px; color:var(--muted); margin-top:3px; }
  .gauge .cap b{ color:var(--ink); }
  .stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--line); border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .stat{ background:var(--paper); padding:16px 20px; }
  .stat .n{ font-size:22px; font-weight:800; letter-spacing:-.3px; }
  .stat .l{ font-size:12px; color:var(--muted); letter-spacing:.4px; margin-top:2px; }
  .stat .inf{ background:#faf1df; color:var(--amber); font-size:9px; font-weight:700; padding:0 4px; border-radius:3px; }
  .sec{ padding:28px 52px; }
  .sec + .sec{ border-top:1px solid var(--line); }
  .sectitle{ font-size:13px; font-weight:700; letter-spacing:1.8px; color:var(--muted); text-transform:uppercase; margin-bottom:16px; display:flex; align-items:center; gap:10px; }
  .sectitle .cnt{ background:#efeae1; color:var(--muted); font-size:12px; font-weight:700; border-radius:20px; padding:1px 9px; }
  .sectitle .brainbadge{ margin-left:auto; background:#e7f0e9; color:var(--green); font-size:11px; font-weight:700; letter-spacing:.5px; padding:3px 10px; border-radius:20px; }
  .lead{ font-size:15px; color:#3c372f; margin-bottom:16px; }
  .sols{ display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; }
  .solitem{ font-size:14.5px; line-height:1.45; }
  .solitem .b2b{ font-size:10.5px; font-weight:700; color:var(--blue); letter-spacing:.5px; margin-left:5px; }
  .comps{ display:grid; grid-template-columns:1fr 1fr; gap:14px 22px; }
  .comp{ font-size:14.5px; line-height:1.45; } .comp .nm{ font-weight:700; }
  .note{ font-size:12.5px; color:var(--faint); margin-top:14px; font-style:italic; }
  .tl{ position:relative; padding-left:26px; }
  .tl:before{ content:""; position:absolute; left:6px; top:6px; bottom:6px; width:2px; background:var(--line); }
  .titem{ position:relative; margin-bottom:18px; } .titem:last-child{ margin-bottom:0; }
  .titem .d{ position:absolute; left:-26px; top:4px; width:12px; height:12px; border-radius:50%; border:2px solid var(--paper); }
  .titem h4{ font-size:16.5px; font-weight:600; line-height:1.35; }
  .titem .sub{ font-size:13px; color:var(--muted); margin-top:2px; }
  .tag{ font-size:11px; font-weight:700; letter-spacing:.8px; margin-right:8px; }
  .src{ color:var(--red); text-decoration:none; }
  .c-exp{ background:var(--green); } .t-exp{ color:var(--green); }
  .c-par{ background:var(--blue); } .t-par{ color:var(--blue); }
  .c-pro{ background:var(--amber); } .t-pro{ color:var(--amber); }
  .fit{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .fitcol h5{ font-size:12px; font-weight:700; letter-spacing:1px; color:var(--muted); margin-bottom:10px; }
  .fitrow{ font-size:14.5px; line-height:1.5; margin-bottom:12px; padding-left:16px; position:relative; }
  .fitrow:before{ content:""; position:absolute; left:0; top:9px; width:6px; height:6px; border-radius:50%; background:var(--faint); }
  .sol{ background:#f2f7f3; border-radius:6px; padding:11px 13px; margin-bottom:10px; font-size:14.5px; line-height:1.5; }
  .muni{ display:grid; grid-template-columns:1fr 1fr; gap:26px; }
  .muni h5{ font-size:12px; font-weight:700; letter-spacing:1px; color:var(--muted); margin-bottom:12px; }
  .muni ul{ list-style:none; }
  .muni li{ font-size:14.5px; line-height:1.5; margin-bottom:11px; padding-left:18px; position:relative; }
  .muni .q:before{ content:"?"; position:absolute; left:0; color:var(--red); font-weight:800; }
  .muni .o:before{ content:"!"; position:absolute; left:2px; color:var(--amber); font-weight:800; }
  .b{ font-size:10.5px; font-weight:700; letter-spacing:.5px; padding:2px 7px; border-radius:4px; vertical-align:middle; margin-left:7px; }
  .b-fato{ background:#eef0ee; color:#5a6b5c; } .b-inf{ background:#faf1df; color:var(--amber); } .b-ne{ background:#efeae1; color:var(--muted); }
  .b-int{ background:#efe7f6; color:#6b4a9c; } /* interno · confidencial */
  .privbadge{ margin-left:auto; background:#efe7f6; color:#6b4a9c; font-size:11px; font-weight:700; letter-spacing:.5px; padding:3px 10px; border-radius:20px; }
  .ctx{ display:grid; gap:10px; }
  .ctxitem{ border:1px solid #e6e1d8; border-left:3px solid #7a5cc0; border-radius:0 8px 8px 0; background:#faf8fc; padding:10px 13px; }
  .ctxh{ font-size:14px; font-weight:700; }
  .ctxtag{ font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#6b4a9c; background:#efe7f6; border-radius:4px; padding:1px 6px; }
  .ctxb{ font-size:13px; line-height:1.5; color:#3c372f; margin-top:3px; }
  .b-val{ background:#faf1df; color:var(--amber); font-size:10px; padding:1px 6px; }
  .b-ok{ background:#e7f0e9; color:var(--green); font-size:10px; padding:1px 6px; }
  .b-man{ background:#221f1a; color:#fff; font-size:10px; padding:1px 6px; }
  .empty{ font-size:14px; color:var(--faint); }
  .foot{ padding:16px 52px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-size:12px; color:var(--faint); }
  @media (max-width:768px){
    body{ padding:0; } .sheet{ border-radius:0; box-shadow:none; }
    .topbar,.hero,.sec,.foot{ padding-left:20px; padding-right:20px; }
    .hero{ grid-template-columns:1fr; gap:18px; } .company{ font-size:32px; } .headline{ font-size:21px; }
    .gauge svg{ width:150px; height:88px; }
    .stats{ grid-template-columns:1fr 1fr; } .sols,.comps,.fit,.muni{ grid-template-columns:1fr; gap:12px; }
    .topbar{ flex-wrap:wrap; gap:8px; } .meta{ text-align:left; }
  }
  @media print{
    body{ background:var(--paper); padding:0; } .sheet{ max-width:none; border-radius:0; box-shadow:none; }
    .foot{ display:none; } .sec,.hero,.snap{ break-inside:avoid; }
    @page{ size:A4; margin:0; }
  }
</style></head>
<body><div class="sheet">
  <div class="topbar"><div class="brand"><span class="dot"></span>Radar <span class="kicker">DOSSIÊ DE PROSPECT</span></div><div class="meta">${meta}</div></div>
  <div class="hero">
    <div>
      <div class="company">${esc(d.nome)}</div>
      <div class="site">${esc(d.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</div>
      ${quente ? `<div class="hotlabel">▲ SINAL MAIS QUENTE</div><div class="headline">${esc(quente.titulo)}</div>` : ""}
      ${d.encaixe.angulo ? `<p class="angle"><b>Seu ângulo:</b> ${esc(d.encaixe.angulo.texto)}</p>` : ""}
    </div>
    <div class="gauge">
      ${gaugeSvg(nv.pct, cor, nv.nivel !== "sem dado")}
      <div class="val" style="color:${cor}">${nv.nivel === "sem dado" ? "SEM DADO" : `ADERÊNCIA ${nv.nivel.toUpperCase()}`}</div>
      <div class="cap"><b>${d.encaixe.brain_mode === "live" ? "Base real" : d.encaixe.brain_mode === "fixture" ? "Base rascunho" : "sem base"}</b>${nv.nivel !== "sem dado" ? ` · ${esc(nv.nota.replace(/^.*?, /, ""))}` : ""}</div>
    </div>
  </div>
  ${stats}
  <div class="sec">
    <div class="sectitle">Perfil &amp; portfólio ${badge(d.perfil.resumo.natureza)}</div>
    <div class="lead">${esc(d.perfil.resumo.texto)} ${srcLink(d.perfil.resumo.fonte_url)}</div>
    ${sols}
  </div>
  ${concSec}
  ${sinaisSec}
  ${ctxSec}
  ${encaixeSec}
  ${municaoSec}
  ${obsSec}
  <div class="foot"><span>Radar · Dossiê de Prospect — fonte e data em cada insight</span><span>${esc(d.nome)}</span></div>
</div></body></html>`;
}

/** rodapé corrido do PDF (paginação + nota de honestidade). */
export function dossieFooterHtml(): string {
  return `<div style="width:100%;font-family:Archivo,sans-serif;font-size:8px;color:#a9a196;padding:5px 34px;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;">
    <span>Radar · Dossiê de Prospect — fonte e data em cada insight</span>
    <span>pág <span class="pageNumber"></span>/<span class="totalPages"></span></span>
  </div>`;
}
