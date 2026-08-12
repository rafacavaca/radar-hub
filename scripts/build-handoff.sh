#!/usr/bin/env bash
# Gera docs/HANDOFF.md — TODA a documentação de transferência do Radar num arquivo
# só (na ordem de leitura do README), fácil de abrir, buscar (Ctrl+F) e enviar.
# Fonte da verdade = os arquivos individuais em docs/; este bundle é DERIVADO.
# Regenerar: bash scripts/build-handoff.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=docs/HANDOFF.md
FILES=(
  README.md
  docs/vision.md
  docs/PRODUTO.md
  docs/PRINCIPIOS.md
  docs/ARQUITETURA.md
  docs/DADOS.md
  docs/MULTITENANT.md
  docs/SEGURANCA.md
  docs/OPERACAO.md
  docs/IMPLANTACAO.md
  docs/DECISOES.md
  docs/ESTADO.md
  docs/narrow-door/README.md
  ops/systemd/README.md
  docs/backup-git.md
  docs/DNS-resend-formare-tech.md
  docs/meta-ad-library-setup.md
)

{
  echo "# Radar Hub — Handoff (bundle único)"
  echo
  echo "> **Toda a documentação de transferência do Radar num arquivo só**, na ordem de leitura do README — fácil de abrir, buscar (Ctrl+F) e enviar."
  echo "> Gerado em $(date +%Y-%m-%d) por \`scripts/build-handoff.sh\`. **Fonte da verdade = os arquivos individuais em \`docs/\`**; este bundle é derivado e pode envelhecer — regenere com \`bash scripts/build-handoff.sh\`."
  echo
  echo "## Conteúdo"
  echo
  i=0
  for f in "${FILES[@]}"; do i=$((i + 1)); echo "$i. \`$f\`"; done
  echo
  i=0
  for f in "${FILES[@]}"; do
    i=$((i + 1))
    echo
    echo "---"
    echo
    echo "> **[$i/${#FILES[@]}] Fonte: \`$f\`**"
    echo
    cat "$f"
    echo
  done
} > "$OUT"

echo "OK: $OUT — $(wc -l < "$OUT") linhas, $(du -h "$OUT" | cut -f1)"
