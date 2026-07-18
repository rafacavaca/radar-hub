# Radar Hub

Radar Hub é um **analista de inteligência de mercado operado por IA**. Ele monitora
os **concorrentes, as contas-chave e o mercado** de cada cliente de uma agência,
**cruza** cada movimento com o que a agência sabe daquele cliente (a *base de
conhecimento*), e entrega **recomendações prontas para agir** — não só alertas.

É a **metade sensorial** de um organismo cujo braço executor é o
**[OS Formare](https://os.formare.tech)**:

> **Radar sente → a base de conhecimento lembra → Formare age.**

O Radar é um **produto separado** do Formare (repositório, banco e deploy
próprios), mas **compartilha a base de conhecimento** dele — e a acessa apenas por
uma **porta estreita** (um serviço HTTP local: leitura ao vivo, escrita
travada). É **multi-tenant**: cada agência tem a sua org, e o isolamento vive
**no banco** (RLS), não na tela.

---

## Se você acabou de chegar (primeiro dia)

Um dev experiente lê o código melhor que qualquer doc. O que o código **não conta**
é a **intenção** — por que as coisas são como são. Sem isso, é fácil "limpar" uma
decisão boa por engano e destruir a alma do produto. Leia nesta ordem antes de mexer:

1. **[`docs/PRINCIPIOS.md`](docs/PRINCIPIOS.md)** — os inegociáveis. **Leia inteiro.** É o que protege o produto.
2. **[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)** — o desenho real e o caminho de um sinal, ponta a ponta.
3. **[`docs/DADOS.md`](docs/DADOS.md)** — o modelo de dados e as **armadilhas** (as tabelas fantasma).
4. Prove que entendeu o essencial rodando os testes:
   ```bash
   npm run test:isolation   # o isolamento entre agências (o inegociável nº 1)
   npm run smoke            # o loop mínimo ponta-a-ponta
   ```

Precisa entender **por que** uma escolha foi feita antes de mudá-la?
**[`docs/DECISOES.md`](docs/DECISOES.md)** (os porquês) e
**[`docs/ESTADO.md`](docs/ESTADO.md)** (o que é dívida consciente vs. bug) são os
que evitam retrabalho e regressão de intenção. Para o "o que é" em linguagem de
produto, **[`docs/PRODUTO.md`](docs/PRODUTO.md)**.

---

## Índice da documentação

| Doc | O que responde |
|---|---|
| [`docs/PRODUTO.md`](docs/PRODUTO.md) | O que é, para quem, o conceito, o **glossário** do vocabulário, o fluxo das telas |
| [`docs/PRINCIPIOS.md`](docs/PRINCIPIOS.md) | **Os inegociáveis** — cada um com *o princípio · por que existe · o que quebra se você mexer* |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Repos, stack, VPS, a porta da base de conhecimento, o gateway de LLM, o **caminho de um sinal** |
| [`docs/DADOS.md`](docs/DADOS.md) | O modelo de dados, `org_docs`, `clients.data` e as **tabelas fantasma** |
| [`docs/SEGURANCA.md`](docs/SEGURANCA.md) | Multi-tenant, RLS, o checklist de isolamento, a porta da base, o "não faça isso" |
| [`docs/DECISOES.md`](docs/DECISOES.md) | **Os porquês** — uma decisão por entrada (contexto · decisão · motivo · consequência de desfazer) |
| [`docs/OPERACAO.md`](docs/OPERACAO.md) | Runbook: rodar, deployar, os smokes, o cron, "o que fazer quando…" |
| [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md) | Os **12 parâmetros** da implantação — o que cada um faz e onde vive |
| [`docs/ESTADO.md`](docs/ESTADO.md) | O que está pronto, o que é placeholder, a **dívida consciente** |

Referências de intenção que já existiam (não apague): [`CLAUDE.md`](CLAUDE.md) ·
[`docs/vision.md`](docs/vision.md) · [`docs/MULTITENANT.md`](docs/MULTITENANT.md) ·
[`door/README.md`](door/README.md).

---

## Rodar local

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # next build
npm run dev         # next dev
```

Sem as variáveis de ambiente do Supabase, o app roda em modo **clássico**
(armazenamento em arquivos JSON, single-tenant) — bom para desenvolvimento. Com
elas, entra o modo **multi-tenant** (Supabase + RLS). Os nomes das variáveis
estão em [`docs/OPERACAO.md`](docs/OPERACAO.md) (**nunca os valores**).

## ⚠️ Zona de perigo — não mexa sem entender o porquê

Estas peças protegem o produto. Antes de tocar em qualquer uma, leia
[`docs/PRINCIPIOS.md`](docs/PRINCIPIOS.md) e [`docs/DECISOES.md`](docs/DECISOES.md):

- **`src/lib/brain.ts` + `door/door.mjs`** — a porta estreita para a base do Formare. O Radar **nunca** tem a credencial do banco do Formare.
- **As políticas RLS + o caminho de escrita do coletor** (`src/lib/db/`) — o isolamento entre agências vive aqui.
- **A instrução anti-injeção nos prompts dos analistas** — conteúdo coletado é **dado**, nunca instrução.
- **O gate `isSuperAdmin`** (`src/lib/db/session.ts`) — quem pode editar o critério da agência.

> **Regra de manutenção:** este repositório integra com um sistema **em produção**.
> A documentação muda **junto com o código** — um doc que mente é pior que doc nenhum.
