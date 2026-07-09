/**
 * Service worker (MV3) — o POST pro Radar sai DAQUI, por fora da CSP da página
 * do LinkedIn (um bookmarklet seria bloqueado; a extensão usa host_permissions).
 * O content script manda { endpoint, secret, body }; aqui só fazemos o fetch.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "radar-ingest") return;
  fetch(msg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (msg.secret || ""),
    },
    body: JSON.stringify(msg.body),
  })
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      sendResponse({ ok: r.ok, status: r.status, data });
    })
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // resposta assíncrona
});
