# Radar Hub

Analista de inteligência de mercado operado por IA. Monitora **concorrentes, clientes, decisores e mercado**, cruza cada sinal com a **base de conhecimento (o Brain) do cliente**, e entrega **oportunidades, riscos e movimentos** já no formato de **decisão pronta pra agir**.

> **Tese (o flywheel):** **Radar sente → Brain lembra → Formare age.** O Radar percebe um movimento de concorrente, escreve no Brain do cliente, e o [OS Formare](https://os.formare.tech) transforma em post / argumento de vendas no mesmo dia. Um organismo, não dois produtos.

**Fonte da verdade conceitual:** `docs/vision.md` (destila os dois documentos do Rafael — o *blueprint de redesign* e o *kickoff de desenvolvimento*). Se algo aqui conflitar com aqueles documentos, **eles ganham**.

---

## ⛔ GUARDRAILS INVIOLÁVEIS

O Radar compartilha o **Brain** (banco Supabase) com o **OS Formare**, que está **EM PRODUÇÃO** (`os.formare.tech`). Por isso, sem exceção:

1. **O Radar é um projeto SEPARADO.** NUNCA modificar o app nem o banco do Formare (em `/root/formare-os`) — exceto pela "porta estreita" (item 3), e **só com OK explícito do Rafael**.
2. **NUNCA usar a `service_role` do Brain.** O Radar não tem — e não deve ter — a chave-mestra do banco do Formare.
3. **Escrita no Brain só pela PORTA ESTREITA.** Todo conhecimento que o Radar escreve entra como **pendente**: `is_confirmed=false` **E** `authority='draft'` (fica **invisível aos agentes do Formare** até o Rafael confirmar na aba *Revisar*), e marcado como vindo do radar (`metadata.origin='radar'` — o enum `knowledge_source` do Formare **não** tem valor `'radar'`). A porta estreita é um endpoint **dentro do Formare** que guarda a `service_role`; o Radar só tem uma **URL + um segredo compartilhado**.
4. **Eventos crus (sinais coletados) só no banco PRÓPRIO do Radar.** Nunca no banco do Formare.
5. **Coletores e cron rodam na VPS** (ao lado do gateway Claude), não em funções serverless.
6. **Se travar num bloqueio externo** (uma fonte que não abre, um serviço fora do ar): **PARE e reporte** — não gaste ciclos batendo cabeça.

---

## ✅ Build & verificação — rode SEMPRE antes de dizer "pronto"

```bash
npm run typecheck   # tsc --noEmit
npm run build       # next build
npm run smoke       # tsx scripts/test-radar-f1.mts  (o loop F1 ponta-a-ponta)
npm run smoke:f2    # tsx scripts/test-radar-f2.mts  (a watchlist — 0 créditos, 0 LLM)
```

Só considere uma tarefa concluída com **tudo verde**. O `smoke` é o **juiz do F1**: roda o loop contra 1 cliente real e confirma ≥1 item de briefing bem-formado. O `smoke:f2` é o juiz do **cadastro de quem vigiar**.

---

## 🎯 F1 — a fatia mínima (o que provamos primeiro)

1 cliente (**Moovefy**) + 1 concorrente (**RD Station**) + o Brain da Moovefy. O loop:

> coletar movimentos do RD Station → o **analista** cruza com o Brain da Moovefy → **pontua o impacto em VOCÊ** → gera **briefing diário + feed** → **"Pergunte ao Radar"** → botão que dispara uma **demanda no Formare**.

**Critérios de aceite (o `smoke` checa um a um):**
- [ ] Coleta ≥1 movimento **real** do RD Station (fonte sólida: blog/notícias/páginas de solução).
- [ ] O analista lê o Brain da Moovefy e produz ≥1 **item de inteligência** com: `sinal` · `por que importa` (ancorado no Brain, citando a fonte) · `ação recomendada` · `fonte` (link) · `score de impacto`.
- [ ] O item aparece no **briefing** e no **feed**.
- [ ] Há um **botão** que envia o item como demanda pro Formare.

**Fora do F1:** decisores/LinkedIn, os 4 pilares completos, multi-cliente, alertas multi-canal.

**Status: F1 COMPLETA e validada pelo Rafael (02/jul/2026).** O bilhete de teste atravessou a porta estreita (serviço isolado `/root/radar-door/`, DESLIGADA por ora) e caiu na aba Revisar do Formare como rascunho pendente.

---

## 🎯 F2 — Cadastro de quem vigiar (a watchlist)

O concorrente deixou de ser fixo no código: a lista vive em **`data/watchlist.json`** (banco próprio do Radar; gitignored — o seed Moovefy+RD Station vive em `src/lib/watchlist.ts`) e o **loop coleta o que estiver nela**.

- **Tela:** `/vigiar` — adicionar/pausar/reativar/remover concorrentes por cliente.
- **API:** `GET/POST /api/watchlist` (actions: `add` | `remove` | `toggle`).
- **Coletor genérico:** `src/lib/collectors/blog.ts` — varre a listagem pública de QUALQUER blog (heurística de post: slug hifenizado ≥8 chars, sem segmentos de seção, sem URLs "pai"). `collectors/rdstation.ts` é só um atalho pro genérico (mantém o smoke F1).
- **Cliente sem Brain carregado:** o analista recebe âncora honesta ("falta contexto, seja conservador") — nunca inventa.
- **Roadmap completo (o destino):** `docs/roadmap/radar-hub-visao-completa.md` (doc do Rafael, 02/jul). Próximas fases dali: ler o Brain real, analistas por lente, ação no Formare, Pergunte ao Radar, multi-cliente.

---

## 🧱 Stack

- **App:** Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind v4 — mesma base do Formare (coerência e reuso).
- **Analista (o raciocínio):** o mesmo motor do Formare — o **gateway Claude na VPS** (com fallback). Reuso, não reinvenção. A vetorização é **busca**, não juiz.
- **Banco do Radar (eventos crus + itens de inteligência):** projeto **Supabase próprio**, separado do Formare. *(a criar)*
- **Coletores + cron:** na **VPS**. Coleta via busca web / RSS / páginas (ex.: Firecrawl). Um gatilho **"rodar agora"** (CLI/endpoint) pra testar sem esperar o cron.

## 📁 Estrutura (evolui)
```
radar-hub/
├── CLAUDE.md                    # este ficheiro — regras e guardrails
├── docs/vision.md               # visão destilada (fonte da verdade conceitual)
├── scripts/test-radar-f1.mts    # smoke: o loop F1 ponta-a-ponta (o juiz)
├── supabase/migrations/         # schema do banco PRÓPRIO do Radar (a criar)
└── src/                         # Next.js (app, coletores, analista, entrega)
```

## 👤 Como operar (o Rafael é NÃO-técnico)
- **Explicar tudo em linguagem simples**, sem jargão.
- Trabalhar em **lotes pequenos e verificáveis** (build entre passos).
- **Pontos de aprovação:** (a) antes de codar algo grande **e** antes de ligar a porta estreita no Formare; (b) no fim de cada etapa, com a verificação verde.
- **Delegar montagem mecânica** a modelos baratos; reservar o modelo caro pra raciocínio, segurança e revisão.
