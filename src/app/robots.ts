import type { MetadataRoute } from "next";

/**
 * O Radar é ferramenta PRIVADA — não deve aparecer no Google. Bloqueia todos os
 * crawlers (reforça o header X-Robots-Tag: noindex do next.config). Só a landing
 * (outro domínio) é indexável.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
