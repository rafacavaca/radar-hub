/**
 * Content script — injeta "◎ Radar" em cada post do LinkedIn. Ao clicar, extrai
 * autor/texto/data-relativa/url, abre um mini-popup pra você CONFIRMAR
 * perfil/papel/workspace (auto-preenchido pelo pré-registro em config.js) e
 * manda pro service worker, que POSTa no Radar (por fora da CSP da página).
 *
 * Captura ASSISTIDA: a extração é best-effort; o popup deixa você corrigir antes
 * de enviar. Nada sai sem o seu clique.
 */
(() => {
  const CFG = globalThis.RADAR_CONFIG;
  if (!CFG || !CFG.endpoint) {
    console.warn("[Radar] config.js ausente/incompleto — copie config.example.js para config.js.");
    return;
  }

  const POST_SELECTOR = ".feed-shared-update-v2, [data-urn*='urn:li:activity']";
  const text = (el) => (el ? (el.innerText || "").replace(/\s+/g, " ").trim() : "");

  /** Acha o texto do post dentro do container (com fallbacks). */
  function extractText(container) {
    const el = container.querySelector(
      ".update-components-text, .feed-shared-update-v2__description, .update-components-update-v2__commentary",
    );
    const t = text(el);
    if (t) return t;
    return text(container).slice(0, 1200);
  }

  /** Nome do autor (perfil) — primeira linha do bloco de ator. */
  function extractAuthor(container) {
    const el = container.querySelector(
      ".update-components-actor__title, .update-components-actor__name, .update-components-actor__meta a span[aria-hidden='true']",
    );
    return text(el).split("\n")[0].split("•")[0].trim();
  }

  /** Data relativa ("2 sem", "1 mês", "3 d", "agora"…) do sub-cabeçalho do ator. */
  function extractRelDate(container) {
    const sub = text(container.querySelector(".update-components-actor__sub-description")) || text(container.querySelector("time"));
    if (/agora|now|há pouco|instante/i.test(sub)) return "agora";
    const m = sub.match(/(\d+\s*(?:min|minutos?|h|horas?|d|dias?|sem|semanas?|m[eê]s(?:es)?|anos?|w|mo|a)\b)/i);
    return m ? m[1] : "";
  }

  /** URL do post (permalink), com fallbacks. */
  function extractUrl(container) {
    const a = container.querySelector("a[href*='/feed/update/'], a[href*='activity']");
    if (a && a.href) return a.href.split("?")[0];
    const urn = container.getAttribute("data-urn");
    if (urn && urn.includes("activity")) return "https://www.linkedin.com/feed/update/" + urn;
    return location.href.split("?")[0];
  }

  /** Auto-roteia: casa autor OU qualquer link do post com o pré-registro. */
  function autoMatch(container, author) {
    const hrefs = Array.from(container.querySelectorAll("a[href]")).map((a) => a.href.toLowerCase());
    const hay = (author + " " + hrefs.join(" ")).toLowerCase();
    return (CFG.profiles || []).find((p) => hay.includes(String(p.match).toLowerCase())) || null;
  }

  // ── mini-popup de confirmação ───────────────────────────────────────────────
  function openPopup(extracted) {
    document.getElementById("radar-popup")?.remove();
    const wrap = document.createElement("div");
    wrap.id = "radar-popup";
    wrap.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;background:#fff;border:1px solid #d6d3d1;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;padding:14px;";
    const m = extracted.match;
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-weight:700;margin-bottom:8px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span> Enviar pro Radar
      </div>
      <label style="display:block;font-size:11px;color:#78716c;margin-bottom:2px;">Perfil</label>
      <input id="r-perfil" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d6d3d1;border-radius:8px;margin-bottom:8px;" value="${escapeHtml(m?.perfil || extracted.author)}"/>
      <label style="display:block;font-size:11px;color:#78716c;margin-bottom:2px;">Papel</label>
      <div style="display:flex;gap:12px;margin-bottom:8px;">
        <label><input type="radio" name="r-papel" value="concorrente" ${(m?.papel || "concorrente") === "concorrente" ? "checked" : ""}/> concorrente</label>
        <label><input type="radio" name="r-papel" value="conta-chave" ${m?.papel === "conta-chave" ? "checked" : ""}/> conta-chave</label>
      </div>
      <label style="display:block;font-size:11px;color:#78716c;margin-bottom:2px;">Workspace</label>
      <input id="r-ws" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d6d3d1;border-radius:8px;margin-bottom:8px;" value="${escapeHtml(m?.workspace || CFG.defaultWorkspace || "")}"/>
      <label style="display:block;font-size:11px;color:#78716c;margin-bottom:2px;">Texto (${escapeHtml(extracted.relDate || "sem data")})</label>
      <textarea id="r-texto" rows="4" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d6d3d1;border-radius:8px;margin-bottom:10px;">${escapeHtml(extracted.texto)}</textarea>
      <div id="r-msg" style="font-size:12px;margin-bottom:8px;"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="r-cancel" style="padding:6px 12px;border:1px solid #d6d3d1;background:#fff;border-radius:8px;cursor:pointer;">Cancelar</button>
        <button id="r-send" style="padding:6px 14px;border:0;background:#1c1917;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">Enviar</button>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#r-cancel").onclick = () => wrap.remove();
    wrap.querySelector("#r-send").onclick = () => send(wrap, extracted);
  }

  /** Pega o segredo: guardado no navegador -> config.js -> pergunta uma vez (e guarda). */
  function ensureSecret() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["radarSecret"], (r) => {
        let s = (r && r.radarSecret) || CFG.secret || "";
        if (!s || s === "__RADAR_INGEST_SECRET__") {
          s = (window.prompt("Cole o segredo do Radar (só uma vez):") || "").trim();
          if (s) chrome.storage.local.set({ radarSecret: s });
        }
        resolve(s);
      });
    });
  }

  function send(wrap, extracted) {
    const msgEl = wrap.querySelector("#r-msg");
    const btn = wrap.querySelector("#r-send");
    const body = {
      perfil: wrap.querySelector("#r-perfil").value.trim(),
      papel: wrap.querySelector("input[name='r-papel']:checked")?.value || "concorrente",
      workspace: wrap.querySelector("#r-ws").value.trim(),
      texto: wrap.querySelector("#r-texto").value.trim(),
      data_publicacao: extracted.relDate || "",
      data_coleta: new Date().toISOString(),
      url: extracted.url,
    };
    btn.disabled = true;
    msgEl.style.color = "#78716c";
    msgEl.textContent = "Enviando…";
    ensureSecret().then((secret) => {
      if (!secret) {
        btn.disabled = false;
        msgEl.style.color = "#dc2626";
        msgEl.textContent = "Sem o segredo do Radar — clique Enviar de novo e cole.";
        return;
      }
      chrome.runtime.sendMessage(
        { type: "radar-ingest", endpoint: CFG.endpoint, secret, body },
        (res) => {
          if (res && res.ok) {
            msgEl.style.color = "#047857";
            msgEl.textContent = "✓ Enviado pro Radar (" + body.papel + ")";
            setTimeout(() => wrap.remove(), 1400);
          } else {
            btn.disabled = false;
            msgEl.style.color = "#dc2626";
            msgEl.textContent = "Falhou: " + (res?.data?.error || res?.error || "erro " + (res?.status || "?"));
          }
        },
      );
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ── injeta o botão em cada post ─────────────────────────────────────────────
  function injectButton(container) {
    if (container.dataset.radarBtn) return;
    container.dataset.radarBtn = "1";
    const btn = document.createElement("button");
    btn.textContent = "◎ Radar";
    btn.title = "Enviar este post pro Radar";
    btn.style.cssText =
      "position:absolute;top:8px;right:44px;z-index:50;padding:2px 8px;font:600 11px/1.4 sans-serif;color:#ef4444;background:#fff;border:1px solid #fca5a5;border-radius:999px;cursor:pointer;opacity:.85;";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const author = extractAuthor(container);
      openPopup({
        author,
        texto: extractText(container),
        relDate: extractRelDate(container),
        url: extractUrl(container),
        match: autoMatch(container, author),
      });
    };
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(btn);
  }

  function scan() {
    document.querySelectorAll(POST_SELECTOR).forEach(injectButton);
  }

  // scan inicial + observa o feed (LinkedIn carrega posts dinamicamente).
  scan();
  const obs = new MutationObserver(() => scan());
  obs.observe(document.body, { childList: true, subtree: true });
})();
