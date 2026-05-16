/**
 * Vision client for image commentary and auto-naming.
 * Calls an external llama-server instance.
 */

import sharp from 'sharp';

const VISION_URL = process.env.VISION_URL || 'http://vision:8001';
const VALID_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'ru'];

const TITLE_HINT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    hint:  { type: 'string' },
  },
  required: ['title', 'hint'],
  additionalProperties: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeLanguage(language) {
  const lang = String(language || '').toLowerCase();
  return VALID_LANGUAGES.includes(lang) ? lang : 'en';
}

/**
 * Resize and encode image as JPEG.
 * JPEG is used because llama.cpp's stb_image decoder does not support WebP.
 */
async function preprocessImage(imageBuffer) {
  try {
    const processed = await sharp(imageBuffer)
      .resize(224, 224, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 50, progressive: false, force: true })
      .toBuffer();
    return processed.toString('base64');
  } catch (error) {
    throw new Error(`Failed to preprocess image: ${error.message}`);
  }
}

export async function preprocessImageBuffer(imageBuffer) {
  return preprocessImage(imageBuffer);
}

/**
 * Build commentary prompt. The AI speaks in first person as the guesser:
 * - correct: smug/funny one-liner about nailing it
 * - wrong: funny self-deprecating reason why it guessed the wrong place
 * - fallback: generic funny observation about the image
 *
 * Tone: first-person AI voice, not roasting the user. Short sentence only.
 */
function buildCommentaryPrompt(language, region, country, guessedRegion, guessedCountry) {
  const lang = normalizeLanguage(language);
  const hasComparison = region && country && guessedRegion && guessedCountry;
  const correct = hasComparison && region === guessedRegion && country === guessedCountry;

  // Each prompt ends with a concrete example to anchor the output format.
  const prompts = {
    en: {
      correct: `You are an AI that just correctly guessed this photo is from ${region}, ${country}. Write one short funny sentence (max 12 words) explaining why you knew. First person. Example: "Those cobblestones only exist in one place on Earth." Reply with the sentence only.`,
      wrong:   `You are an AI that just guessed this photo was from ${guessedRegion}, ${guessedCountry}, but it was actually ${region}, ${country}. Write one short funny self-deprecating sentence (max 12 words) about your mistake. First person. Example: "I clearly confused Gothic spires with beer gardens again." Reply with the sentence only.`,
      fallback: `Write one short funny sentence (max 12 words) about what you see in this photo. First person AI voice. Reply with the sentence only.`,
    },
    fr: {
      correct: `Tu es une IA qui vient de deviner que cette photo vient de ${region}, ${country}. Écris une courte phrase drôle (max 12 mots) expliquant pourquoi tu l'as su. À la première personne. Exemple : "Ces pavés ne peuvent exister qu'à un seul endroit." Réponds avec la phrase uniquement.`,
      wrong:   `Tu es une IA qui a deviné ${guessedRegion}, ${guessedCountry}, mais c'était ${region}, ${country}. Écris une courte phrase drôle autodérision (max 12 mots) sur ton erreur. À la première personne. Exemple : "J'ai clairement confondu les clochers gothiques avec des brasseries." Réponds avec la phrase uniquement.`,
      fallback: `Écris une courte phrase drôle (max 12 mots) sur ce que tu vois dans cette photo. Voix IA à la première personne. Réponds avec la phrase uniquement.`,
    },
    it: {
      correct: `Sei un'IA che ha appena indovinato che questa foto viene da ${region}, ${country}. Scrivi una breve frase divertente (max 12 parole) che spiega perché lo sapevi. Prima persona. Esempio: "Quei sampietrini esistono solo in un posto al mondo." Rispondi solo con la frase.`,
      wrong:   `Sei un'IA che ha indovinato ${guessedRegion}, ${guessedCountry}, ma era ${region}, ${country}. Scrivi una breve frase divertente autoironica (max 12 parole) sul tuo errore. Prima persona. Esempio: "Ho chiaramente confuso le guglie gotiche con le birrerie." Rispondi solo con la frase.`,
      fallback: `Scrivi una breve frase divertente (max 12 parole) su quello che vedi in questa foto. Voce IA in prima persona. Rispondi solo con la frase.`,
    },
    es: {
      correct: `Eres una IA que acaba de adivinar que esta foto es de ${region}, ${country}. Escribe una frase corta y divertida (máx 12 palabras) explicando cómo lo supiste. Primera persona. Ejemplo: "Esos adoquines solo existen en un lugar del mundo." Responde solo con la frase.`,
      wrong:   `Eres una IA que adivinó ${guessedRegion}, ${guessedCountry}, pero era ${region}, ${country}. Escribe una frase corta y autoirónica (máx 12 palabras) sobre tu error. Primera persona. Ejemplo: "Claramente confundí las agujas góticas con jardines de cerveza." Responde solo con la frase.`,
      fallback: `Escribe una frase corta y divertida (máx 12 palabras) sobre lo que ves en esta foto. Voz de IA en primera persona. Responde solo con la frase.`,
    },
    de: {
      correct: `Du bist eine KI, die gerade richtig geraten hat, dass dieses Foto aus ${region}, ${country} stammt. Schreib einen kurzen witzigen Satz (max. 12 Wörter), warum du es wusstest. Erste Person. Beispiel: „Diese Kopfsteinpflaster gibt es nur an einem Ort der Welt." Antworte nur mit dem Satz.`,
      wrong:   `Du bist eine KI, die ${guessedRegion}, ${guessedCountry} geraten hat, aber es war ${region}, ${country}. Schreib einen kurzen selbstironischen Satz (max. 12 Wörter) über deinen Fehler. Erste Person. Beispiel: „Ich hab gotische Türme mal wieder mit Biergärten verwechselt." Antworte nur mit dem Satz.`,
      fallback: `Schreib einen kurzen witzigen Satz (max. 12 Wörter) über das, was du in diesem Foto siehst. KI-Stimme, erste Person. Antworte nur mit dem Satz.`,
    },
    ru: {
      correct: `Ты ИИ, который только что правильно угадал, что это фото из ${region}, ${country}. Напиши одно короткое смешное предложение (макс. 12 слов), почему ты это знал. От первого лица. Пример: «Такая брусчатка бывает только в одном месте на земле.» Ответь только предложением.`,
      wrong:   `Ты ИИ, который угадал ${guessedRegion}, ${guessedCountry}, но на самом деле это ${region}, ${country}. Напиши одно короткое самоироничное предложение (макс. 12 слов) о своей ошибке. От первого лица. Пример: «Я снова перепутал готические шпили с пивными садами.» Ответь только предложением.`,
      fallback: `Напиши одно короткое смешное предложение (макс. 12 слов) о том, что видишь на фото. Голос ИИ от первого лица. Ответь только предложением.`,
    },
  };

  const set = prompts[lang] ?? prompts.en;
  if (!hasComparison) return set.fallback;
  return correct ? set.correct : set.wrong;
}

function buildTitleHintPrompt(language, region, country) {
  const lang = normalizeLanguage(language);
  const locationContext = region && country
    ? (lang === 'fr' ? `\nPhoto de ${region}, ${country}.`
      : lang === 'it' ? `\nFoto da ${region}, ${country}.`
      : lang === 'es' ? `\nFoto de ${region}, ${country}.`
      : lang === 'de' ? `\nFoto aus ${region}, ${country}.`
      : lang === 'ru' ? `\nФото из ${region}, ${country}.`
      : `\nPhoto from ${region}, ${country}.`)
    : '';

  // No angle-bracket placeholders — small models echo them literally.
  const templates = {
    en: `JSON only. No other text.\n{"title":"TITLE","hint":"HINT"}\nTITLE = funny 2-3 word label for the scene.\nHINT = 3 words, not obvious but helpful for identifying the region. No place names.`,
    fr: `JSON uniquement. Aucun autre texte.\n{"title":"TITRE","hint":"INDICE"}\nTITRE = label drôle 2-3 mots sur la scène.\nINDICE = 3 mots, pas évidents mais utiles pour identifier la région. Pas de noms de lieux.`,
    it: `Solo JSON. Nessun altro testo.\n{"title":"TITOLO","hint":"INDIZIO"}\nTITOLO = etichetta divertente 2-3 parole sulla scena.\nINDIZIO = 3 parole, non ovvie ma utili per identificare la regione. No nomi di luoghi.`,
    es: `Solo JSON. Sin otro texto.\n{"title":"TITULO","hint":"PISTA"}\nTITULO = etiqueta graciosa 2-3 palabras sobre la escena.\nPISTA = 3 palabras, no obvias pero útiles para identificar la región. Sin nombres de lugares.`,
    de: `Nur JSON. Kein anderer Text.\n{"title":"TITEL","hint":"HINWEIS"}\nTITEL = witziges 2-3-Wörter-Label für die Szene.\nHINWEIS = 3 Wörter, nicht offensichtlich aber hilfreich zur Erkennung der Region. Keine Ortsnamen.`,
    ru: `Только JSON. Никакого другого текста.\n{"title":"ЗАГОЛОВОК","hint":"ПОДСКАЗКА"}\nЗАГОЛОВОК = смешное 2-3-словное название сцены.\nПОДСКАЗКА = 3 слова, не очевидные, но полезные для определения региона. Без названий мест.`,
  };

  return (templates[lang] ?? templates.en) + locationContext;
}

function handleVisionError(error, context) {
  if (error.name === 'AbortError') {
    console.warn(`[vision] ${context} timed out`);
  } else if (error.message.includes('ECONNREFUSED')) {
    console.warn('[vision] Service not available (connection refused)');
  } else if (error.message.includes('ECONNRESET')) {
    console.warn('[vision] Service connection reset');
  } else {
    console.warn(`[vision] ${context} error:`, error.message);
  }
}

// ─── API call ────────────────────────────────────────────────────────────────

async function callVisionAPI(imageB64, prompt, maxTokens, temperature, timeoutMs, responseFormat = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      temperature,
      max_tokens: maxTokens,
      // Penalise repetition — prevents looping in small models
      repeat_penalty: 1.1,
      top_p: 0.9,
      stream: false,
    };

    if (responseFormat) body.response_format = responseFormat;

    const response = await fetch(`${VISION_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ─── Response parsers ────────────────────────────────────────────────────────

function _findFirstSentence(text, vsRe) {
  const terminators = /[.!?…]/g;
  let m;
  while ((m = terminators.exec(text)) !== null) {
    if (vsRe.test(text.slice(0, m.index + 1).trimEnd())) continue;
    return text.slice(0, m.index + 1).trim();
  }
  return null;
}

/**
 * Parse commentary from a vision API response.
 *
 * Uses finish_reason to distinguish two cases:
 *  - "length": output was cut off at max_tokens — find the first complete
 *    sentence; if none exists, return '' to suppress the incomplete text.
 *  - "stop" (or null): model stopped naturally — apply heuristic cleanup for
 *    the known "vs." mid-sentence stop artefact from small models.
 */
function parseCommentary(result) {
  const choice = result.choices?.[0];
  const raw = (choice?.message?.content || '').trim();
  const wasTruncated = choice?.finish_reason === 'length';

  // Strip surrounding quotes if the model wrapped the sentence
  const qi = raw.indexOf('"');
  const qj = raw.indexOf('"', qi + 1);
  let text = (qi > -1 && qj > -1) ? raw.slice(qi + 1, qj) : raw;
  text = text.trim();

  const vsRe = /\bvs?\.?\s*$/i;

  if (wasTruncated) {
    // Output was cut mid-token — only keep text up to the first complete sentence.
    // Return empty string if no sentence-ender is present (avoids showing broken output).
    return _findFirstSentence(text, vsRe) ?? '';
  }

  // ── Model stopped naturally ───────────────────────────────────────────────
  // Step 1: detect trailing cut-off comparison word
  // Catches artefacts like "…pretentiousness vs." where the model chose a
  // natural sentence end at a period inside a comparison phrase.
  const cutoffPattern = /\s+(?:vs\.?|versus|and|but|or|than|like|for)\s*\.?\s*$/i;
  const cutText = text.replace(cutoffPattern, '').trim();

  const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
  if (cutText && wordCount(cutText) >= 4) {
    return /[.!?…]$/.test(cutText) ? cutText : cutText + '.';
  }

  // Step 2: find first real sentence-ender, skipping "vs."
  return _findFirstSentence(text, vsRe) ?? text;
}

function parseTitleHint(result, country) {
  const raw = result?.choices?.[0]?.message?.content || '';
  let title = '', hint = '';
  try {
    const parsed = JSON.parse(raw);
    title = parsed.title || '';
    hint  = parsed.hint  || '';
  } catch {
    title = raw.match(/"title"\s*:\s*"([^"]+)"/)?.[1] || '';
    hint  = raw.match(/"hint"\s*:\s*"([^"]+)"/)?.[1]  || '';
  }

  if (!country) hint = '';
  return { title, hint };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate AI commentary for a round result.
 * The AI speaks in first person — either proud of a correct guess or
 * self-deprecatingly funny about a wrong one.
 */
export async function queryVisionModel(
  imageB64,
  region        = null,
  country       = null,
  guessedRegion = null,
  guessedCountry = null,
  timeoutMs     = 120000,
  language      = 'en',
) {
  try {
    const prompt   = buildCommentaryPrompt(language, region, country, guessedRegion, guessedCountry);

    const startTime = Date.now();
    // temperature 0.5: creative enough for variety, stable enough for coherence.
    const response = await callVisionAPI(imageB64, prompt, 50, 0.5, timeoutMs);
    const processingTimeMs = Date.now() - startTime;

    if (!response.ok) {
      console.warn(`[vision] Commentary query failed: ${response.status} - ${await response.text()}`);
      return { commentary: '', processingTimeMs: 0 };
    }

    const result = await response.json();
    console.log('[vision] commentary raw:', result?.choices?.[0]?.message?.content);
    const commentary = parseCommentary(result);
    return { commentary, processingTimeMs };
  } catch (error) {
    handleVisionError(error, 'Commentary query');
    return { commentary: '', processingTimeMs: 0 };
  }
}

/**
 * Generate a funny title and location hint for an image.
 */
export async function queryVisionModelForTitleAndHint(
  imageB64,
  region    = null,
  country   = null,
  timeoutMs = 120000,
  language  = 'en',
) {
  try {
    const prompt   = buildTitleHintPrompt(language, region, country);

    const startTime = Date.now();
    const response  = await callVisionAPI(
      imageB64, prompt, 60, 0.6, timeoutMs,
      { type: 'json_object', schema: TITLE_HINT_SCHEMA },
    );
    const processingTimeMs = Date.now() - startTime;

    if (!response.ok) {
      console.warn('[vision] Title/Hint query failed:', response.status);
      return { title: '', hint: '', processingTimeMs: 0 };
    }

    const result = await response.json();
    console.log('[vision] title/hint raw:', result?.choices?.[0]?.message?.content);
    const { title, hint } = parseTitleHint(result, country);
    return { title, hint, processingTimeMs };
  } catch (error) {
    handleVisionError(error, 'Title/Hint query');
    return { title: '', hint: '', processingTimeMs: 0 };
  }
}
