#!/bin/sh
# Envoltorio de checker.js para launchd (alojamiento B en un Mac). Hace lo que
# en systemd hacen EnvironmentFile y WorkingDirectory de checker.service, que
# launchd no tiene.
#
# Da UNA ronda y termina. La periodicidad la pone StartInterval del plist, no
# este script: checker.js sigue sin bucle (CLAUDE.md, SPEC.md 3.4).

set -e

# launchd no arranca un shell de login, asi que no hereda el PATH del usuario y
# no encontraria node. Homebrew instala en /opt/homebrew en Apple Silicon y en
# /usr/local en Intel.
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export PATH

# Credenciales FUERA del repo, que es publico (SPEC.md 7.3). Dos lineas:
# WORKER_URL=... y CHECKER_TOKEN=...
ENV_FILE="$HOME/.zara-restock.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Falta $ENV_FILE con WORKER_URL y CHECKER_TOKEN" >&2
  exit 1
fi
. "$ENV_FILE"
export WORKER_URL CHECKER_TOKEN

cd "$(dirname "$0")"
exec node checker.js
