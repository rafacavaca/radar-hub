# A Porta Estreita (Radar → Brain do Formare)

> **Status: PROPOSTA. Nada aqui está instalado no Formare.** Só vai ao ar com o **OK explícito do Rafael** — e depois do backup (já feito).

## Em linguagem simples

O Radar precisa entregar suas descobertas ao Formare. Mas o Formare está **no ar** e guarda os dados dos clientes. Então a entrega passa por uma **"fenda de correspondência"**: o Radar **enfia um bilhete** por uma portinha, e o bilhete cai numa **caixa de entrada invisível** (a aba **Revisar**). Só quando o Rafael confirma é que vira conhecimento de verdade.

Garantias (por construção, não por confiança):

1. **O Radar nunca tem a chave-mestra** do banco. Ele só tem o **endereço da fenda + uma senha** que abre **só essa fenda**.
2. **Todo bilhete entra como "a confirmar" e "rascunho"** — e **rascunho é invisível para os agentes do Formare** (Redator, Estrategista…). Mesmo que o Radar erre feio, **nada contamina o trabalho real** até o Rafael aprovar.
3. **A fenda só SABE inserir bilhetes novos.** Ela **não consegue** editar nem apagar nada que já existe. Impossível corromper o que já está lá.
4. **Todo bilhete é carimbado "veio do radar"** — dá pra filtrar e descartar em lote com um clique.
5. É **uma adição pequena e isolada** ao Formare (um arquivo novo + poucas linhas). Não muda nada do que já funciona.

## O que a fenda faz, tecnicamente

Um endpoint novo no Formare: `POST /api/radar/intake`.

- **Autenticação:** um **segredo compartilhado** no cabeçalho (`Authorization: Bearer <RADAR_INTAKE_SECRET>`). Não usa a sessão do Rafael e **não expõe a `service_role`** — a `service_role` fica **dentro** do Formare (no servidor), o Radar nunca a vê.
- **Escrita:** insere linhas na tabela `knowledge` com **valores de segurança FORÇADOS pelo servidor** (o Radar **não pode** sobrescrevê-los):
  - `is_confirmed = false`  → cai na fila do **Revisar**.
  - `authority = 'draft'`   → **nunca** servido aos agentes (o `retrieveForAgent` do Formare exclui rascunhos). Nunca `'canonical'`/`'reference'`.
  - `source = 'auto_discovery'` + `metadata.origin = 'radar'` → rastreável (o enum `knowledge_source` do Formare **não tem** o valor `'radar'`, então a origem vai no `metadata`).
  - `layer = 'competitor'`, `type = 'finding'`, `confidence = 0.4`, `material_kind = 'concorrente'`.
  - **Apenas `INSERT`.** Nunca `UPDATE`/`DELETE`. Nunca toca nó confirmado.
- **Cliente:** resolvido pelo nome (`workspaces.name` é único) → `domain_id`.

### Código proposto (a ser adicionado ao Formare, com seu OK)

`src/app/api/radar/intake/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client";

// Segredo só desta porta. Definir no .env do Formare como RADAR_INTAKE_SECRET.
const RADAR_SECRET = process.env.RADAR_INTAKE_SECRET ?? "";

const ItemSchema = z.object({
  sinal: z.string().min(1),
  porQueImporta: z.string().min(1),
  acao: z.string().min(1),
  fonte: z.object({ url: z.string().url(), titulo: z.string().min(1) }),
  score: z.number().int().min(0).max(100),
});
const BodySchema = z.object({
  workspaceName: z.string().min(1),
  items: z.array(ItemSchema).min(1).max(50),
});

export async function POST(request: NextRequest) {
  // 1) Auth por segredo compartilhado — NÃO usa a sessão; a service_role fica no servidor.
  const auth = request.headers.get("authorization");
  if (!RADAR_SECRET || auth !== `Bearer ${RADAR_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  // 2) Validação estrita do corpo.
  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "payload inválido", details: parsed.error.flatten() }, { status: 400 });
  }
  const { workspaceName, items } = parsed.data;

  const db = getServerClient();

  // 3) Resolver o cliente pelo nome (workspaces.name é UNIQUE).
  const { data: ws, error: wsErr } = await db
    .from("workspaces").select("id").eq("name", workspaceName).single();
  if (wsErr || !ws) {
    return NextResponse.json({ error: `cliente não encontrado: ${workspaceName}` }, { status: 404 });
  }

  // 4) VALORES DE SEGURANÇA FORÇADOS — o Radar não pode sobrescrever. Só INSERT.
  const now = new Date().toISOString();
  const rows = items.map((it) => ({
    type: "finding",
    layer: "competitor",
    domain_id: ws.id,
    content:
      `[Radar] ${it.sinal}\n\n` +
      `Por que importa: ${it.porQueImporta}\n\n` +
      `Ação sugerida: ${it.acao}\n\n` +
      `Fonte: ${it.fonte.titulo} — ${it.fonte.url}`,
    confidence: 0.4,
    source: "auto_discovery",
    is_confirmed: false, // FORÇADO
    authority: "draft",  // FORÇADO — invisível aos agentes até o Rafael confirmar
    material_kind: "concorrente",
    metadata: { origin: "radar", score: it.score, fonte: it.fonte, created_at: now },
    embedding: null,
  }));

  const { data: inserted, error: insErr } = await db.from("knowledge").insert(rows).select("id");
  if (insErr) {
    return NextResponse.json({ error: "falha ao inserir", detail: String(insErr.message) }, { status: 500 });
  }
  return NextResponse.json({ data: { inserted: inserted?.length ?? 0, workspace: workspaceName } });
}
```

### Ajuste no middleware do Formare (mínimo)

O middleware do Formare hoje bloqueia todo `/api/*` sem sessão (retorna 401). Como esta porta usa o **segredo compartilhado** (não a sessão), é preciso **isentar `/api/radar/*` do check de sessão** — o próprio endpoint faz a sua checagem de segredo. É uma exceção pontual (poucas linhas), a ser feita na hora da instalação, com o Rafael, lendo o middleware real.

## O que o Radar envia (contrato)

`POST {RADAR_INTAKE_URL}` com header `Authorization: Bearer {RADAR_INTAKE_SECRET}` e corpo:

```json
{
  "workspaceName": "Moovefy",
  "items": [
    { "sinal": "...", "porQueImporta": "...", "acao": "...",
      "fonte": { "url": "https://...", "titulo": "..." }, "score": 78 }
  ]
}
```

O Radar guarda apenas `RADAR_INTAKE_URL` + `RADAR_INTAKE_SECRET` no seu próprio `.env.local`. **Nenhuma credencial do banco do Formare.**

## Como testamos ANTES de ligar (modo seguro / dry-run)

Enquanto a porta não está instalada e aprovada, o botão "Gerar no Formare" roda em **dry-run**: monta o bilhete **exatamente** como iria (com os valores de segurança) e o **registra localmente** (numa "caixa de saída" do Radar), **sem enviar nada ao Formare**. Assim dá pra provar o loop inteiro (critério 5) sem tocar na produção.

## Pra ligar de verdade (o que preciso do Rafael)

1. **Aprovar** este desenho.
2. Uma **senha nova** só pra esta porta (eu gero, você guarda) → vira `RADAR_INTAKE_SECRET` nos dois lados.
3. Confirmar que **"Moovefy" existe como cliente no Formare** (senão eu ajudo a criar).
4. Então: instalo o endpoint no Formare (1 arquivo + o ajuste do middleware), faço deploy, e aponto o Radar pra ele. Testo com **1 bilhete** e a gente confere junto que ele caiu na aba **Revisar** como rascunho.
