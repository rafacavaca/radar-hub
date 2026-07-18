# Units systemd — como o Radar roda sozinho (na VPS)

> **O que é isto.** Cópias **versionadas** das units systemd que fazem o Radar
> funcionar na VPS. Sem elas, "como o Radar roda sozinho" existiria **só na
> máquina** — se a VPS morre, quem herda o repo tem o código mas não sabe **o que
> dispara o quê**. Estas cópias transformam "tenho o repo" em "consigo recriar a
> caixa".
>
> **Fonte da verdade em runtime:** `/etc/systemd/system/` na VPS. Estas cópias
> foram lidas de lá e conferidas. Se você editar uma unit na VPS, **atualize a
> cópia aqui** (senão a doc mente).
>
> ⚠️ **Segredos não entram aqui.** A `cloudflared-radar.service` real tem um
> **token do túnel** — nesta cópia ele está **redigido** (`<TUNNEL_TOKEN>`). Os
> serviços leem segredos de `--env-file=/root/radar-*/.env` (fora do repo). Ao
> recriar, ponha os valores reais na VPS, nunca aqui.

## O mapa — o que roda e o que dispara

| Unit | Tipo | O quê | Quando |
|---|---|---|---|
| `radar-hub.service` | serviço | o app Next.js (`next start -p 3200`) | sempre (a app) |
| `radar-door.service` | serviço | a **porta estreita** para a base do Formare (`door.mjs`, `127.0.0.1:8090`) | sempre |
| `cloudflared-radar.service` | serviço | o **Cloudflare Tunnel** (`radar.formare.tech` → `localhost:3200`) | sempre (o acesso público) |
| `radar-firewall.service` | oneshot | fecha portas Docker expostas (Redis 6379, code-server 8080) | no boot |
| `radar-schedules.service` + `.timer` | timer | gera relatórios agendados vencidos + digest matinal + preparo de reuniões (`scripts/run-schedules.mts`) | **de hora em hora** |
| `radar-backup.service` + `.timer` | timer | backup do banco (dump lógico JSON + `pg_dump` padrão-ouro, retenção 14d em `/root/radar-backups`) | **diário, 04:30 UTC** |

> A dependência: `radar-hub` depende de `radar-door` (`After=`); os timers rodam
> depois do `radar-hub`. O caminho de um sinal (coleta→análise→briefing→digest)
> é disparado pelo `radar-schedules.timer` chamando `run-schedules.mts` — o motor
> é `src/lib/loop.ts`. Ver [`docs/ARQUITETURA.md`](../../docs/ARQUITETURA.md).

## Recriar a caixa (numa VPS nova)

```bash
# 1. clonar o repo em /root/radar-hub, npm install, npm run build
# 2. criar /root/radar-door/ (cópia de door/door.mjs) e os .env (segredos)
# 3. instalar as units:
sudo cp ops/systemd/*.service ops/systemd/*.timer /etc/systemd/system/
#    (repor o token real na cloudflared-radar.service)
sudo systemctl daemon-reload
sudo systemctl enable --now radar-door radar-hub cloudflared-radar radar-firewall
sudo systemctl enable --now radar-schedules.timer radar-backup.timer
# 4. conferir:
systemctl status radar-hub radar-door
systemctl list-timers | grep radar
```

Os nomes das variáveis de ambiente (nunca os valores) estão em
[`docs/OPERACAO.md`](../../docs/OPERACAO.md).

## ⚠️ Cuidado com `next build` na VPS (lição registrada)

Nunca rode `next build` do radar-hub em **background** dentro da pasta servida: se
cortado, apaga o `BUILD_ID` e derruba o `radar-hub.service` em crash-loop. Rode em
**foreground**, confira `cat .next/BUILD_ID`, e só então `systemctl restart
radar-hub`. Ver [`docs/OPERACAO.md`](../../docs/OPERACAO.md).
