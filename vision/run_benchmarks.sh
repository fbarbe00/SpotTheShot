#!/usr/bin/env bash
# run_benchmarks.sh
#
# Usage:
#   ./run_benchmarks.sh                          # full benchmark, all 7 models
#   ./run_benchmarks.sh qwen35-4b gemma4-e4b     # full benchmark, specific models
#   ./run_benchmarks.sh --light                  # light benchmark, all 6 models
#
# --light runs ~½ the wall-clock time:
#   3 images (instead of 6), English only (instead of 6 langs), 1 run (instead of 2).
set -euo pipefail

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'EOF'
Usage: ./vision/run_benchmarks.sh [--light] [--skip-build] [--download-images] [MODEL ...]

Default: verbose full benchmark of all seven models, with a live progress bar and
every generated title, hint, commentary, and request duration printed.

Models: ministral qwen35-0.8b qwen35-2b qwen35-4b gemma4-e2b gemma4-e4b minicpm-v4.6
Use --light for a 3-image, English-only, one-pass smoke test.
Use --skip-build after the image has already been built from this checkout.
Use --download-images to fetch and validate the standard six fixtures first.
EOF
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BENCH_CPUS=${BENCH_CPUS:-}
BENCH_THREADS=${BENCH_THREADS:-}
BENCH_MEMORY=${BENCH_MEMORY:-}
VISION_IMAGE=${BENCH_IMAGE:-}
CLIENT_IMAGE=${BENCH_CLIENT_IMAGE:-spottheshot-server:local}
BENCH_NETWORK=spottheshot_benchmark

cleanup() {
  docker rm -f vision_bench >/dev/null 2>&1 || true
  docker network rm "$BENCH_NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# ─── Parse --light flag and model list ───────────────────────────────────────
LIGHT_FLAG=""
SKIP_BUILD=false
DOWNLOAD_IMAGES=false
MODELS_ARG=()
for arg in "$@"; do
  case "$arg" in
    --light) LIGHT_FLAG=--light ;;
    --skip-build) SKIP_BUILD=true ;;
    --download-images) DOWNLOAD_IMAGES=true ;;
    --*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) MODELS_ARG+=("$arg") ;;
  esac
done

if [[ "${#MODELS_ARG[@]}" -gt 0 ]]; then
  MODELS=("${MODELS_ARG[@]}")
else
  MODELS=(ministral qwen35-0.8b qwen35-2b qwen35-4b gemma4-e2b gemma4-e4b minicpm-v4.6)
fi

if [[ -n ${BENCH_MODEL_FILE:-} && ${#MODELS[@]} -ne 1 ]]; then
  echo "BENCH_MODEL_FILE override requires exactly one model" >&2
  exit 2
fi
if [[ -n ${BENCH_LABEL:-} && ${#MODELS[@]} -ne 1 ]]; then
  echo "BENCH_LABEL override requires exactly one model" >&2
  exit 2
fi
BENCH_ENV_ARGS=()
[[ -n ${BENCH_MODEL_FILE:-} ]] && BENCH_ENV_ARGS+=(-e "MODEL_FILE=${BENCH_MODEL_FILE}")
[[ -n ${BENCH_MMPROJ_FILE:-} ]] && BENCH_ENV_ARGS+=(-e "MMPROJ_FILE=${BENCH_MMPROJ_FILE}")
[[ -n $BENCH_THREADS ]] && BENCH_ENV_ARGS+=(-e "THREADS=$BENCH_THREADS" -e "THREADS_BATCH=$BENCH_THREADS")
BENCH_RESOURCE_ARGS=()
[[ -n $BENCH_CPUS ]] && BENCH_RESOURCE_ARGS+=(--cpus "$BENCH_CPUS")
if [[ -n $BENCH_MEMORY ]]; then
  BENCH_RESOURCE_ARGS+=(--memory "$BENCH_MEMORY" --memory-swap "$BENCH_MEMORY")
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
if [[ ${#BENCH_RESOURCE_ARGS[@]} -eq 0 && -z $BENCH_THREADS ]]; then
  echo "Resources: Docker defaults; vision image uses its default inference threads"
else
  echo "Resources: CPUs=${BENCH_CPUS:-unlimited}, threads=${BENCH_THREADS:-image default}, RAM=${BENCH_MEMORY:-unlimited}"
fi
echo ""

if $DOWNLOAD_IMAGES; then
  "${ROOT_DIR}/vision/download-test-images.sh"
fi

if ! docker image inspect "$CLIENT_IMAGE" >/dev/null 2>&1; then
  echo "=== Build benchmark client image (one-time, cached thereafter) ==="
  cd "$ROOT_DIR"
  docker compose build server
fi
docker image inspect "$CLIENT_IMAGE" >/dev/null 2>&1 || {
  echo "Benchmark client image '$CLIENT_IMAGE' is unavailable" >&2; exit 1;
}

docker network inspect "$BENCH_NETWORK" >/dev/null 2>&1 || \
  docker network create "$BENCH_NETWORK" >/dev/null

for image in atomium.jpg copenhagen.jpg eifell_tower.jpg italian_bollard.jpg vilnius.jpg yerevan.jpg; do
  [[ -f "${ROOT_DIR}/vision/test_images/${image}" ]] || {
    echo "Missing vision/test_images/${image}; add the six benchmark fixtures before running." >&2
    exit 2
  }
done

{
  echo "timestamp=$(date --iso-8601=seconds)"
  echo "models=${MODELS[*]}"
  echo "bench_cpus=${BENCH_CPUS:-docker default}"
  echo "bench_threads=${BENCH_THREADS:-image default}"
  echo "bench_memory=${BENCH_MEMORY:-docker default}"
  echo "bench_model_file=${BENCH_MODEL_FILE:-profile default}"
  echo "bench_mmproj_file=${BENCH_MMPROJ_FILE:-profile default}"
  uname -a
  free -h
  lscpu | grep -E '^(Model name|CPU\(s\)|Thread|Core|Socket|Flags):' || true
  docker version --format 'docker_client={{.Client.Version}} docker_server={{.Server.Version}}'
} > "${OUT_DIR}/environment.txt"

if [[ -z $VISION_IMAGE ]]; then
  for candidate in spottheshot-vision:local spottheshot-vision:latest; do
    if docker image inspect "$candidate" >/dev/null 2>&1; then
      VISION_IMAGE=$candidate
      break
    fi
  done
fi
if [[ -z $VISION_IMAGE ]]; then
  VISION_IMAGE=$(docker image ls --format '{{.Repository}}:{{.Tag}}' | awk 'tolower($0) ~ /vision/ { print; exit }')
fi

if $SKIP_BUILD; then
  [[ -n $VISION_IMAGE ]] || {
    echo "--skip-build requested but no locally built vision image was found" >&2; exit 2;
  }
  docker image inspect "$VISION_IMAGE" >/dev/null 2>&1 || {
    echo "--skip-build requested but image '$VISION_IMAGE' does not exist" >&2
    echo "Run 'docker compose build vision', or set BENCH_IMAGE to an existing tag." >&2
    exit 2
  }
  echo "=== Reusing existing vision image $VISION_IMAGE ==="
else
  echo "=== Build one multi-model llama-server image ==="
  cd "${ROOT_DIR}"
  docker compose build vision
  VISION_IMAGE=spottheshot-vision:local
  docker image inspect "$VISION_IMAGE" >/dev/null 2>&1 || {
    echo "Could not resolve the built image '$VISION_IMAGE'" >&2; exit 1;
  }
fi

# ─── Per-model loop ───────────────────────────────────────────────────────────
for model in "${MODELS[@]}"; do
  result_label=${BENCH_LABEL:-$model}
  # Sanitise model name for use as a filename (replace : with -)
  safe_model="${result_label//[:\/ ]/-}"

  echo "=== ${model}: start container ==="
  docker rm -f vision_bench >/dev/null 2>&1 || true
  docker run -d \
    --name vision_bench \
    "${BENCH_RESOURCE_ARGS[@]}" \
    --network "$BENCH_NETWORK" \
    -e MODEL="${model}" \
    "${BENCH_ENV_ARGS[@]}" \
    -v "${ROOT_DIR}/vision/models:/app/models" \
    "$VISION_IMAGE" >/dev/null

  echo "=== ${model}: wait for health ==="
  ready=0
  for _ in $(seq 1 90); do
    if docker exec vision_bench curl -fsS "http://127.0.0.1:8001/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    printf '.'
    sleep 1
  done
  echo ""
  if [[ "${ready}" != "1" ]]; then
    echo "Vision container did not become healthy for model=${model}" >&2
    docker logs vision_bench --tail 200 || true
    docker rm -f vision_bench >/dev/null 2>&1 || true
    exit 1
  fi

  echo "=== ${model}: benchmark ==="
  cd "${ROOT_DIR}"
  docker run --rm --init \
    --network "$BENCH_NETWORK" \
    -e VISION_URL="http://vision_bench:8001" \
    -v "${ROOT_DIR}/vision/benchmark_vision.mjs:/app/vision/benchmark_vision.mjs:ro" \
    -v "${ROOT_DIR}/vision/test_images:/app/vision/test_images:ro" \
    -v "${ROOT_DIR}/server/visionClient.js:/app/server/visionClient.js:ro" \
    -v "${OUT_DIR}:/results" \
    "$CLIENT_IMAGE" \
    node /app/vision/benchmark_vision.mjs "${result_label}" \
      "/results/${safe_model}.json" ${LIGHT_FLAG}

  docker stats --no-stream vision_bench > "${OUT_DIR}/${safe_model}.resources.txt" 2>&1 || true
  docker logs vision_bench --tail 60 > "${OUT_DIR}/${safe_model}.container.log" 2>&1 || true
  docker rm -f vision_bench >/dev/null 2>&1 || true
done

echo ""
echo "Benchmarks saved in ${OUT_DIR}"
