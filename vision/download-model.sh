#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${MODELS_DIR:-${SCRIPT_DIR}/models}"

# Load only HF_TOKEN (not arbitrary shell syntax) from the repository .env.
# An exported token always wins. The token is never echoed.
if [[ -z ${HF_TOKEN:-} && -f "$SCRIPT_DIR/../.env" ]]; then
  while IFS= read -r line; do
    if [[ $line =~ ^[[:space:]]*HF_TOKEN[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      HF_TOKEN=${BASH_REMATCH[1]}
      HF_TOKEN=${HF_TOKEN%$'\r'}
      HF_TOKEN=${HF_TOKEN#\"}; HF_TOKEN=${HF_TOKEN%\"}
      HF_TOKEN=${HF_TOKEN#\'}; HF_TOKEN=${HF_TOKEN%\'}
      export HF_TOKEN
      break
    fi
  done < "$SCRIPT_DIR/../.env"
fi

pip install -q huggingface_hub hf_transfer
export HF_HUB_ENABLE_HF_TRANSFER=1

MODEL_DIR="$MODELS_DIR/ministral"
mkdir -p "$MODEL_DIR"

echo "Downloading Ministral-3-3B-Instruct IQ4_NL + mmproj-F16..."
hf download unsloth/Ministral-3-3B-Instruct-2512-GGUF \
  --local-dir "$MODEL_DIR" \
  --include "Ministral-3-3B-Instruct-2512-IQ4_NL.gguf" \
  --include "mmproj-F16.gguf"

echo "Done. Files in $MODEL_DIR:"
ls -lh "$MODEL_DIR"
