# Vision benchmark protocol

Use the same six images for every model. The filenames and expected locations
are defined in `benchmark_vision.mjs`. Choose fixtures that include a famous
landmark, ordinary streets, vegetation/terrain, small signs or text, mixed
lighting, and one deliberately ambiguous scene. Keep the original files
outside Git if they contain private metadata.

Run `./vision/run_benchmarks.sh --light` first. A successful light run verifies
model loading, multimodal projection, response parsing, and timeouts. Run the
full profile only after all selected models pass. Do not run the application or
GeoCLIP simultaneously. Record server temperature/throttling and repeat the
whole comparison if the machine was under unrelated load.

For each output, score these dimensions from 1 (unusable) to 5 (excellent):

- Grounding: visible objects and scene are described without inventions.
- Geolocation clue: hint is subtle, useful, and contains no forbidden place name.
- Format: title, three-word hint, language, JSON, and 12-word limit are obeyed.
- Commentary: coherent, first-person, amusing, and correct/wrong context matches.
- Consistency: warm repetitions retain quality without loops or truncation.

Treat an empty answer, wrong language, leaked place name, malformed structured
output, hallucinated landmark, or timeout as a hard failure and note it. Compare
median warm latency as the speed measure; retain first-run latency separately as
the cold-start measure. Select the smallest model whose hard-failure rate and
average manual score are acceptable—token throughput alone is not sufficient.

The archived results show prior full runs for Ministral, Qwen3.5 0.8B,
Qwen3.5 2B, and Gemma 4 E2B. To test only the two newly added sizes:

```bash
./vision/download-model.sh qwen35-4b gemma4-e4b
./vision/run_benchmarks.sh --light qwen35-4b gemma4-e4b
./vision/run_benchmarks.sh qwen35-4b gemma4-e4b
```

The runner is verbose by default: it displays a live progress bar, each model
response, and elapsed time. Container logs and structured JSON are retained in
the timestamped output directory.
