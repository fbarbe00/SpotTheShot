#!/usr/bin/env node
/**
 * benchmark_vision.mjs
 *
 * Usage:
 *   node benchmark_vision.mjs <model> [outFile]          # full benchmark
 *   node benchmark_vision.mjs <model> [outFile] --light  # light benchmark (~½ time)
 *
 * --light mode cuts:
 *   • Images:    6 → 3  (atomium, eifell_tower, yerevan — visually distinct)
 *   • Languages: 6 → 1  (English only)
 *   • Runs:      2 → 1  per call type (no second duplicate)
 *   • Commentary: correct + wrong only (same as full, but 1 run each)
 *
 * Full steps per image:  6 langs × (2 th + 2 cc + 2 cw) = 36  → 6 images = 216 steps
 * Light steps per image: 1 lang  × (1 th + 1 cc + 1 cw)  = 3  → 3 images =   9 steps
 * Theoretical speedup: 216 / 9 = 24× (minus container/model warm-up fixed cost)
 * Practical target: well under ½ of full benchmark wall-clock time.
 */

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryVisionModel, queryVisionModelForTitleAndHint } from '../server/visionClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── CLI args ────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const model    = args.find(a => !a.startsWith('--')) || process.env.MODEL || 'gemma4';
const LIGHT    = args.includes('--light');
const outFile  = args.find(a => !a.startsWith('--') && a !== model)
               || path.join(__dirname, 'benchmarks', `${model}${LIGHT ? '-light' : ''}.json`);

// ─── Config ──────────────────────────────────────────────────────────────────

const wrongGuess = { region: 'Bavaria', country: 'Germany' };

const ALL_IMAGES = [
  { file: 'atomium.jpg',         region: 'Brussels',        country: 'Belgium'   },
  { file: 'copenhagen.jpg',      region: 'Capital Region',  country: 'Denmark'   },
  { file: 'eifell_tower.jpg',    region: 'Ile-de-France',   country: 'France'    },
  { file: 'italian_bollard.jpg', region: 'Italy',           country: 'Italy'     },
  { file: 'vilnius.jpg',         region: 'Vilnius County',  country: 'Lithuania' },
  { file: 'yerevan.jpg',         region: 'Yerevan',         country: 'Armenia'   },
];

const ALL_LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'ru'];

// Light profile — 3 visually distinct images, English only, single run
const LIGHT_IMAGES    = ['atomium.jpg', 'eifell_tower.jpg', 'yerevan.jpg'];
const LIGHT_LANGUAGES = ['en'];
const LIGHT_RUNS      = 1;    // only "first" run
const FULL_RUNS       = 2;    // first + second run

const images    = LIGHT ? ALL_IMAGES.filter(i => LIGHT_IMAGES.includes(i.file)) : ALL_IMAGES;
const LANGUAGES = LIGHT ? LIGHT_LANGUAGES : ALL_LANGUAGES;
const RUNS      = LIGHT ? LIGHT_RUNS      : FULL_RUNS;

// ─── Progress helpers ────────────────────────────────────────────────────────

const COLS = process.stdout.columns || 80;

function clearLine() { process.stdout.write('\r\x1b[K'); }

function bar(done, total, width = 28) {
  const filled = Math.round((done / total) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function printProgress(step, total, label, detail = '') {
  const pct    = Math.round((step / total) * 100);
  const b      = bar(step, total);
  const suffix = detail ? ` ${detail}` : '';
  const line   = ` ${b} ${String(pct).padStart(3)}% ${label}${suffix}`;
  clearLine();
  process.stdout.write(line.slice(0, COLS - 1));
}

function printResult(label, value, ms) {
  clearLine();
  const time    = ms != null ? ` \x1b[2m(${(ms / 1000).toFixed(1)}s)\x1b[0m` : '';
  const display = value
    ? `\x1b[32m${value}\x1b[0m`
    : '\x1b[31m∅\x1b[0m';
  console.log(` \x1b[2m${label}:\x1b[0m ${display}${time}`);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();

  // Steps = images × langs × (titleHint_runs + cc_runs + cw_runs)
  const stepsPerImageLang = RUNS + RUNS + RUNS;  // th + cc + cw
  const totalSteps = images.length * LANGUAGES.length * stepsPerImageLang;
  let step = 0;

  const results = {
    model,
    mode: LIGHT ? 'light' : 'full',
    startedAt,
    visionUrl:  process.env.VISION_URL || 'http://localhost:8001',
    wrongGuess,
    languages:  LANGUAGES,
    images:     [],
  };

  console.log(
    `\n\x1b[1mBenchmark: ${model}\x1b[0m` +
    ` [${LIGHT ? '\x1b[33mLIGHT\x1b[0m' : '\x1b[36mFULL\x1b[0m'}]` +
    ` — ${images.length} images × ${LANGUAGES.length} lang(s) × ${RUNS} run(s)\n`
  );

  for (const item of images) {
    const imagePath   = path.join(__dirname, 'test_images', item.file);
    const imageBuffer = await fs.readFile(imagePath);
    const imgLabel    = `${item.file} (${item.region}, ${item.country})`;

    console.log(`\n\x1b[1m▸ ${imgLabel}\x1b[0m`);

    const titleHintByLang  = {};
    const commentaryByLang = {};

    for (const lang of LANGUAGES) {
      const ll = `[${lang}]`;

      // ── Title / Hint ──────────────────────────────────────────────────────
      const thResults = [];
      for (let run = 0; run < RUNS; run++) {
        const runLabel = RUNS > 1 ? ` run ${run + 1}` : '';
        printProgress(step, totalSteps, `${ll} title/hint${runLabel}…`, item.file);
        const th = await queryVisionModelForTitleAndHint(imageBuffer, item.region, item.country, 120000, lang);
        step++;
        printResult(`${ll} title [${run + 1}]`, th.title, th.processingTimeMs);
        printResult(`${ll} hint  [${run + 1}]`, th.hint,  th.processingTimeMs);
        thResults.push(th);
      }
      titleHintByLang[lang] = RUNS > 1
        ? { first: thResults[0], second: thResults[1] }
        : { first: thResults[0] };

      // ── Commentary: correct ───────────────────────────────────────────────
      const ccResults = [];
      for (let run = 0; run < RUNS; run++) {
        const runLabel = RUNS > 1 ? ` run ${run + 1}` : '';
        printProgress(step, totalSteps, `${ll} correct${runLabel}…`, item.file);
        const cc = await queryVisionModel(
          imageBuffer, item.region, item.country,
          item.region, item.country,
          120000, lang,
        );
        step++;
        printResult(`${ll} correct [${run + 1}]`, cc.commentary, cc.processingTimeMs);
        ccResults.push(cc);
      }

      // ── Commentary: wrong ─────────────────────────────────────────────────
      const cwResults = [];
      for (let run = 0; run < RUNS; run++) {
        const runLabel = RUNS > 1 ? ` run ${run + 1}` : '';
        printProgress(step, totalSteps, `${ll} wrong${runLabel}…`, item.file);
        const cw = await queryVisionModel(
          imageBuffer, item.region, item.country,
          wrongGuess.region, wrongGuess.country,
          120000, lang,
        );
        step++;
        printResult(`${ll} wrong  [${run + 1}]`, cw.commentary, cw.processingTimeMs);
        cwResults.push(cw);
      }

      commentaryByLang[lang] = RUNS > 1
        ? { correct: { first: ccResults[0], second: ccResults[1] },
            wrong:   { first: cwResults[0], second: cwResults[1] } }
        : { correct: { first: ccResults[0] },
            wrong:   { first: cwResults[0] } };
    }

    results.images.push({
      file:        item.file,
      expected:    { region: item.region, country: item.country },
      titleHint:   titleHintByLang,
      commentary:  commentaryByLang,
    });
  }

  clearLine();
  console.log(`\n\x1b[1m✓ Done\x1b[0m ${bar(1, 1)} 100%\n`);

  results.completedAt = new Date().toISOString();
  const durationMs    = new Date(results.completedAt) - new Date(results.startedAt);
  results.durationMs  = durationMs;
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved: ${outFile}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
