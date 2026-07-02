# Radar Hub

Analista de inteligência de mercado operado por IA — a **metade sensorial** de um organismo cujo braço executor é o **[OS Formare](https://os.formare.tech)**.

> **Radar sente → Brain lembra → Formare age.**

Projeto **separado** do Formare, mas que **compartilha o Brain** (a base de conhecimento) dele. O Radar percebe movimentos de mercado/concorrentes, cruza com o que a empresa sabe do cliente, e entrega **decisões prontas pra agir** — não apenas alertas. Escreve no Brain só por uma **"porta estreita"** segura (tudo entra como pendente, a confirmar).

- **Regras e guardrails:** [`CLAUDE.md`](./CLAUDE.md) — **leia antes de mexer.**
- **Visão e faseamento:** [`docs/vision.md`](./docs/vision.md)
- **Fase atual — F1:** Moovefy (cliente) + RD Station (concorrente): provar o loop mínimo ponta-a-ponta.

## Verificação

```bash
npm run typecheck && npm run build && npm run smoke
```

⚠️ Este projeto integra com um sistema **em produção**. Os guardrails no `CLAUDE.md` não são sugestões.
