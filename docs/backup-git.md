# Backup do Radar Hub no GitHub (SUA VEZ, Rafael)

Hoje o código do radar-hub vive **só na VPS**. Isto liga um backup remoto no teu
GitHub. O remoto já está pré-configurado por SSH — falta só a tua parte (criar o
repo + autorizar a chave de deploy). Nada de token pra colar/expirar.

## Passo 1 — Autorizar a chave de deploy da VPS (uma vez)

A VPS tem uma chave SSH pública (`formare-vps-deploy`). Cola ela no GitHub:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP3dWt62n9sT8skMrPMInpFZ09qltcT5MMWB/56cZDSq formare-vps-deploy
```

Duas opções (qualquer uma serve):
- **Deploy key do repo** (mais restrito, recomendado): ao criar o repo (passo 2),
  Settings → Deploy keys → Add deploy key → cola a chave → **marca "Allow write
  access"**.
- **Chave da conta** (serve pra vários repos): github.com/settings/keys → New SSH
  key → cola a chave.

## Passo 2 — Criar o repo PRIVADO

github.com/new → nome **radar-hub** → **Private** → NÃO adicionar README/.gitignore
(o repo local já tem tudo). Criar.

> O remoto local já aponta pra `git@github.com:rafacavaca/radar-hub.git`. Se
> escolher outro nome/conta, me avisa que eu ajusto o `git remote set-url`.

## Passo 3 — Autorizar o push (me diz "pode subir" OU roda você)

Com a chave autorizada e o repo criado, o push do backup é:

```bash
cd /root/radar-hub
ssh -T git@github.com          # deve dizer "Hi rafacavaca!" (confirma a chave)
git push -u origin onda-2      # sobe a branch de trabalho (Onda 2)
git push origin main           # opcional: sobe a main também
```

Nunca uso `--force`. A branch `onda-2` tem todo o trabalho recente; a `main` está
no último ponto estável antes deste lote.

## Verificação

`git remote -v` deve mostrar `origin` em `git@github.com:rafacavaca/radar-hub.git`.
Depois do push, o repo no GitHub deve listar os commits `feat(radar): base…` e os
da Onda 2.

## Segurança (já garantido)

`.gitignore` exclui `.env*` (menos `.env.example`), `/data/`, `/.cache/` e
`extension/linkedin/config.js` (que tem o segredo do ingest). Verifiquei: nenhum
segredo vivo nos commits. O backup leva só código.
