#!/bin/bash
# Раз в неделю копирует журнал турнира в приватный репозиторий.
# Токен GitHub — одна строка в /etc/turnir-backup/token, права 600.
set -euo pipefail

VOLUME=turnir-data
CONTAINER=poker
REPO_URL=https://github.com/Alexsmet98/odesskiy-poker-turnir.git
REPO_DIR=/var/lib/turnir-backup
TOKEN_FILE=/etc/turnir-backup/token
BRANCH=main

if [[ ! -r "$TOKEN_FILE" ]]; then
  echo "Нет файла $TOKEN_FILE с токеном GitHub" >&2
  exit 1
fi
token=$(tr -d '[:space:]' < "$TOKEN_FILE")
if [[ -z "$token" ]]; then
  echo "Файл токена пуст" >&2
  exit 1
fi

auth=$(printf 'x-access-token:%s' "$token" | base64 -w0)
git_auth() {
  git -c "http.extraheader=AUTHORIZATION: basic ${auth}" "$@"
}

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  mounts=$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{.Destination}} {{end}}')
  case " $mounts " in
    *" /data "*) ;;
    *)
      echo "Контейнер $CONTAINER без тома /data: при пересоздании контейнера журнал на диске пропадёт. Запускайте его с -v ${VOLUME}:/data" >&2
      ;;
  esac
  docker cp "$CONTAINER:/data/turnir.json" "$workdir/turnir.json"
elif docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  docker run --rm -v "${VOLUME}:/data:ro" -v "$workdir:/backup" alpine:3 \
    cp /data/turnir.json /backup/turnir.json
else
  echo "Нет контейнера $CONTAINER и тома $VOLUME" >&2
  exit 1
fi

if [[ ! -s "$workdir/turnir.json" ]]; then
  echo "Файл журнала пуст" >&2
  exit 1
fi
python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$workdir/turnir.json"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  rm -rf "$REPO_DIR"
  git_auth clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

cp "$workdir/turnir.json" "$REPO_DIR/turnir.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$REPO_DIR/backed-up-at.txt"
git -C "$REPO_DIR" add turnir.json backed-up-at.txt
git -C "$REPO_DIR" -c user.name="Журнал турнира" -c user.email="backup@odesskiypoker.com" \
  commit -m "Журнал $(date -u +%Y-%m-%d)"
git_auth -C "$REPO_DIR" push origin "$BRANCH"
echo "Копия журнала отправлена $(date -u +%Y-%m-%dT%H:%M:%SZ)"
