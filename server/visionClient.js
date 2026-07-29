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

const DATE_SCHEMA = {
  type: 'object',
  properties: {
    date: {
      type: 'string',
      pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
    },
  },
  required: ['date'],
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

export function buildDateCommentaryPrompt(language, actualDate, guessedDate) {
  const lang = normalizeLanguage(language);
  const actualMs = Date.parse(`${actualDate}T12:00:00Z`);
  const guessedMs = Date.parse(`${guessedDate}T12:00:00Z`);
  const differenceDays = Math.round(Math.abs(actualMs - guessedMs) / 86_400_000);
  const direction = guessedMs < actualMs ? 'early' : guessedMs > actualMs ? 'late' : 'exact';

  const prompts = {
    en: direction === 'exact'
      ? `You are an AI that guessed the exact date ${actualDate} for this photo. Write one short, funny, smug sentence (max 12 words) about getting the visual era clues right. First person. Reply with the sentence only.`
      : `You are an AI that guessed ${guessedDate} for this photo, but it was taken on ${actualDate}. Your guess was ${differenceDays} days too ${direction}. Write one short funny self-deprecating sentence (max 12 words) about which visible clue you misread. First person. Reply with the sentence only.`,
    fr: direction === 'exact'
      ? `Tu es une IA qui a deviné la date exacte ${actualDate} pour cette photo. Écris une courte phrase drôle et fière (max 12 mots) sur les indices visuels de l'époque. À la première personne. Réponds uniquement avec la phrase.`
      : `Tu es une IA qui a deviné ${guessedDate}, mais la photo date du ${actualDate}. Ton estimation avait ${differenceDays} jours d'écart. Écris une courte phrase drôle et autodérisoire (max 12 mots) sur l'indice visible que tu as mal interprété. À la première personne. Réponds uniquement avec la phrase.`,
    it: direction === 'exact'
      ? `Sei un'IA che ha indovinato la data esatta ${actualDate} per questa foto. Scrivi una breve frase divertente e compiaciuta (max 12 parole) sugli indizi visivi dell'epoca. Prima persona. Rispondi solo con la frase.`
      : `Sei un'IA che ha indovinato ${guessedDate}, ma la foto è del ${actualDate}. Hai sbagliato di ${differenceDays} giorni. Scrivi una breve frase divertente e autoironica (max 12 parole) sull'indizio visibile che hai interpretato male. Prima persona. Rispondi solo con la frase.`,
    es: direction === 'exact'
      ? `Eres una IA que acertó la fecha exacta ${actualDate} de esta foto. Escribe una frase corta, divertida y orgullosa (máx. 12 palabras) sobre las pistas visuales de la época. Primera persona. Responde solo con la frase.`
      : `Eres una IA que adivinó ${guessedDate}, pero la foto es del ${actualDate}. Fallaste por ${differenceDays} días. Escribe una frase corta y autoirónica (máx. 12 palabras) sobre la pista visible que interpretaste mal. Primera persona. Responde solo con la frase.`,
    de: direction === 'exact'
      ? `Du bist eine KI und hast das exakte Fotodatum ${actualDate} erraten. Schreib einen kurzen, witzigen und selbstzufriedenen Satz (max. 12 Wörter) über die visuellen Zeithinweise. Erste Person. Antworte nur mit dem Satz.`
      : `Du bist eine KI und hast ${guessedDate} geraten, aber das Foto entstand am ${actualDate}. Du lagst ${differenceDays} Tage daneben. Schreib einen kurzen selbstironischen Satz (max. 12 Wörter) über den sichtbaren Hinweis, den du falsch gedeutet hast. Erste Person. Antworte nur mit dem Satz.`,
    ru: direction === 'exact'
      ? `Ты ИИ и точно угадал дату фото: ${actualDate}. Напиши одну короткую смешную и самодовольную фразу (макс. 12 слов) о визуальных приметах эпохи. От первого лица. Ответь только фразой.`
      : `Ты ИИ и предположил ${guessedDate}, но фото сделано ${actualDate}. Ошибка составила ${differenceDays} дней. Напиши одну короткую самоироничную фразу (макс. 12 слов) о неверно понятой видимой подсказке. От первого лица. Ответь только фразой.`,
  };
  return prompts[lang] ?? prompts.en;
}

export function buildUploaderCommentaryPrompt(language, actualName, guessedName) {
  const lang = normalizeLanguage(language);
  const correct = actualName === guessedName;
  const factsByLanguage = {
    en: correct
      ? `The random pick happened to be correct: ${actualName} uploaded the photo.`
      : `The random pick was ${guessedName}, but ${actualName} uploaded the photo.`,
    fr: correct
      ? `Le choix aléatoire était juste : ${actualName} a ajouté la photo.`
      : `Le choix aléatoire était ${guessedName}, mais ${actualName} a ajouté la photo.`,
    it: correct
      ? `La scelta casuale era giusta: la foto è stata caricata da ${actualName}.`
      : `La scelta casuale era ${guessedName}, ma la foto è stata caricata da ${actualName}.`,
    es: correct
      ? `La elección aleatoria fue correcta: ${actualName} subió la foto.`
      : `La elección aleatoria fue ${guessedName}, pero ${actualName} subió la foto.`,
    de: correct
      ? `Die Zufallswahl war richtig: ${actualName} hat das Foto hochgeladen.`
      : `Die Zufallswahl war ${guessedName}, aber ${actualName} hat das Foto hochgeladen.`,
    ru: correct
      ? `Случайный выбор оказался верным: фото загрузил(а) ${actualName}.`
      : `Случайно выбран(а) ${guessedName}, но фото загрузил(а) ${actualName}.`,
  };
  const instructions = {
    en: 'Write one short funny first-person sentence (max 12 words). Explicitly treat the choice as random, not visual recognition. Reply with the sentence only.',
    fr: 'Écris une courte phrase drôle à la première personne (12 mots max). Présente clairement le choix comme aléatoire, pas comme une reconnaissance visuelle. Réponds uniquement avec la phrase.',
    it: 'Scrivi una breve frase divertente in prima persona (massimo 12 parole). Dichiara chiaramente che la scelta era casuale, non riconoscimento visivo. Rispondi solo con la frase.',
    es: 'Escribe una frase corta y divertida en primera persona (máx. 12 palabras). Deja claro que la elección fue aleatoria, no reconocimiento visual. Responde solo con la frase.',
    de: 'Schreib einen kurzen lustigen Satz in der ersten Person (max. 12 Wörter). Stelle klar, dass die Wahl zufällig war, nicht visuelle Erkennung. Antworte nur mit dem Satz.',
    ru: 'Напиши одну короткую смешную фразу от первого лица (до 12 слов). Ясно скажи, что выбор был случайным, а не результатом распознавания. Ответь только фразой.',
  };
  return `${factsByLanguage[lang] ?? factsByLanguage.en} ${instructions[lang] ?? instructions.en}`;
}

export function buildDateGuessPrompt(
  earliestDate = '1900-01-01',
  latestDate = new Date().toISOString().slice(0, 10),
) {
  return `Estimate when this photo was taken from visible clues. Return only JSON in the form {"date":"YYYY-MM-DD"}. Choose the most plausible day when the exact day is uncertain. The date must be between ${earliestDate} and ${latestDate}, inclusive.`;
}

export function normalizeVisionDateOutput(value) {
  if (typeof value !== 'string') return '';
  const date = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
  return '';
}

export function buildTitleHintPrompt(language, region, country, gameType = 'spot', captureDate = null) {
  const lang = normalizeLanguage(language);
  if (gameType === 'date') {
    const templates = {
      en: `JSON only. No other text.\n{"title":"TITLE","hint":"HINT"}\nTITLE = funny 2-3 word label for the scene.\nHINT = exactly 3 words that subtly suggest the photo's era from visible clues. Do not reveal a year, date, or decade.`,
      fr: `JSON uniquement. Aucun autre texte.\n{"title":"TITRE","hint":"INDICE"}\nTITRE = label drôle de 2-3 mots pour la scène.\nINDICE = exactement 3 mots suggérant subtilement l'époque par des indices visibles. Ne révèle aucune année, date ou décennie.`,
      it: `Solo JSON. Nessun altro testo.\n{"title":"TITOLO","hint":"INDIZIO"}\nTITOLO = etichetta divertente di 2-3 parole per la scena.\nINDIZIO = esattamente 3 parole che suggeriscono l'epoca da indizi visibili. Non rivelare anni, date o decenni.`,
      es: `Solo JSON. Sin otro texto.\n{"title":"TITULO","hint":"PISTA"}\nTITULO = etiqueta divertida de 2-3 palabras para la escena.\nPISTA = exactamente 3 palabras que sugieran sutilmente la época mediante pistas visibles. No reveles años, fechas ni décadas.`,
      de: `Nur JSON. Kein anderer Text.\n{"title":"TITEL","hint":"HINWEIS"}\nTITEL = witziges 2-3-Wörter-Label für die Szene.\nHINWEIS = genau 3 Wörter, die anhand sichtbarer Details dezent auf die Epoche hinweisen. Verrate kein Jahr, Datum oder Jahrzehnt.`,
      ru: `Только JSON. Никакого другого текста.\n{"title":"ЗАГОЛОВОК","hint":"ПОДСКАЗКА"}\nЗАГОЛОВОК = смешное название сцены из 2-3 слов.\nПОДСКАЗКА = ровно 3 слова, тонко указывающие на эпоху по видимым деталям. Не называй год, дату или десятилетие.`,
    };
    const dateContexts = {
      en: `\nThe verified capture date is ${captureDate}. Use it only to make the era hint accurate; never include the date, year, or decade in the output.`,
      fr: `\nLa date de prise de vue vérifiée est ${captureDate}. Utilise-la seulement pour rendre l’indice d’époque exact ; n’inclus jamais la date, l’année ou la décennie.`,
      it: `\nLa data di scatto verificata è ${captureDate}. Usala solo per rendere accurato l’indizio sull’epoca; non includere mai data, anno o decennio.`,
      es: `\nLa fecha de captura verificada es ${captureDate}. Úsala solo para que la pista temporal sea precisa; nunca incluyas la fecha, el año ni la década.`,
      de: `\nDas bestätigte Aufnahmedatum ist ${captureDate}. Nutze es nur für einen passenden Epochenhinweis; nenne niemals Datum, Jahr oder Jahrzehnt.`,
      ru: `\nПодтверждённая дата съёмки — ${captureDate}. Используй её только для точной подсказки об эпохе; никогда не называй дату, год или десятилетие.`,
    };
    const dateContext = captureDate ? (dateContexts[lang] ?? dateContexts.en) : '';
    return (templates[lang] ?? templates.en) + dateContext;
  }
  if (gameType === 'uploader') {
    const templates = {
      en: `JSON only. No other text.\n{"title":"TITLE","hint":"HINT"}\nTITLE = funny 2-3 word label for the scene.\nHINT = exactly 3 subtle words about the scene. Do not identify or imply who took or uploaded it.`,
      fr: `JSON uniquement. Aucun autre texte.\n{"title":"TITRE","hint":"INDICE"}\nTITRE = label drôle de 2-3 mots pour la scène.\nINDICE = exactement 3 mots subtils sur la scène. N'identifie pas et ne suggère pas l'auteur de la photo.`,
      it: `Solo JSON. Nessun altro testo.\n{"title":"TITOLO","hint":"INDIZIO"}\nTITOLO = etichetta divertente di 2-3 parole per la scena.\nINDIZIO = esattamente 3 parole sottili sulla scena. Non identificare né suggerire chi l'ha scattata o caricata.`,
      es: `Solo JSON. Sin otro texto.\n{"title":"TITULO","hint":"PISTA"}\nTITULO = etiqueta divertida de 2-3 palabras para la escena.\nPISTA = exactamente 3 palabras sutiles sobre la escena. No identifiques ni insinúes quién la tomó o subió.`,
      de: `Nur JSON. Kein anderer Text.\n{"title":"TITEL","hint":"HINWEIS"}\nTITEL = witziges 2-3-Wörter-Label für die Szene.\nHINWEIS = genau 3 dezente Wörter zur Szene. Verrate oder suggeriere nicht, wer das Foto aufgenommen oder hochgeladen hat.`,
      ru: `Только JSON. Никакого другого текста.\n{"title":"ЗАГОЛОВОК","hint":"ПОДСКАЗКА"}\nЗАГОЛОВОК = смешное название сцены из 2–3 слов.\nПОДСКАЗКА = ровно 3 неброских слова о сцене. Не указывай и не намекай, кто снял или загрузил фото.`,
    };
    return templates[lang] ?? templates.en;
  }
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
    const response = await callVisionAPI(imageB64, prompt, 40, 0.5, timeoutMs);
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
  gameType  = 'spot',
  captureDate = null,
) {
  try {
    const prompt   = buildTitleHintPrompt(language, region, country, gameType, captureDate);

    const startTime = Date.now();
    const response  = await callVisionAPI(
      imageB64, prompt, 48, 0.6, timeoutMs,
      { type: 'json_object', schema: TITLE_HINT_SCHEMA },
    );
    const processingTimeMs = Date.now() - startTime;

    if (!response.ok) {
      console.warn('[vision] Title/Hint query failed:', response.status);
      return { title: '', hint: '', processingTimeMs: 0 };
    }

    const result = await response.json();
    console.log('[vision] title/hint raw:', result?.choices?.[0]?.message?.content);
    const { title, hint } = parseTitleHint(result, country || gameType !== 'spot');
    return { title, hint, processingTimeMs };
  } catch (error) {
    handleVisionError(error, 'Title/Hint query');
    return { title: '', hint: '', processingTimeMs: 0 };
  }
}

export async function queryVisionModelForUploaderCommentary(
  imageB64,
  actualName,
  guessedName,
  timeoutMs = 120000,
  language = 'en',
) {
  try {
    const prompt = buildUploaderCommentaryPrompt(language, actualName, guessedName);
    const startTime = Date.now();
    const response = await callVisionAPI(imageB64, prompt, 40, 0.5, timeoutMs);
    if (!response.ok) {
      console.warn(`[vision] Uploader commentary query failed: ${response.status}`);
      return { commentary: '', processingTimeMs: 0 };
    }
    const result = await response.json();
    return { commentary: parseCommentary(result), processingTimeMs: Date.now() - startTime };
  } catch (error) {
    handleVisionError(error, 'Uploader commentary query');
    return { commentary: '', processingTimeMs: 0 };
  }
}

/**
 * Make a deliberately lightweight visual date estimate for DateTheShot.
 * The constrained JSON response keeps small local vision models reliable.
 */
export async function queryVisionModelForDate(
  imageB64,
  timeoutMs = 120000,
  earliestDate = '1900-01-01',
  latestDate = new Date().toISOString().slice(0, 10),
) {
  try {
    const prompt = buildDateGuessPrompt(earliestDate, latestDate);
    const startTime = Date.now();
    const response = await callVisionAPI(
      imageB64, prompt, 32, 0.2, timeoutMs,
      { type: 'json_object', schema: DATE_SCHEMA },
    );
    if (!response.ok) {
      console.warn(`[vision] Date query failed: ${response.status} - ${await response.text()}`);
      return { date: '', processingTimeMs: 0, requestFailed: true };
    }
    const result = await response.json();
    const raw = result?.choices?.[0]?.message?.content || '';
    console.log('[vision] date raw:', raw);
    let date = '';
    try {
      date = normalizeVisionDateOutput(JSON.parse(raw).date);
    } catch {
      date = normalizeVisionDateOutput(raw.match(/\d{4}-\d{2}(?:-\d{2})?/)?.[0]);
    }
    if (!date) {
      console.warn(
        `[vision] Date query returned an invalid value (finish_reason=${result?.choices?.[0]?.finish_reason ?? 'unknown'}):`,
        JSON.stringify(raw),
      );
    }
    return { date, processingTimeMs: Date.now() - startTime, requestFailed: false };
  } catch (error) {
    handleVisionError(error, 'Date query');
    return { date: '', processingTimeMs: 0, requestFailed: true };
  }
}

export async function queryVisionModelForDateCommentary(
  imageB64,
  actualDate,
  guessedDate,
  timeoutMs = 120000,
  language = 'en',
) {
  if (!actualDate || !guessedDate) return { commentary: '', processingTimeMs: 0 };
  try {
    const prompt = buildDateCommentaryPrompt(language, actualDate, guessedDate);
    const startTime = Date.now();
    const response = await callVisionAPI(imageB64, prompt, 40, 0.5, timeoutMs);
    if (!response.ok) {
      console.warn(`[vision] Date commentary query failed: ${response.status} - ${await response.text()}`);
      return { commentary: '', processingTimeMs: 0 };
    }
    const result = await response.json();
    console.log('[vision] date commentary raw:', result?.choices?.[0]?.message?.content);
    return { commentary: parseCommentary(result), processingTimeMs: Date.now() - startTime };
  } catch (error) {
    handleVisionError(error, 'Date commentary query');
    return { commentary: '', processingTimeMs: 0 };
  }
}
