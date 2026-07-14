# Vocabulário executivo — mapa de rename (Radar)

Fonte de verdade do rename de vocabulário. O campeão (dono da agência) precisa "sacar"
em minutos: usar as palavras que o executivo já pensa. **Muda o rótulo visível e a
orientação — nunca a transparência** (fonte, data, fato/inferência continuam).

## Regra de ouro

Renomeie **só texto visível ao usuário**: JSX, títulos, botões, placeholders, tooltips,
aria-labels, estados-vazios, copy de PDF e de e-mail. **NUNCA** toque em identificadores:
nomes de variável/função/tipo, chaves de objeto, rotas/hrefs (`/vigiar`, `/analistas`),
imports, comentários. Ex.: a rota `/vigiar` fica; o texto "Vigiar" vira "Monitorar".

Consistência total: o mesmo termo em todo lugar (app, tooltip, PDF, digest). Nada de
"lente" num canto e "área" no outro. Na dúvida entre a palavra fofa/técnica e a
corporativa, escolha a **corporativa**.

## Mapa (interno → executivo)

| Interno (efeito "IA/técnico") | Executivo (linguagem de gestor) |
|---|---|
| Lente · Lentes · Ótica | **Área · Áreas** (valores Comercial · Marketing · Produto · Mercado ficam) |
| Gatilho · Gatilhos | **Oportunidade · Oportunidades** |
| Impacto (82) | **Prioridade** — número 0–100 **+ selo Alta · Média · Baixa** |
| Correlação · Cruzamento · "Interno × Externo" | **Recomendação · Recomendações** |
| Brain | **Base de conhecimento** (curto: "Base"; ou "Contexto do cliente") |
| Flywheel | **remover** do app (é conceito de estratégia, não rótulo) |
| Fresco · "sinais frescos" | **Recente · Sinais recentes** + a data |
| Vigiar · Vigiado(s) (texto) | **Monitorar · Monitorado(s)** |
| Farejador · Descoberta | **Descoberta de fontes** |
| Fit · "fit por linha" | **Aderência por linha** |
| "Diagnóstico vivo" | **Diagnóstico** · "atualizado em [data]" |
| Encaixe · "score de encaixe" | **Aderência** (qualitativo) · **Potencial** (o score) |
| Munição · "Munição de reunião" | **Preparação pra reunião** |

**Manter** (já são termos comerciais bons): Carteira · Conta-chave · Dossiê · Feed ·
Relatórios · Hoje · Pergunte ao Radar.

## Selo de Prioridade (Impacto → Prioridade)

Escala 0–100. Além do número, mostrar o rótulo:
- **Alta** ≥ 70
- **Média** 40–69
- **Baixa** < 40

## Guardrail

Honestidade preservada: fonte, data, fato/inferência continuam visíveis. Não infantilizar
(ferramenta séria); orientação enxuta, não tutorial longo. Não quebrar funcionalidade nem
o desktop.
