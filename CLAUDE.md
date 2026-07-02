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
```

Só considere uma tarefa concluída com os **três verdes**. O `smoke` é o **juiz do F1**: roda o loop contra 1 cliente real e confirma ≥1 item de briefing bem-formado. Sem ele verde, o F1 não está pronto.

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
