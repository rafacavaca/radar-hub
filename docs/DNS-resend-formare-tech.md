# Verificação do domínio formare.tech no Resend (digest por e-mail)

Para as **agências** receberem o digest no e-mail delas (e não só o Rafael),
o domínio remetente precisa ser verificado. Domínio criado no Resend em
09/jul/2026 (id `3d6f6f23-8d1a-49ac-a6f3-6f95005c080c`, região us-east-1).

## SUA VEZ — colar estes 3 registros no DNS de `formare.tech` (Cloudflare)

> No Cloudflare, **DNS → Records → Add record**. Para os TXT/MX, use o `name`
> exatamente como está (o Cloudflare completa o `.formare.tech`). Deixe o
> proxy **DNS only** (nuvem cinza) — são registros de e-mail, não de site.

| Tipo | Nome (host) | Valor | Prioridade |
|------|-------------|-------|------------|
| **TXT** (DKIM) | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDJ4lT0xi9brkhcV36ImGsHj1ShtEmQbFxN+MyFp332lfb0vXku8U4IEq7CbBcMj/9pqbw77prT53QyvA1IkPab+LrgNO6aDZoGmznkbBmVloBaa6Eu4ZxOCx0YalphUHBcqxPW8aqhRKlj4L+cFfftwAxvYGJs0jhekqqBSfZc7wIDAQAB` | — |
| **MX** (SPF) | `send` | `feedback-smtp.us-east-1.amazonses.com` | `10` |
| **TXT** (SPF) | `send` | `v=spf1 include:amazonses.com ~all` | — |

Depois de colar, me avisa — eu confirmo a verificação no Resend (ou você clica
**Verify** no painel do Resend) e troco o remetente para
`RADAR_DIGEST_EMAIL_FROM="Radar <radar@formare.tech>"`.

## Enquanto o DNS não verifica (estado atual)

- O **Rafael já recebe** (o Resend em test-mode entrega pro dono da conta —
  cavaca@gmail.com). 2 e-mails de teste já chegaram.
- Agências com e-mail próprio configurado no `/admin` ficam prontas mas **só
  passam a receber depois da verificação** (o Resend recusa destinatário de
  terceiro em test-mode — 403, honesto, registrado no log do cron).
- Nada quebra: o cron marca `sem-destinatario`/`erro 403` e segue.
