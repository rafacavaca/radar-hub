# radar-door — a porta estreita (Radar ↔ Brain do Formare)

Serviço isolado no VPS. **Fonte da verdade do código: esta pasta** (`door/door.mjs`).
Cópia implantada roda em `/root/radar-door/` (que também guarda o `.env` com a
credencial do banco — o `.env` NUNCA entra neste repo).

## O que a porta faz

| Endpoint | O quê | Estado |
|---|---|---|
| `GET /health` | vivo? + escrita on/off | aberto (sem segredo) |
| `GET /brain?workspace=Nome&limit=60` | **LEITURA**: só conhecimento `is_confirmed=true` e `authority IN (canonical, reference)` do workspace, conteúdo truncado (1500 chars/nó, máx 200 nós) | exige `Authorization: Bearer <segredo>` |
| `POST /intake` | **ESCRITA**: insere bilhetes SEMPRE como pendente+rascunho (`is_confirmed=false`, `authority='draft'`, `origin=radar` — literais no SQL) | exige segredo **E** `DOOR_WRITE_ENABLED=true` (hoje: **DESLIGADA**, pedido do Rafael 02/jul) |

Garantias: o Radar nunca tem a credencial do banco; rascunhos/pendentes nunca
saem pela leitura; a escrita nunca toca nó existente (INSERT-only); escuta só
em `127.0.0.1`.

## Implantar (depois de editar door/door.mjs no repo)

```bash
cp /root/radar-hub/door/door.mjs /root/radar-door/door.mjs
systemctl restart radar-door   # se o serviço systemd estiver instalado
```

## Serviço systemd (instalado em 02/jul/2026)

`/etc/systemd/system/radar-door.service` — roda com a escrita DESLIGADA
(sem `DOOR_WRITE_ENABLED` no `.env`). Religar a escrita = adicionar
`DOOR_WRITE_ENABLED=true` ao `/root/radar-door/.env` + `systemctl restart radar-door`
— **só com OK explícito do Rafael**.

```ini
[Unit]
Description=radar-door — porta estreita Radar<->Brain (leitura ON, escrita gated)
After=network.target

[Service]
ExecStart=/usr/bin/env node --env-file=/root/radar-door/.env /root/radar-door/door.mjs
WorkingDirectory=/root/radar-door
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## `.env` da porta (em /root/radar-door/.env, fora do repo)

```
SUPABASE_DB_URL=postgresql://…      # credencial do banco do Formare (só aqui!)
RADAR_INTAKE_SECRET=…               # segredo compartilhado com o Radar
RADAR_DOOR_PORT=8090
# DOOR_WRITE_ENABLED=true           # descomentar SÓ com OK do Rafael
```
