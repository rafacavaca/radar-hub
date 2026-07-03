/**
 * Usuários da fechadura do Radar — MULTI-USUÁRIO por env.
 *
 * O portão (`src/proxy.ts`) roda como middleware EDGE: sem acesso a disco, só
 * `process.env`. Por isso os usuários vivem em variáveis de ambiente, não num
 * arquivo:
 *  - RADAR_APP_EMAIL / RADAR_APP_PASSWORD — o login principal (o do Rafael; mantido).
 *  - RADAR_APP_USERS — usuários extras, "email:senha" separados por VÍRGULA.
 *    Ex.: "fulano@x.com:segredo,ciclana@y.com:outra". O e-mail não tem ":"; a
 *    senha pode ter ":" (separa-se só no 1º). Evite VÍRGULA na senha (é o
 *    separador entre usuários).
 *
 * Função PURA (env + string) — serve em edge (proxy) e node (rota /entrar).
 * O cookie continua sendo o SHA-256 de "email:senha" de CADA usuário, então
 * adicionar gente não invalida as sessões de quem já estava dentro.
 */

export type AuthUser = { email: string; password: string };

export function getAuthUsers(): AuthUser[] {
  const users: AuthUser[] = [];

  const mainEmail = process.env.RADAR_APP_EMAIL?.trim().toLowerCase();
  const mainPassword = process.env.RADAR_APP_PASSWORD;
  if (mainEmail && mainPassword) users.push({ email: mainEmail, password: mainPassword });

  const extra = process.env.RADAR_APP_USERS?.trim();
  if (extra) {
    for (const entry of extra.split(",")) {
      const raw = entry.trim();
      const i = raw.indexOf(":");
      if (i <= 0) continue; // sem ":" ou sem e-mail antes dele -> ignora
      const email = raw.slice(0, i).trim().toLowerCase();
      const password = raw.slice(i + 1); // resto = senha (pode conter ":")
      if (email && password) users.push({ email, password });
    }
  }

  return users;
}

/** Devolve o usuário se e-mail+senha baterem com algum cadastrado; senão null. */
export function findAuthUser(email: string, password: string): AuthUser | null {
  const wanted = email.trim().toLowerCase();
  return getAuthUsers().find((u) => u.email === wanted && u.password === password) ?? null;
}
