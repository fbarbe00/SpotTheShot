#!/bin/bash
set -euo pipefail

if [[ $(uname -m) == aarch64 ]]; then
  export LD_PRELOAD=/usr/lib/aarch64-linux-gnu/libjemalloc.so.2
else
  export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
fi

THREADS=${THREADS:-5}
THREADS_BATCH=${THREADS_BATCH:-5}
CTX_SIZE=${CTX_SIZE:-1024}
MODEL=${MODEL:-ministral}
MODELS_DIR=/app/models
EXTRA_ARGS=()

case "$MODEL" in
  ministral)
    MODEL_REL="ministral/Ministral-3-3B-Instruct-2512-IQ4_NL.gguf"
    MMPROJ_REL="ministral/mmproj-F16.gguf"
    ;;
  qwen35-0.8b)
    MODEL_REL="qwen35-0.8b/Qwen3.5-0.8B-UD-Q4_K_XL.gguf"
    MMPROJ_REL="qwen35-0.8b/mmproj-F16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  qwen35-2b)
    MODEL_REL="qwen35-2b/Qwen3.5-2B-UD-Q4_K_XL.gguf"
    MMPROJ_REL="qwen35-2b/mmproj-F16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  qwen35-4b)
    MODEL_REL="qwen35-4b/Qwen3.5-4B-UD-Q4_K_XL.gguf"
    MMPROJ_REL="qwen35-4b/mmproj-F16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  gemma4-e2b)
    MODEL_REL="gemma4-e2b/gemma-4-E2B-it-UD-Q4_K_XL.gguf"
    MMPROJ_REL="gemma4-e2b/mmproj-F16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  gemma4-e4b)
    MODEL_REL="gemma4-e4b/gemma-4-E4B-it-UD-Q4_K_XL.gguf"
    MMPROJ_REL="gemma4-e4b/mmproj-F16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  minicpm-v4.6)
    MODEL_REL="minicpm-v4.6/MiniCPM-V-4_6-Q4_K_M.gguf"
    MMPROJ_REL="minicpm-v4.6/mmproj-model-f16.gguf"
    EXTRA_ARGS+=(--reasoning "${THINKING:-off}")
    [[ ${THINKING:-off} == off ]] && EXTRA_ARGS+=(--reasoning-budget 0)
    ;;
  *) echo "ERROR: unknown MODEL '$MODEL'" >&2; exit 2 ;;
esac

MODEL_FILE=${MODEL_FILE:-$MODELS_DIR/$MODEL_REL}
MMPROJ_FILE=${MMPROJ_FILE:-$MODELS_DIR/$MMPROJ_REL}
[[ -f $MODEL_FILE ]] || { echo "ERROR: $MODEL_FILE not found" >&2; exit 1; }
[[ -f $MMPROJ_FILE ]] || { echo "ERROR: $MMPROJ_FILE not found" >&2; exit 1; }

exec /app/llama-server \
  --model "$MODEL_FILE" --mmproj "$MMPROJ_FILE" \
  --host 0.0.0.0 --port 8001 --jinja -fa on --no-ui \
  --cors-origins localhost --no-cors-credentials \
  --ctx-size "$CTX_SIZE" -b 256 -ub 256 \
  -t "$THREADS" -tb "$THREADS_BATCH" \
  --temp 0.15 --top-p 0.9 --n-predict 100 --presence-penalty 0.1 \
  --cache-type-k q4_0 --cache-type-v q4_0 \
  --parallel 1 --threads-http 2 --metrics --alias "$MODEL" \
  "${EXTRA_ARGS[@]}"
