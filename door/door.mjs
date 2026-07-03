/**
 * radar-door — a "porta estreita" (Radar <-> Formare) como SERVIÇO ISOLADO no
 * VPS. v2: LEITURA do Brain (F3). v3: AÇÃO — insight vira card 'ideias' (F4).
 *
 * FONTE DA VERDADE deste arquivo: repo radar-hub, pasta door/ (versionado).
 * Cópia implantada: /root/radar-door/door.mjs (rodando via systemd).
 *
 * SEGURANÇA (por construção):
 * - Guarda a credencial do banco NO SERVIDOR. O Radar nunca a tem — só chama esta porta.
 * - Só aceita chamada com o segredo compartilhado (RADAR_INTAKE_SECRET).
 * - LEITURA (GET /brain): serve APENAS conhecimento CONFIRMADO e não-rascunho
 *   (is_confirmed=true AND authority IN ('canonical','reference')) de UM
 *   workspace, com conteúdo truncado. Rascunhos e pendentes NUNCA saem por aqui.
 * - ESCRITA (POST /intake): DESLIGADA por padrão — só funciona com
 *   DOOR_WRITE_ENABLED=true no ambiente (pedido do Rafael, 02/jul). Quando
 *   ligada, só sabe INSERIR nós PENDENTES (is_confirmed=false) + RASCUNHO
 *   (authority='draft'), carimbados origin=radar — valores LITERAIS no SQL,
 *   o chamador NÃO pode sobrescrevê-los. Nunca UPDATE/DELETE.
 * - Escuta só em 127.0.0.1 (localhost) — não é acessível de fora do servidor.
 *
 * Rodar:  node --env-file=/root/radar-door/.env /root/radar-door/door.mjs
 */

import http from "node:http";
import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
const SECRET = process.env.RADAR_INTAKE_SECRET || "";
const PORT = Number(process.env.RADAR_DOOR_PORT || 8090);
const WRITE_ENABLED = process.env.DOOR_WRITE_ENABLED === "true";

/** Tamanho máximo de conteúdo servido por nó (a leitura é pra ancorar, não pra vazar dossiês). */
const BRAIN_CONTENT_MAX = 1500;
const BRAIN_LIMIT_DEFAULT = 60;
const BRAIN_LIMIT_MAX = 200;

if (!DB_URL) {
  console.error("SUPABASE_DB_URL ausente — abortando.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

function json(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function authorized(req) {
  return Boolean(SECRET) && req.headers.authorization === `Bearer ${SECRET}`;
}

/** GET /brain?workspace=Nome&limit=N — conhecimento CONFIRMADO do cliente. */
async function handleBrainRead(req, res, url) {
  const workspaceName = (url.searchParams.get("workspace") || "").trim();
  if (!workspaceName) return json(res, 400, { error: "workspace obrigatorio" });

  const rawLimit = Number(url.searchParams.get("limit") || BRAIN_LIMIT_DEFAULT);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : BRAIN_LIMIT_DEFAULT, 1),
    BRAIN_LIMIT_MAX,
  );

  const client = await pool.connect();
  try {
    const ws = await client.query("select id from workspaces where name = $1 limit 1", [
      workspaceName,
    ]);
    if (ws.rowCount === 0) {
      return json(res, 404, { error: `cliente nao encontrado: ${workspaceName}` });
    }

    // SÓ conhecimento confirmado e não-rascunho. Canônico primeiro (a verdade
    // institucional), depois por confiança e recência.
    const r = await client.query(
      `select k.type, k.layer, k.material_kind, k.authority, k.confidence,
              left(k.content, $2) as content, k.updated_at
         from knowledge k
        where k.domain_id = $1
          and k.is_confirmed = true
          and k.authority in ('canonical', 'reference')
        order by (k.authority = 'canonical') desc, k.confidence desc, k.updated_at desc
        limit $3`,
      [ws.rows[0].id, BRAIN_CONTENT_MAX, limit],
    );

    return json(res, 200, {
      data: { workspace: workspaceName, count: r.rowCount, nodes: r.rows },
    });
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}

/**
 * GET /workspaces — lista os CLIENTES (workspaces) do Formare, só o nome (F7).
 * Read-only e mínimo: serve pro Radar oferecer os nomes CERTOS ao cadastrar um
 * cliente (o nome precisa casar com workspaces.name pra Brain e cards baterem).
 */
async function handleWorkspacesList(res) {
  const client = await pool.connect();
  try {
    const r = await client.query("select name from workspaces order by name");
    return json(res, 200, { data: { workspaces: r.rows.map((row) => row.name) } });
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}

/**
 * POST /task — "Ação no Formare" (F4): transforma UM item de inteligência do
 * Radar num CARD do Formare, no estágio inicial 'ideias' (a caixa de entrada
 * de trabalho), carimbado com a tag 'radar'. Gated por DOOR_WRITE_ENABLED.
 *
 * FORÇADO NO SERVIDOR (o chamador não pode sobrescrever):
 *   stage='ideias' (nunca pula etapas do fluxo) + tags=['radar'] (rastreável,
 *   descartável em lote). INSERT-only — nunca toca card existente.
 */
async function handleTask(req, res) {
  if (!WRITE_ENABLED) {
    return json(res, 403, {
      error: "porta de escrita DESLIGADA (DOOR_WRITE_ENABLED != true)",
    });
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const workspaceName = typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
  const item = body.item && typeof body.item === "object" ? body.item : null;
  const sinal = String(item?.sinal ?? "").trim();
  const porque = String(item?.porQueImporta ?? "").trim();
  const acao = String(item?.acao ?? "").trim();
  if (!workspaceName || !sinal || !porque || !acao) {
    return json(res, 400, {
      error: "workspaceName + item{sinal, porQueImporta, acao} obrigatorios",
    });
  }

  const fonte = item?.fonte && typeof item.fonte === "object" ? item.fonte : {};
  const concorrente = String(item?.concorrente ?? "").trim();
  const score = Number.isFinite(item?.score) ? Math.round(item.score) : null;

  const title = `[Radar] ${sinal}`.slice(0, 200);
  const description =
    `**Movimento do concorrente${concorrente ? ` (${concorrente})` : ""}:** ${sinal}\n\n` +
    `**Por que importa para ${workspaceName}:** ${porque}\n\n` +
    `**Ação recomendada:** ${acao}\n\n` +
    `**Fonte:** [${fonte.titulo ?? "link"}](${fonte.url ?? ""})\n` +
    (score !== null ? `**Score de impacto (Radar):** ${score}/100\n` : "") +
    `\n— pedido criado pelo Radar em ${new Date().toISOString()}`;

  const client = await pool.connect();
  try {
    const ws = await client.query("select id from workspaces where name = $1 limit 1", [
      workspaceName,
    ]);
    if (ws.rowCount === 0) {
      return json(res, 404, { error: `cliente nao encontrado: ${workspaceName}` });
    }
    const workspaceId = ws.rows[0].id;

    // VALORES DE SEGURANÇA LITERAIS — stage inicial + tag radar. INSERT-only.
    const r = await client.query(
      `insert into cards (workspace_id, title, description, stage, tags)
       values ($1, $2, $3, 'ideias', array['radar'])
       returning id`,
      [workspaceId, title, description],
    );

    return json(res, 200, {
      data: { cardId: r.rows[0].id, workspaceId, workspace: workspaceName },
    });
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}

/**
 * POST /report-task — um RELATÓRIO do Radar vira 1 CARD do Formare (F8).
 * Igual ao /task, mas o corpo é o DOCUMENTO inteiro (markdown), pra o Redator
 * do Formare retomar/refinar. stage='ideias' + tags=['radar','relatorio']
 * FORÇADOS no servidor. INSERT-only. Gated por DOOR_WRITE_ENABLED.
 */
async function handleReportTask(req, res) {
  if (!WRITE_ENABLED) {
    return json(res, 403, { error: "porta de escrita DESLIGADA (DOOR_WRITE_ENABLED != true)" });
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const workspaceName = typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
  const titulo = String(body.titulo ?? "").trim();
  const corpo = String(body.corpo ?? "").trim();
  if (!workspaceName || !titulo || !corpo) {
    return json(res, 400, { error: "workspaceName + titulo + corpo obrigatorios" });
  }

  const title = `[Radar] ${titulo}`.slice(0, 200);
  const description = `${corpo}\n\n— relatório gerado pelo Radar em ${new Date().toISOString()}`;

  const client = await pool.connect();
  try {
    const ws = await client.query("select id from workspaces where name = $1 limit 1", [
      workspaceName,
    ]);
    if (ws.rowCount === 0) {
      return json(res, 404, { error: `cliente nao encontrado: ${workspaceName}` });
    }
    const workspaceId = ws.rows[0].id;

    // VALORES DE SEGURANÇA LITERAIS — stage inicial + tags. INSERT-only.
    const r = await client.query(
      `insert into cards (workspace_id, title, description, stage, tags)
       values ($1, $2, $3, 'ideias', array['radar','relatorio'])
       returning id`,
      [workspaceId, title, description],
    );

    return json(res, 200, {
      data: { cardId: r.rows[0].id, workspaceId, workspace: workspaceName },
    });
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}

/** POST /intake — escrita pendente/rascunho (gated por DOOR_WRITE_ENABLED). */
async function handleIntake(req, res) {
  if (!WRITE_ENABLED) {
    return json(res, 403, {
      error: "porta de escrita DESLIGADA (DOOR_WRITE_ENABLED != true)",
    });
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid json" });
  }

  const workspaceName = typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
  const items = Array.isArray(body.items) ? body.items : [];
  if (!workspaceName || items.length === 0) {
    return json(res, 400, { error: "workspaceName + items obrigatorios" });
  }

  const client = await pool.connect();
  try {
    const ws = await client.query("select id from workspaces where name = $1 limit 1", [
      workspaceName,
    ]);
    if (ws.rowCount === 0) {
      return json(res, 404, { error: `cliente nao encontrado: ${workspaceName}` });
    }
    const domainId = ws.rows[0].id;

    const ids = [];
    for (const it of items) {
      const sinal = String(it?.sinal ?? "").trim();
      const porque = String(it?.porQueImporta ?? "").trim();
      const acao = String(it?.acao ?? "").trim();
      if (!sinal || !porque || !acao) continue;

      const fonte = it?.fonte && typeof it.fonte === "object" ? it.fonte : {};
      const content =
        `[Radar] ${sinal}\n\n` +
        `Por que importa: ${porque}\n\n` +
        `Acao sugerida: ${acao}\n\n` +
        `Fonte: ${fonte.titulo ?? ""} - ${fonte.url ?? ""}`;
      const metadata = JSON.stringify({
        origin: "radar",
        score: Number.isFinite(it?.score) ? it.score : null,
        fonte,
        inserted_at: new Date().toISOString(),
      });

      // VALORES DE SEGURANÇA LITERAIS — o chamador não pode sobrescrever.
      const r = await client.query(
        `insert into knowledge
           (type, layer, domain_id, content, confidence, source, is_confirmed, authority, material_kind, metadata, embedding)
         values
           ('finding', 'competitor', $1, $2, 0.4, 'auto_discovery', false, 'draft', 'concorrente', $3::jsonb, null)
         returning id`,
        [domainId, content, metadata],
      );
      ids.push(r.rows[0].id);
    }

    return json(res, 200, { data: { inserted: ids.length, ids, workspace: workspaceName } });
  } catch (e) {
    return json(res, 500, { error: String(e?.message ?? e) });
  } finally {
    client.release();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, write: WRITE_ENABLED ? "on" : "off" });
  }

  // Tudo além do /health exige o segredo.
  if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && url.pathname === "/brain") {
    return handleBrainRead(req, res, url);
  }
  if (req.method === "GET" && url.pathname === "/workspaces") {
    return handleWorkspacesList(res);
  }
  if (req.method === "POST" && url.pathname === "/task") {
    return handleTask(req, res);
  }
  if (req.method === "POST" && url.pathname === "/report-task") {
    return handleReportTask(req, res);
  }
  if (req.method === "POST" && url.pathname === "/intake") {
    return handleIntake(req, res);
  }
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `radar-door v2 ouvindo em http://127.0.0.1:${PORT} (só localhost) — leitura ON, escrita ${WRITE_ENABLED ? "ON" : "OFF"}`,
  );
});
