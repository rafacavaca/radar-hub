# Meta Ad Library API — setup (uma vez)

A Lente 3 do diagnóstico (mídia paga) usa a **API oficial** do arquivo público de
anúncios da Meta. Sem token ela funciona, mas quase sempre devolve "não
localizado" (as bibliotecas bloqueiam scrape). Com token, devolve **contagem
real, textos de criativo e desde quando a campanha roda** — tudo citável.

## Parte do Rafael (coisas presas à conta do Facebook — ~15 min + espera)

1. **Onboarding da Ad Library API** (exigência da Meta — é ESTE o portão real,
   confirmado pelo erro 2332002 da própria API): abrir **facebook.com/ads/library/api**
   logado no MESMO Facebook que gera os tokens → seguir as etapas ("Começar" →
   confirmar identidade com documento com foto → aceitar os termos). A análise
   do documento leva **1–2 dias**. É uma vez só. (A confirmação de identidade
   também aparece em facebook.com/ID.)

2. **Criar conta de developer**: abrir **developers.facebook.com** → "Começar" →
   entrar com o teu Facebook normal → aceitar os termos.

3. **Criar um app**: Meus Apps → **Criar App** → caso de uso "Outro" (ou
   "Nenhum") → tipo **Business** → nome: `Radar Formare`.

4. **Pegar as 3 credenciais**:
   - **App ID** e **App Secret**: no app → Configurações → **Básico**
     (clicar "Mostrar" no secret).
   - **Token curto**: abrir **developers.facebook.com/tools/explorer** →
     selecionar o app `Radar Formare` no menu → botão **Generate Access Token**
     (não precisa marcar permissão extra) → copiar o token.

5. **Mandar pro Claude** (no chat): App ID + App Secret + token curto.
   ⚠️ O token curto vale ~2 horas — mandar logo depois de gerar.

## Parte do Claude (na VPS)

```bash
cd /root/radar-hub
npm run meta:token -- <APP_ID> <APP_SECRET> <TOKEN_CURTO>   # imprime o token longo (~60 dias)
# colar o token em .env.local →  META_AD_LIBRARY_TOKEN=...
systemctl restart radar-hub
npm run smoke:metaads   # verifica: API viva + veredito de cobertura BR + Lente 3 real
```

## Manutenção

- O token longo **expira em ~60 dias**. Quando expirar, a ficha mostra
  "API oficial indisponível: token inválido ou expirado" (nunca dado falso) e o
  `smoke:metaads` fica VERMELHO. Renovar = repetir o passo 4 (token curto) +
  parte do Claude. O App ID/Secret não mudam.
- O secret e o token vivem SÓ em `.env.local` (nunca commitados, nunca no zip
  da extensão, nunca em URL pública).

## Escopo honesto do arquivo (importante)

O arquivo público da Meta cobre com garantia: **anúncios entregues na UE**
(todos os tipos, exigência DSA) + **anúncios políticos/eleitorais** no resto do
mundo. Cobertura de anúncio **comercial no Brasil**: o `smoke:metaads` testa
empiricamente com um anunciante-controle (iFood, BR-only) e imprime o veredito.
Por isso, "0 anúncios no arquivo" sai na ficha com nota de escopo — ausência no
arquivo **não** é prova absoluta de que o concorrente não anuncia.
