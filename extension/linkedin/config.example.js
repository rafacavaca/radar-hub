/**
 * CONFIG da extensão.
 *
 * Você NÃO precisa mexer no segredo aqui: na primeira vez que enviar um post, a
 * extensão pergunta o "segredo do Radar" e guarda no navegador (não fica em
 * arquivo). Se quiser, ajuste só a lista `profiles` (os perfis que você segue).
 */
globalThis.RADAR_CONFIG = {
  endpoint: "https://radar.formare.tech/api/ingest",
  secret: "", // deixe vazio — a extensão pergunta o segredo uma vez e guarda no navegador
  defaultWorkspace: "TAGAT Foodtech",
  // Pré-registro: quando a URL/nome do post casar `match`, auto-preenche papel/workspace/perfil.
  profiles: [
    { match: "mtech", perfil: "Mtech", papel: "concorrente", workspace: "TAGAT Foodtech" },
    { match: "brainr", perfil: "Brainr", papel: "concorrente", workspace: "TAGAT Foodtech" },
    { match: "gtf", perfil: "GTF", papel: "conta-chave", workspace: "TAGAT Foodtech" },
    { match: "natto", perfil: "Natto Alimentos", papel: "conta-chave", workspace: "TAGAT Foodtech" },
  ],
};
