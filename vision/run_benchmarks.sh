#!/usr/bin/env bash
# run_benchmarks.sh
#
# Usage:
#   ./run_benchmarks.sh                          # full benchmark, all 4 models
#   ./run_benchmarks.sh gemma4 ministral         # full benchmark, specific models
#   ./run_benchmarks.sh --light                  # light benchmark, all 4 models
#   ./run_benchmarks.sh --light gemma4 ministral # light benchmark, specific models
#
# --light runs ~½ the wall-clock time:
#   3 images (instead of 6), English only (instead of 6 langs), 1 run (instead of 2).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

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
  MODELS=("qwen3.5" "qwen3.5:2b" "gemma4" "ministral")
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
echo ""

# ─── Per-model loop ───────────────────────────────────────────────────────────
for model in "${MODELS[@]}"; do
  # Sanitise model name for use as a filename (replace : with -)
  safe_model="${model//:/-}"

  echo "=== ${model}: build image ==="
  cd "${ROOT_DIR}"
  MODEL="${model}" docker compose build vision

  echo "=== ${model}: start container ==="
  docker rm -f vision_bench >/dev/null 2>&1 || true
  docker run -d \
    --name vision_bench \
    -p 8001:8001 \
    -e MODEL="${model}" \
    -e THREADS="${THREADS:-4}" \
    -e THREADS_BATCH="${THREADS_BATCH:-4}" \
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
