# Estado — pronto, placeholder e dívida consciente

> Um dev novo precisa distinguir **dívida escolhida** de **bug**. "Consertar" uma
> dívida deliberada por ignorância é o dano nº 1 que esta documentação existe para
> impedir. O que está marcado como **dívida consciente** aqui **não é bug** — é
> escopo decidido pelo Rafael.
>
> Data desta foto: **julho de 2026.**

---

## ✅ Pronto e no ar

- **O loop de inteligência** — coleta (Firecrawl) → análise pelas 3 áreas
  (comercial/produto/marketing, ancorada na base) → briefing/feed → digest matinal
  por e-mail. Motor: `src/lib/loop.ts`.
- **Multi-tenant vivo** — Supabase Auth + orgs + RLS FORCE; isolamento **provado**
  (`test:isolation` 11/11, inclui o cliente homônimo).
- **A porta da base** (`radar-door`) — **leitura ao vivo** (só conhecimento
  confirmado); **escrita construída mas DESLIGADA** (por decisão do Rafael).
- **Diagnóstico de concorrentes** — posicionamento + canais + preço + reputação +
  cobertura de conteúdo, com selos honestos ("não encontrado").
- **Prospects** — dossiê on-demand + **PDF fiel** (HTML→Chrome) + ritual pré-reunião
  + contexto privado (isolado por org).
- **O ritual "Hoje"** — digest determinístico + Atuado/Ignorado/Adiado.
- **Implantação** — os 12 parâmetros (registro org-level, super_admin edita) + o
  **import da Ficha** (contrato v1: parse/diff/apply, org-scoped).
- **Vocabulário por agência** — rótulos renomeáveis resolvidos em toda a UI.
- **Automações** — nada varre sozinho até ligar (default OFF, por org).
- **Backups** — diários (lógico + `pg_dump`), retenção 14d.

---

## 🚧 Placeholder / construído-mas-não-ligado

- **Escrita da porta** (`POST /intake`, `POST /task`) — implementada e testada, mas
  **`DOOR_WRITE_ENABLED` desligado**. Religar = só com OK explícito do Rafael.
- **Tabelas `competitors` e `usage_events`** — existem no schema, **não são usadas**
  em runtime (ver a armadilha em [`DADOS.md`](DADOS.md)). Não são bug; são schema que
  a evolução para jsonb/JSONL deixou para trás.
- **LinkedIn / decisores** — a fonte mais frágil (ToS + anti-scraping). Presente mas
  gated; **o produto não depende dela** (decisão de faseamento — vision F5).

---

## 🧭 Dívida consciente (escolhida — NÃO é bug)

1. **Vocabulário: as 3 limitações de flexão** (gênero, singular de rename custom,
   plural de "oportunidade"). Deliberado — store de rótulo único. **Leia
   [`DECISOES.md` (D13)](DECISOES.md) antes de "consertar".** Se você vir "4 rivais
   monitorados" com um rename de gênero oposto e achar que é bug: **não é.**
2. **Rate-limit in-memory single-process** — freio de abuso, não cota distribuída.
   Ao escalar para N instâncias, precisa de backend compartilhado.
3. **Cache do loop não re-roda sozinho** ao falhar — telas do dia podem ficar vazias
   se a rodada da madrugada falhar. Mitigação manual documentada em [`OPERACAO.md`](OPERACAO.md).
   *(Melhoria de fundo pendente: não servir cache catastrófico / mostrar `failures`.)*
4. **Custo em arquivo JSONL**, não na tabela `usage_events`. Funciona; só não é
   consultável por SQL.
5. **Fallback de LLM fica no gateway** (VPS), fora deste repo — não verificável aqui.
6. **`docs/MULTITENANT.md` e `CLAUDE.md` estão parcialmente datados** (falam de fases
   F1-F4 e "banco a criar"; o multi-tenant já está vivo). O **modelo/guardrails**
   seguem válidos; a **fase** mudou. Este `docs/` novo é a foto atual.

---

## ⚠️ Flags do Rafael — não verificados nesta passada (confirme antes de agir)

- **"Controle morto no /diagnostico"** — o Rafael sinalizou um controle de UI que
  não faz nada na tela de diagnóstico. **Não localizei/confirmei** qual é nesta
  passada de documentação; um dev deve mapear antes de mexer.
- **Mobile** — sinalizado como a **próxima fase** (o app foi endurecido para
  desktop; mobile decente ainda é trabalho aberto).
- **Fase 1.5 / temas de mercado (P9)** — a régua de prioridade e o re-scope org-level
  **já foram** entregues; o que resta de "P9" é **temas de mercado editáveis por
  conta** de forma mais rica (hoje há fontes por concorrente + temas no Diagnóstico).

---

## Como manter este doc honesto

Quando você mudar o código, **mude o doc junto**. Em especial:
- Se uma tabela fantasma passar a ser usada (ou vice-versa) → atualize [`DADOS.md`](DADOS.md).
- Se ligar a escrita da porta → atualize aqui e [`SEGURANCA.md`](SEGURANCA.md).
- Se editar uma unit systemd na VPS → atualize a cópia em [`ops/systemd/`](../ops/systemd/).
- Se resolver uma dívida consciente → tire-a daqui (e conte o porquê em [`DECISOES.md`](DECISOES.md)).
