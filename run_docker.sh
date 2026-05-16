#!/usr/bin/env bash
set -e

# Pick the vision Dockerfile. Both shipped Dockerfiles target x86_64:
#   Dockerfile       — generic x86-64-v3 build (default; broad CPU support)
#   Dockerfile.x86   — znver2-only (more aggressive AMD Zen2 tuning)
# Override with DOCKERFILE=Dockerfile.x86 ./run_docker.sh up
export DOCKERFILE="${DOCKERFILE:-Dockerfile}"

# First arg picks the action; default is `up` (start in foreground).
CMD="${1:-up}"
# Shift only if the caller actually passed an argument, so `$@` after the
# case statement contains only the remaining flags (e.g. `-d`, `--build`).
if [ "$#" -gt 0 ]; then shift; fi

case "$CMD" in
  up)
    echo "→ Starting all services..."
    exec docker compose up "$@"
    ;;

  dev|development)
    echo "→ Starting in DEVELOPMENT mode with hot-reloading..."
    export NODE_ENV=development
    export VITE_DEV_MODE=true
    export DEV_WATCH=true
    exec docker compose up --watch "$@"
    ;;

  prod|production)
    echo "→ Starting in PRODUCTION mode..."
    export NODE_ENV=production
    exec docker compose up --build "$@"
    ;;

  down)
    echo "→ Stopping all services..."
    exec docker compose down "$@"
    ;;

  restart)
    echo "→ Restarting all services..."
    exec docker compose restart "$@"
    ;;

  logs)
    echo "→ Showing logs..."
    exec docker compose logs -f "$@"
    ;;

  # Anything else: hand straight through to docker compose so commands like
  # `./run_docker.sh ps`, `./run_docker.sh exec server sh` keep working.
  *)
    exec docker compose "$CMD" "$@"
    ;;
esac
