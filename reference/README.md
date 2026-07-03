# Referência — patch de VISÃO no motor (gateway do Formare)

`formare-gateway-server.mjs` é uma CÓPIA DE BACKUP do gateway do Formare
(`/root/formare-os/gateway/server.mjs`, serviço `formare-gateway.service` na VPS),
com o endpoint **`/complete-vision`** que o nó Visão do Radar (F11) usa.

O patch é ADITIVO e ISOLADO (aprovado pelo Rafael em 03/jul):
- endpoint novo `POST /complete-vision` (imagens base64 → análise multimodal Claude);
- fila própria (`VISION_MAX_CONCURRENCY=1`) e timeout próprio (120s);
- **NÃO** toca no `/complete` de texto nem no circuit breaker que o Formare usa.

Por que a cópia existe: o código do gateway só vive na VPS (sem git remote
próprio). Se precisar restaurar, este arquivo é a fonte. Reimplantar:
`cp reference/formare-gateway-server.mjs /root/formare-os/gateway/server.mjs && systemctl restart formare-gateway`
