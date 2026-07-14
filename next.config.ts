import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer/Chromium NÃO pode ser empacotado pelo Next (binário de ~460MB +
  // resolução do executável em ~/.cache): fica EXTERNO, resolvido em runtime.
  serverExternalPackages: ["puppeteer", "puppeteer-core"],

  // Sem source map do cliente em produção (não vaza nosso código; já é o default
  // do Next, aqui explícito por segurança).
  productionBrowserSourceMaps: false,

  // Cabeçalhos de segurança em TODAS as respostas do app.
  //  - X-Robots-Tag noindex: o Radar é ferramenta privada, NÃO pode indexar no
  //    Google (só a landing indexa, e ela é outro app/domínio).
  //  - anti-clickjacking / nosniff / referrer enxuto.
  // (CSP forte fica pra um passo dedicado — exige testar inline scripts do Next e
  //  o iframe do dossiê pra não quebrar o app.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
