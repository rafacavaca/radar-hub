/**
 * Troca um token CURTO da Meta (Graph API Explorer, dura ~2h) por um token
 * LONGO (~60 dias) — o que vai no .env.local como META_AD_LIBRARY_TOKEN.
 *
 * Uso: npm run meta:token -- <APP_ID> <APP_SECRET> <TOKEN_CURTO>
 * (passos pra obter os três: docs/meta-ad-library-setup.md)
 */

const [appId, appSecret, shortToken] = process.argv.slice(2);

if (!appId || !appSecret || !shortToken) {
  console.error("uso: npm run meta:token -- <APP_ID> <APP_SECRET> <TOKEN_CURTO>");
  process.exit(1);
}

const url =
  "https://graph.facebook.com/v23.0/oauth/access_token" +
  `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
  `&client_secret=${encodeURIComponent(appSecret)}` +
  `&fb_exchange_token=${encodeURIComponent(shortToken)}`;

const res = await fetch(url);
const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };

if (!res.ok || json.error || !json.access_token) {
  console.error(`\n❌ Troca falhou: ${json.error?.message ?? `HTTP ${res.status}`}\n`);
  console.error("Confere: App ID e App Secret (Configurações → Básico do app) e se o token curto ainda não expirou (~2h).");
  process.exit(1);
}

const dias = json.expires_in ? Math.round(json.expires_in / 86400) : 60;
console.log(`\n✅ Token LONGO gerado (validade ~${dias} dias):\n`);
console.log(json.access_token);
console.log("\nPróximos passos:");
console.log("  1. Colar em /root/radar-hub/.env.local →  META_AD_LIBRARY_TOKEN=<token>");
console.log("  2. systemctl restart radar-hub");
console.log("  3. npm run smoke:metaads  (verifica a conexão)\n");
