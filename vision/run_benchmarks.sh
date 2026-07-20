#!/usr/bin/env bash
# run_benchmarks.sh
#
# Usage:
#   ./run_benchmarks.sh                          # full benchmark, all 6 models
#   ./run_benchmarks.sh qwen35-4b gemma4-e4b     # full benchmark, specific models
#   ./run_benchmarks.sh --light                  # light benchmark, all 6 models
#
# --light runs ~½ the wall-clock time:
#   3 images (instead of 6), English only (instead of 6 langs), 1 run (instead of 2).
set -euo pipefail

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'EOF'
Usage: ./vision/run_benchmarks.sh [--light] [MODEL ...]

Default: verbose full benchmark of all six models, with a live progress bar and
every generated title, hint, commentary, and request duration printed.

Models: ministral qwen35-0.8b qwen35-2b qwen35-4b gemma4-e2b gemma4-e4b
Use --light for a 3-image, English-only, one-pass smoke test.
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BENCH_CPUS=${BENCH_CPUS:-3}
BENCH_THREADS=${BENCH_THREADS:-3}
BENCH_MEMORY=${BENCH_MEMORY:-5g}

cleanup() { docker rm -f vision_bench >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

# ─── Parse --light flag and model list ───────────────────────────────────────
LIGHT_FLAG=""
MODELS_ARG=()
for arg in "$@"; do
  if [[ "${arg}" == "--light" ]]; then
    LIGHT_FLAG="--light"
  else
    MODELS_ARG+=("${arg}")
  fi
done

if [[ "${#MODELS_ARG[@]}" -gt 0 ]]; then
  MODELS=("${MODELS_ARG[@]}")
else
  MODELS=(ministral qwen35-0.8b qwen35-2b qwen35-4b gemma4-e2b gemma4-e4b)
fi

SUFFIX="${LIGHT_FLAG:+-light}"
OUT_DIR="${ROOT_DIR}/vision/benchmarks/${STAMP}${SUFFIX}"
mkdir -p "${OUT_DIR}"

if [[ -n "${LIGHT_FLAG}" ]]; then
  echo "Mode: LIGHT  (3 images · English only · 1 run)"
else
  echo "Mode: FULL   (6 images · 6 languages · 2 runs)"
fi
echo "Models: ${MODELS[*]}"
echo "Output: ${OUT_DIR}"
echo "Output mode: verbose (live progress bar + every response)"
echo "Resource ceiling: ${BENCH_CPUS} CPUs, ${BENCH_THREADS} inference threads, ${BENCH_MEMORY} RAM"
echo ""

if curl -fsS http://127.0.0.1:8001/health >/dev/null 2>&1; then
  echo "Port 8001 is already serving a vision process. Stop it before benchmarking." >&2
  exit 2
fi

for image in atomium.jpg copenhagen.jpg eifell_tower.jpg italian_bollard.jpg vilnius.jpg yerevan.jpg; do
  [[ -f "${ROOT_DIR}/vision/test_images/${image}" ]] || {
    echo "Missing vision/test_images/${image}; add the six benchmark fixtures before running." >&2
    exit 2
  }
done

echo "=== Build one multi-model llama-server image ==="
cd "${ROOT_DIR}"
docker compose build vision

# ─── Per-model loop ───────────────────────────────────────────────────────────
for model in "${MODELS[@]}"; do
  # Sanitise model name for use as a filename (replace : with -)
  safe_model="${model//:/-}"

  echo "=== ${model}: start container ==="
  docker rm -f vision_bench >/dev/null 2>&1 || true
  docker run -d \
    --name vision_bench \
    --cpus "${BENCH_CPUS}" \
    --cpu-shares 256 \
    --memory "${BENCH_MEMORY}" \
    --memory-swap "${BENCH_MEMORY}" \
    -p 127.0.0.1:8001:8001 \
    -e MODEL="${model}" \
    -e THREADS="${BENCH_THREADS}" \
    -e THREADS_BATCH="${BENCH_THREADS}" \
    -v "${ROOT_DIR}/vision/models:/app/models" \
    spottheshot-vision >/dev/null

  echo "=== ${model}: wait for health ==="
  ready=0
  for _ in $(seq 1 90); do
    if curl -fsS "http://localhost:8001/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "${ready}" != "1" ]]; then
    echo "Vision container did not become healthy for model=${model}" >&2
    docker logs vision_bench --tail 200 || true
    docker rm -f vision_bench >/dev/null 2>&1 || true
    exit 1
  fi

  echo "=== ${model}: benchmark ==="
  cd "${ROOT_DIR}"
  VISION_URL="http://localhost:8001" \
    node vision/benchmark_vision.mjs "${model}" \
         "${OUT_DIR}/${safe_model}.json" \
         ${LIGHT_FLAG}

  docker logs vision_bench --tail 60 > "${OUT_DIR}/${safe_model}.container.log" 2>&1 || true
  docker rm -f vision_bench >/dev/null 2>&1 || true
done

echo ""
echo "Benchmarks saved in ${OUT_DIR}"
