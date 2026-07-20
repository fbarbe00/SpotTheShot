#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR=${MODELS_DIR:-$SCRIPT_DIR/models}

if [[ -z ${HF_TOKEN:-} && -f $SCRIPT_DIR/../.env ]]; then
  while IFS= read -r line; do
    if [[ $line =~ ^[[:space:]]*HF_TOKEN[[:space:]]*=[[:space:]]*(.*)$ ]]; then
      HF_TOKEN=${BASH_REMATCH[1]%$'\r'}
      HF_TOKEN=${HF_TOKEN#\"}; HF_TOKEN=${HF_TOKEN%\"}
      HF_TOKEN=${HF_TOKEN#\'}; HF_TOKEN=${HF_TOKEN%\'}
      export HF_TOKEN
      break
    fi
  done < "$SCRIPT_DIR/../.env"
fi

declare -A REPOS=(
  [ministral]="unsloth/Ministral-3-3B-Instruct-2512-GGUF"
  [qwen35-0.8b]="unsloth/Qwen3.5-0.8B-GGUF"
  [qwen35-2b]="unsloth/Qwen3.5-2B-GGUF"
  [qwen35-4b]="unsloth/Qwen3.5-4B-GGUF"
  [gemma4-e2b]="unsloth/gemma-4-E2B-it-GGUF"
  [gemma4-e4b]="unsloth/gemma-4-E4B-it-GGUF"
  [minicpm-v4.6]="openbmb/MiniCPM-V-4.6-gguf"
)
declare -A WEIGHTS=(
  [ministral]="Ministral-3-3B-Instruct-2512-IQ4_NL.gguf"
  [qwen35-0.8b]="Qwen3.5-0.8B-UD-Q4_K_XL.gguf"
  [qwen35-2b]="Qwen3.5-2B-UD-Q4_K_XL.gguf"
  [qwen35-4b]="Qwen3.5-4B-UD-Q4_K_XL.gguf"
  [gemma4-e2b]="gemma-4-E2B-it-UD-Q4_K_XL.gguf"
  [gemma4-e4b]="gemma-4-E4B-it-UD-Q4_K_XL.gguf"
  [minicpm-v4.6]="MiniCPM-V-4_6-Q4_K_M.gguf"
)
declare -A PROJECTORS=(
  [ministral]="mmproj-F16.gguf"
  [qwen35-0.8b]="mmproj-F16.gguf"
  [qwen35-2b]="mmproj-F16.gguf"
  [qwen35-4b]="mmproj-F16.gguf"
  [gemma4-e2b]="mmproj-F16.gguf"
  [gemma4-e4b]="mmproj-F16.gguf"
  [minicpm-v4.6]="mmproj-model-f16.gguf"
)

if [[ ${1:-} == --list ]]; then printf '%s\n' "${!REPOS[@]}" | sort; exit 0; fi
[[ $# -gt 0 ]] || set -- ministral

if [[ -n ${MODEL_WEIGHT:-} && $# -ne 1 ]]; then
  echo "MODEL_WEIGHT override requires exactly one model profile" >&2
  exit 2
fi

python3 -m pip install -q --upgrade huggingface_hub
export HF_XET_HIGH_PERFORMANCE=1
for model in "$@"; do
  [[ -n ${REPOS[$model]+x} ]] || { echo "Unknown model: $model" >&2; exit 2; }
  weight=${MODEL_WEIGHT:-${WEIGHTS[$model]}}
  projector=${MODEL_PROJECTOR:-${PROJECTORS[$model]}}
  mkdir -p "$MODELS_DIR/$model"
  echo "Downloading $model ($weight + $projector)..."
  hf download "${REPOS[$model]}" --local-dir "$MODELS_DIR/$model" \
    --include "$weight" --include "$projector"
done
du -sh "$MODELS_DIR"
