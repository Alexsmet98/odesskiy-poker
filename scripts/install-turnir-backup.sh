#!/bin/bash
# Ставит еженедельную копию журнала: понедельник, 04:15 по времени сервера.
set -euo pipefail

TOKEN_FILE=/etc/turnir-backup/token
SCRIPT=$(cd "$(dirname "$0")" && pwd)/backup-turnir.sh

if [[ ! -r "$TOKEN_FILE" ]]; then
  echo "Сначала положите токен GitHub одной строкой в $TOKEN_FILE" >&2
  exit 1
fi
chmod 600 "$TOKEN_FILE"
chmod 755 "$SCRIPT"

line="15 4 * * 1 $SCRIPT >> /var/log/turnir-backup.log 2>&1"
existing=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$existing" | grep -v 'backup-turnir.sh' || true
  printf '%s\n' "$line"
} | crontab -

"$SCRIPT"
echo "Готово. Копия уходит каждый понедельник в 04:15. Журнал: /var/log/turnir-backup.log"
