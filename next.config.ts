import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer/Chromium NÃO pode ser empacotado pelo Next (binário de ~460MB +
  // resolução do executável em ~/.cache): fica EXTERNO, resolvido em runtime.
  serverExternalPackages: ["puppeteer", "puppeteer-core"],
};

export default nextConfig;
