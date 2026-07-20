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

On a shared six-core/11 GiB server, defaults cap the benchmark at three CPUs,
three inference threads, and 5 GiB RAM. Docker CPU shares let unrelated busy
containers win scheduling time. Override only after checking `free -h` and
`docker stats`, for example `BENCH_CPUS=2 BENCH_THREADS=2 BENCH_MEMORY=4g`.
There is no swap safety net: if less than roughly 5–6 GiB is available, Gemma
E4B may not fit and should be tested during a quieter window.

## Quantization sweep

The defaults are deliberately strong roughly-four-bit deployment choices, not
identical quantizers: Qwen/Gemma use UD-Q4_K_XL, Ministral uses IQ4_NL, and
MiniCPM uses its publisher-recommended Q4_K_M. First compare architectures with
these defaults. Then test Q5_K_M (quality candidate) and IQ4_NL or Q4_K_M
(memory/speed candidate) only for the winner. Q8 is generally not worthwhile on
this 11 GiB shared CPU host.

Download an alternate file into its existing profile directory, for example:

```bash
MODEL_WEIGHT=Qwen3.5-2B-Q5_K_M.gguf ./vision/download-model.sh qwen35-2b
```

Benchmark it by overriding the container path while retaining the profile's
projector and chat settings:

```bash
BENCH_MODEL_FILE=/app/models/qwen35-2b/Qwen3.5-2B-Q5_K_M.gguf \
BENCH_LABEL=qwen35-2b-Q5_K_M \
  ./vision/run_benchmarks.sh --light qwen35-2b
```

Use the same images, thread count, temperature, and warm-run comparison. Record
both file size and peak container memory; accept the larger quant only when its
manual quality improvement is visible and repeatable.
