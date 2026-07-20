#!/bin/bash
set -e

# jemalloc reduces memory fragmentation on long-running CPU inference
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  export LD_PRELOAD=/usr/lib/aarch64-linux-gnu/libjemalloc.so.2
else
  export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
fi

THREADS=${THREADS:-5}
THREADS_BATCH=${THREADS_BATCH:-5}
MODELS_DIR="/app/models"

MODEL_FILE="${MODELS_DIR}/ministral/Ministral-3-3B-Instruct-2512-IQ4_NL.gguf"
MMPROJ_FILE="${MODELS_DIR}/ministral/mmproj-F16.gguf"
[ -f "$MODEL_FILE" ]  || { echo "ERROR: $MODEL_FILE not found";  exit 1; }
[ -f "$MMPROJ_FILE" ] || { echo "ERROR: $MMPROJ_FILE not found"; exit 1; }

echo "Starting Ministral with $THREADS inference threads"

exec /app/llama-server \
  --model  "$MODEL_FILE" \
  --mmproj "$MMPROJ_FILE" \
  --host 0.0.0.0 \
  --port 8001 \
  --jinja \
  -fa on \
  --ctx-size "${CTX_SIZE:-1024}" \
  -b 256 -ub 256 \
  -t "${THREADS}" -tb "${THREADS_BATCH}" \
  --temp 0.15 \
  --n-predict 100 \
  --presence-penalty 0.1 \
  --cache-type-k q4_0 \
  --cache-type-v q4_0 \
  --parallel 1 \
  --threads-http 2 \
  --metrics \
  --alias "unsloth/Ministral-3-3B-Instruct-2512-GGUF"
