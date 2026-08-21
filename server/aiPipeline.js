import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { lookupLocation } from './geoclipClient.js';
import {
  preprocessImageBuffer,
  queryVisionModel,
  queryVisionModelForDate,
  queryVisionModelForDateCommentary,
  queryVisionModelForUploaderCommentary,
  queryVisionModelForTitleAndHint,
} from './visionClient.js';
import { handleError, handleAIOperationError, mimeTypeForFile } from './gameHelpers.js';
import { isValidCoordinate } from './utils.js';
import { clampDateToRange, deriveDatePromptBounds, normalizePhotoDate, todayUtcDate } from './scoring.js';

const GEOCLIP_URL = process.env.GEOCLIP_URL || 'http://geoclip:8000';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const FormDataClass = globalThis.FormData;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class AIPipeline {

  _datePromptBounds(lobby) {
    const configuredStart = normalizePhotoDate(lobby?.settings?.dateTimelineStart);
    const configuredEnd = normalizePhotoDate(lobby?.settings?.dateTimelineEnd);
    if (configuredStart && configuredEnd && configuredStart <= configuredEnd) {
      return { start: configuredStart, end: configuredEnd, source: 'lobby timeline' };
    }
    const derived = deriveDatePromptBounds(lobby?.photos?.map(photo => photo.captureDate) || []);
    return derived ? { ...derived, source: 'uploaded photo dates' } : null;
  }

  _initAIPipeline() {
    this.predictions = new Map();
    this.photoLocations = new Map();
    this.predictionLocations = new Map();
    this.visionCommentaries = new Map();
    this.imageTitles = new Map();
    this.datePredictions = new Map();

    this._inflightPredictions = new Map();
    this._inflightPhotoLocations = new Map();
    this._inflightPredictionLocations = new Map();
    this._inflightVisions = new Map();
    this._inflightTitles = new Map();
    this._inflightDates = new Map();
    this._preprocessedImages = new Map();

    this._predictionAttempted = new Set();
    this._visionAttempted = new Set();
    this._autoNamingAttempted = new Set();
    this._datePredictionAttempted = new Set();
    this._visionRevisions = new Map();
    this._titleRevisions = new Map();
    this._dateRevisions = new Map();

    this.geoActive = 0;
    this.geoQueue = [];
    // Reduce concurrency for CPU-based AI processing (GeoCLIP runs on CPU)
    // Can be overridden via GEO_CONCURRENCY env var
    this.geoConcurrency = Math.max(1, Math.min(8, parseInt(process.env.GEO_CONCURRENCY || '2', 10) || 2));

    this.visionActive = 0;
    this.visionQueue = [];
    // Vision model runs sequentially to avoid memory issues on CPU
    // Can be overridden via VISION_CONCURRENCY env var
    this.visionConcurrency = Math.max(1, Math.min(4, parseInt(process.env.VISION_CONCURRENCY || '1', 10) || 1));
  }

  /* ─── Concurrency semaphore ─── */

  async _acquire(slotFor) {
    const isGeo = slotFor === 'geo';
    const activeKey = isGeo ? 'geoActive' : 'visionActive';
    const queue = isGeo ? this.geoQueue : this.visionQueue;
    const concurrency = isGeo ? this.geoConcurrency : this.visionConcurrency;

    const release = () => {
      this[activeKey] = Math.max(0, this[activeKey] - 1);
      if (queue.length) queue.shift()();
    };

    if (this[activeKey] < concurrency) {
      this[activeKey]++;
      return release;
    }

    return new Promise(resolve =>
      queue.push(() => { this[activeKey]++; resolve(release); })
    );
  }

  /* ─── Cache helpers ─── */

  _isFresh(entry, ttl = DEFAULT_CACHE_TTL_MS) {
    return entry && (Date.now() - entry.timestamp) < ttl;
  }

  _invalidatePhotoCaches(photoId) {
    this._visionRevisions.set(photoId, (this._visionRevisions.get(photoId) || 0) + 1);
    this._titleRevisions.set(photoId, (this._titleRevisions.get(photoId) || 0) + 1);
    this._invalidateDatePrediction(photoId);
    for (const cache of [
      this.predictions, this.photoLocations, this.predictionLocations,
      this.visionCommentaries, this.imageTitles,
      this._inflightPredictions, this._inflightPhotoLocations,
      this._inflightPredictionLocations, this._inflightVisions, this._inflightTitles,
      this._preprocessedImages,
    ]) {
      cache.delete(photoId);
    }
    this._predictionAttempted.delete(photoId);
    this._visionAttempted.delete(photoId);
    this._autoNamingAttempted.delete(photoId);
  }

  _invalidateDatePrediction(photoId) {
    this._dateRevisions.set(photoId, (this._dateRevisions.get(photoId) || 0) + 1);
    this.datePredictions.delete(photoId);
    this._datePredictionAttempted.delete(photoId);
    for (const key of this._inflightDates.keys()) {
      if (key.startsWith(`${photoId}:`)) this._inflightDates.delete(key);
    }
  }

  _invalidateLocationCaches(photoId) {
    for (const cache of [
      this.photoLocations, this.predictionLocations,
      this._inflightPhotoLocations, this._inflightPredictionLocations,
    ]) {
      cache.delete(photoId);
    }
  }

  _invalidateVisionCommentary(photoId) {
    this._visionRevisions.set(photoId, (this._visionRevisions.get(photoId) || 0) + 1);
    this.visionCommentaries.delete(photoId);
    this._inflightVisions.delete(photoId);
    this._visionAttempted.delete(photoId);
  }

  _invalidateModeDependentCaches(photo) {
    this._invalidateVisionCommentary(photo.id);
    const generated = this.imageTitles.get(photo.id);
    if (generated && photo.title === generated.title) {
      photo.title = '';
      if (photo.hint === generated.hint) photo.hint = '';
    }
    this.imageTitles.delete(photo.id);
    this._inflightTitles.delete(photo.id);
    this._autoNamingAttempted.delete(photo.id);
    this._titleRevisions.set(photo.id, (this._titleRevisions.get(photo.id) || 0) + 1);
  }

  _normalizeLanguage(language) {
    const lang = String(language || '').toLowerCase();
    return ['en', 'fr', 'it', 'es', 'de', 'ru'].includes(lang) ? lang : 'en';
  }

  _aiNicknameForLanguage(language) {
    const lang = this._normalizeLanguage(language);
    return { en: 'Computer', fr: 'Ordinateur', it: 'Computer', es: 'Ordenador', de: 'Computer', ru: 'Компьютер' }[lang] ?? 'Computer';
  }

  /* ─── File helpers ─── */

  async _readPhotoBuffer(photo) {
    const file = path.basename(photo.url);
    return fs.readFile(path.join(UPLOADS_DIR, file));
  }

  async _ensurePreprocessed(photo) {
    const cached = this._preprocessedImages.get(photo.id);
    if (cached) return cached;
    const buffer = await this._readPhotoBuffer(photo);
    const b64 = await preprocessImageBuffer(buffer);
    this._preprocessedImages.set(photo.id, b64);
    return b64;
  }

  /* ─── Generic dedup helper ─── */

  async _dedupedAsync(cache, inflight, key, factory) {
    if (this._isFresh(cache.get(key))) return cache.get(key);

    if (inflight.has(key)) {
      try { return await inflight.get(key); } catch { return null; }
    }

    const promise = factory().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
    try { return await promise; } catch { return null; }
  }

  /* ─── Location lookups ─── */

  async _lookupAndCacheLocation(lat, lon, photoId, cache, inflight, logLabel) {
    return this._dedupedAsync(cache, inflight, photoId, async () => {
      try {
        const info = await lookupLocation(lat, lon);
        const entry = { region: info.region, country: info.country, isoCode: info.isoCode, timestamp: Date.now() };
        cache.set(photoId, entry);
        return entry;
      } catch (err) {
        console.warn(`${logLabel} location lookup error:`, err?.message ?? err);
        return { region: null, country: null, isoCode: null };
      }
    });
  }

  async ensurePhotoLocation(lat, lon, photoId) {
    return (await this._lookupAndCacheLocation(lat, lon, photoId, this.photoLocations, this._inflightPhotoLocations, 'Photo')) ?? { region: null, country: null };
  }

  async ensurePredictionLocation(lat, lon, photoId) {
    return (await this._lookupAndCacheLocation(lat, lon, photoId, this.predictionLocations, this._inflightPredictionLocations, 'Prediction')) ?? { region: null, country: null };
  }

  /* ─── GeoCLIP prediction ─── */

  async ensurePrediction(photo, { force = false, timeoutMs = 30000 } = {}) {
    if (!force && this._isFresh(this.predictions.get(photo.id))) {
      const { lat, lon } = this.predictions.get(photo.id);
      return { lat, lon };
    }

    return this._dedupedAsync(this.predictions, this._inflightPredictions, photo.id, async () => {
      const release = await this._acquire('geo');
      try {
        const file = path.basename(photo.url);
        const full = path.join(UPLOADS_DIR, file);

        if (!fsSync.existsSync(full)) {
          console.warn(`Photo file not found: ${full}`);
          return null;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let resp;
        try {
          const fileBuffer = await fs.readFile(full);
          const blob = new Blob([fileBuffer], { type: mimeTypeForFile(file) });
          const formData = new FormDataClass();
          formData.append('file', blob, file);

          resp = await fetch(`${GEOCLIP_URL}/predict?top_k=1`, {
            method: 'POST', body: formData, signal: controller.signal,
          });
        } catch (error) {
          clearTimeout(timeout);
          return handleAIOperationError(error, 'GeoCLIP prediction', photo.id);
        }

        clearTimeout(timeout);

        if (!resp.ok) {
          let errorText = '';
          try { errorText = JSON.stringify(await resp.json()); } catch { errorText = await resp.text(); }
          return handleAIOperationError(
            Object.assign(new Error(`GeoCLIP returned ${resp.status}: ${errorText}`), { statusCode: resp.status }),
            'GeoCLIP prediction', photo.id
          );
        }

        const json = await resp.json();
        const pred = json.predictions?.[0];
        if (!pred) return null;

        const { latitude: lat, longitude: lon } = pred;
        if (!isValidCoordinate(lat, lon)) {
          console.warn('GeoCLIP returned invalid coordinates', pred);
          return null;
        }

        const entry = { lat, lon, timestamp: Date.now() };
        this.predictions.set(photo.id, entry);
        return entry;
      } finally {
        release();
        this._predictionAttempted.add(photo.id);
      }
    });
  }

  /* ─── Vision commentary ─── */

  async ensureVisionCommentary(photo, lobbyId, { timeoutMs = 120000, guessedUploaderId = null } = {}) {
    const lobby = this.lobbies.get(lobbyId);
    const revision = this._visionRevisions.get(photo.id) || 0;

    return this._dedupedAsync(this.visionCommentaries, this._inflightVisions, photo.id, async () => {
      // GeoCLIP and preprocessing run before acquiring the vision slot so the
      // slot is not held while waiting on unrelated geo/disk work.
      const isDateMode = lobby?.settings?.gameType === 'date';
      const isUploaderMode = lobby?.settings?.gameType === 'uploader';
      const datePromptBounds = isDateMode ? this._datePromptBounds(lobby) : null;
      const datePrediction = isDateMode
        ? await this.ensureDatePrediction(photo, {
          timeoutMs,
          earliestDate: datePromptBounds?.start || '1900-01-01',
          latestDate: datePromptBounds?.end || todayUtcDate(),
        }).catch(err => { handleError(err, 'AI date prediction'); return null; })
        : null;
      const pred = isDateMode || isUploaderMode
        ? null
        : await this.ensurePrediction(photo, { timeoutMs: 15000 }).catch(err => { handleError(err, 'AI prediction'); return null; });

      // Look up the photo's actual location (what the AI will compare its guess against)
      let actualRegion = null, actualCountry = null;
      if (!isDateMode && !isUploaderMode && typeof photo.lat === 'number' && typeof photo.lon === 'number') {
        ({ region: actualRegion, country: actualCountry } = await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id).catch(err => {
          handleError(err, `actual-location lookup for photo ${photo.id}`);
          return {};
        }));
      }

      // Look up the AI's guessed location (where GeoCLIP thought the photo was taken)
      let guessedRegion = null, guessedCountry = null;
      if (pred) {
        ({ region: guessedRegion, country: guessedCountry } = await this.ensurePredictionLocation(pred.lat, pred.lon, photo.id).catch(err => {
          handleError(err, `predicted-location lookup for photo ${photo.id}`);
          return {};
        }));
      }

      const imageB64 = await this._ensurePreprocessed(photo);

      const release = await this._acquire('vision');
      try {
        const language = this._normalizeLanguage(lobby?.settings?.language);
        const effectiveGuessedDate = datePrediction?.date
          ? clampDateToRange(
            datePrediction.date,
            lobby.settings.dateTimelineStart,
            lobby.settings.dateTimelineEnd,
          ) || datePrediction.date
          : null;
        const actualUploader = lobby?.players.get(photo.uploaderId);
        const guessedUploader = lobby?.players.get(guessedUploaderId);
        const resp = isUploaderMode
          ? await queryVisionModelForUploaderCommentary(
            imageB64,
            actualUploader?.nickname || 'the actual uploader',
            guessedUploader?.nickname || 'a random player',
            timeoutMs,
            language,
          )
          : isDateMode
          ? await queryVisionModelForDateCommentary(
            imageB64, photo.captureDate, effectiveGuessedDate, timeoutMs, language
          )
          : await queryVisionModel(
            imageB64, actualRegion, actualCountry, guessedRegion, guessedCountry, timeoutMs, language
          );

        const commentary = resp?.commentary || '';
        if (!commentary) return null;
        if ((this._visionRevisions.get(photo.id) || 0) !== revision) return null;

        const entry = { commentary, timestamp: Date.now() };
        this.visionCommentaries.set(photo.id, entry);
        return entry;
      } finally {
        release();
        if ((this._visionRevisions.get(photo.id) || 0) === revision) {
          this._visionAttempted.add(photo.id);
        }
      }
    });
  }

  /* ─── Auto-naming (title + hint) ─── */

  async ensureImageTitleAndHint(photo, lobbyId, { timeoutMs = 120000 } = {}) {
    const lobby = this.lobbies.get(lobbyId);
    const revision = this._titleRevisions.get(photo.id) || 0;

    return this._dedupedAsync(this.imageTitles, this._inflightTitles, photo.id, async () => {
      // Location lookup and preprocessing run before acquiring the vision slot.
      let region = null, country = null;
      if (lobby?.settings?.gameType === 'spot'
        && typeof photo.lat === 'number' && typeof photo.lon === 'number'
        && !isNaN(photo.lat) && !isNaN(photo.lon)) {
        ({ region, country } = await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id).catch(err => {
          handleError(err, 'location lookup for title/hint'); return {};
        }));
      }

      const imageB64 = await this._ensurePreprocessed(photo);

      const release = await this._acquire('vision');
      try {
        const language = this._normalizeLanguage(lobby?.settings?.language);
        const resp = await queryVisionModelForTitleAndHint(
          imageB64,
          region,
          country,
          timeoutMs,
          language,
          lobby?.settings?.gameType,
          lobby?.settings?.gameType === 'date' ? photo.captureDate : null,
        );

        const title = resp?.title || '';
        const hint = resp?.hint || '';
        if (!title) return null;
        if ((this._titleRevisions.get(photo.id) || 0) !== revision) return null;

        const entry = { title, hint, timestamp: Date.now() };
        this.imageTitles.set(photo.id, entry);
        return entry;
      } finally {
        release();
      }
    });
  }

  async prefetchAutoNaming(photoId, photo, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby?.settings.autoNameImages) return;
    if (photo.title?.length > 0) return;
    if (this._isFresh(this.imageTitles.get(photoId))) return;
    if (this._inflightTitles.has(photoId)) return;
    if (this._autoNamingAttempted.has(photoId)) return;

    const revision = this._titleRevisions.get(photoId) || 0;
    try {
      const result = await this.ensureImageTitleAndHint(photo, lobbyId);
      if (result?.title) {
        photo.title = result.title;
        if (result.hint) photo.hint = result.hint;
        this.broadcastLobby(lobbyId);
        this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
      }
    } catch (err) {
      console.warn(`[auto-naming] Failed for photo ${photoId}:`, err.message);
    } finally {
      if ((this._titleRevisions.get(photoId) || 0) === revision) {
        this._autoNamingAttempted.add(photoId);
      }
    }

    this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
  }

  /* ─── AI prefetch pipeline ─── */

  async prefetchAIPrediction(photoId, photo, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) { console.warn(`Cannot prefetch AI prediction: Lobby ${lobbyId} not found`); return; }

    try {
      this._emitAIStatus(lobbyId);
      if (lobby.settings.gameType === 'date') {
        const bounds = this._datePromptBounds(lobby);
        if (!bounds) return;
        await this.ensureDatePrediction(photo, {
          earliestDate: bounds.start,
          latestDate: bounds.end,
        });
      }
      else if (lobby.settings.gameType === 'spot') await this.ensurePrediction(photo);
      if (!lobby.settings.visionCommentary) {
        this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
      }
    } catch (err) {
      console.warn(`AI prefetch failed for photo ${photoId}:`, err.message ?? err);
    }
  }

  async ensureDatePrediction(photo, {
    timeoutMs = 120000,
    earliestDate = '1900-01-01',
    latestDate = todayUtcDate(),
  } = {}) {
    const cached = this.datePredictions.get(photo.id);
    if (this._isFresh(cached)) {
      const clampedCachedDate = clampDateToRange(cached.date, earliestDate, latestDate);
      if (clampedCachedDate) {
        const rangeChanged = cached.earliestDate !== earliestDate || cached.latestDate !== latestDate;
        if (rangeChanged || clampedCachedDate !== cached.date) {
          console.log(
            `[vision] Reusing prefetched date for photo ${photo.id}: ${cached.date} -> ${clampedCachedDate} `
            + `(final range ${earliestDate}..${latestDate})`,
          );
        } else {
          console.log(
            `[vision] Date prediction cache hit for photo ${photo.id}: ${cached.date} `
            + `(range ${earliestDate}..${latestDate})`,
          );
        }
        const entry = {
          ...cached,
          date: clampedCachedDate,
          earliestDate,
          latestDate,
        };
        this.datePredictions.set(photo.id, entry);
        return entry;
      }
    }
    const inflightKey = `${photo.id}:${earliestDate}:${latestDate}`;
    if (this._inflightDates.has(inflightKey)) {
      console.log(
        `[vision] Awaiting in-flight date prediction for photo ${photo.id} `
        + `(range ${earliestDate}..${latestDate})`,
      );
      try {
        return await this._inflightDates.get(inflightKey);
      } catch (error) {
        console.warn(`[vision] In-flight date prediction failed for photo ${photo.id}:`, error?.message ?? error);
        return null;
      }
    }
    const revision = this._dateRevisions.get(photo.id) || 0;
    const promise = (async () => {
      const release = await this._acquire('vision');
      try {
        const imageB64 = await this._ensurePreprocessed(photo);
        if (!imageB64) {
          console.warn(`[vision] Date prediction skipped for photo ${photo.id}: image preprocessing returned no data`);
          return null;
        }
        console.log(
          `[vision] Requesting date prediction for photo ${photo.id} `
          + `(allowed range ${earliestDate}..${latestDate})`,
        );
        let date = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const response = await queryVisionModelForDate(
            imageB64,
            timeoutMs,
            earliestDate,
            latestDate,
          );
          date = normalizePhotoDate(response?.date);
          if (date || response?.requestFailed) break;
          console.warn(`[vision] Retrying invalid date prediction for photo ${photo.id} (${attempt}/2)`);
        }
        if (!date) {
          console.warn(
            `[vision] No valid date prediction for photo ${photo.id} within ${earliestDate}..${latestDate}`,
          );
          return null;
        }
        if ((this._dateRevisions.get(photo.id) || 0) !== revision) return null;
        const returnedDate = date;
        date = clampDateToRange(date, earliestDate, latestDate);
        if (!date) {
          console.warn(
            `[vision] Date prediction for photo ${photo.id} could not be clamped `
            + `(value ${returnedDate}, range ${earliestDate}..${latestDate})`,
          );
          return null;
        }
        if (date !== returnedDate) {
          console.warn(
            `[vision] Clamped date prediction for photo ${photo.id}: `
            + `${returnedDate} -> ${date} (range ${earliestDate}..${latestDate})`,
          );
        } else {
          console.log(
            `[vision] Accepted date prediction for photo ${photo.id}: ${date} `
            + `(range ${earliestDate}..${latestDate})`,
          );
        }
        const entry = { date, earliestDate, latestDate, timestamp: Date.now() };
        this.datePredictions.set(photo.id, entry);
        return entry;
      } finally {
        if ((this._dateRevisions.get(photo.id) || 0) === revision) {
          this._datePredictionAttempted.add(photo.id);
        }
        release();
      }
    })().finally(() => {
      if (this._inflightDates.get(inflightKey) === promise) this._inflightDates.delete(inflightKey);
    });
    this._inflightDates.set(inflightKey, promise);
    try {
      return await promise;
    } catch (error) {
      console.warn(`[vision] Date prediction failed for photo ${photo.id}:`, error?.message ?? error);
      return null;
    }
  }

  async prefetchLocation(photoId, photo) {
    try {
      if (typeof photo.lat === 'number' && typeof photo.lon === 'number') {
        await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id);
      }
      const pred = await this.ensurePrediction(photo, { timeoutMs: 15000 }).catch(err => { handleError(err, 'AI prediction'); return null; });
      if (pred) await this.ensurePredictionLocation(pred.lat, pred.lon, photo.id);
    } catch {
      // best-effort
    }
  }

  async prefetchVisionCommentary(photoId, photo, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) { console.warn(`Cannot prefetch vision commentary: Lobby ${lobbyId} not found`); return; }

    try {
      this._emitAIStatus(lobbyId);
      if (lobby.settings.gameType === 'uploader') {
        // The random AI vote is intentionally chosen only when the round starts,
        // so its commentary cannot be prefetched with a fabricated identity.
        this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
        return;
      } else if (lobby.settings.gameType === 'date') {
        const bounds = this._datePromptBounds(lobby);
        if (!bounds) {
          this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
          return;
        }
        await this.ensureDatePrediction(photo, {
          earliestDate: bounds.start,
          latestDate: bounds.end,
        });
      } else {
        await this.ensurePrediction(photo);
        await this.prefetchLocation(photoId, photo);
      }
      await this.ensureVisionCommentary(photo, lobbyId);
    } catch (err) {
      console.warn(`Vision commentary prefetch failed for photo ${photoId}:`, err.message ?? err);
    }
    this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
  }

  /* ─── AI status helpers ─── */

  _emitAIStatusIfNeeded(photoId) {
    const lobbyId = this._findLobbyIdForPhoto(photoId);
    if (lobbyId) this._emitAIStatus(lobbyId);
  }

  _emitAIStatus(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.settings.enableAIGuessing || lobby.settings.visionCommentary || lobby.settings.autoNameImages) {
      this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
    }
  }

  _findLobbyIdForPhoto(photoId) {
    for (const [lobbyId, lobby] of this.lobbies) {
      if (lobby.photos.some(p => p.id === photoId)) return lobbyId;
    }
    return null;
  }

  _markAINotReady(lobbyId) {
    const aiPlayer = this.lobbies.get(lobbyId)?.players.get(`ai-${lobbyId}`);
    if (aiPlayer) aiPlayer.ready = false;
  }

  /* ─── AI processing status ─── */

  getAIProcessingStatus(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return { processed: 0, total: 0, details: [], isReady: true, stage: 'idle' };

    const { enableAIGuessing, visionCommentary, autoNameImages } = lobby.settings;
    const aiPlayer = lobby.players.get(`ai-${lobbyId}`);

    if (!enableAIGuessing && !visionCommentary && !autoNameImages) {
      if (aiPlayer) aiPlayer.ready = true;
      return { processed: 0, total: 0, details: [], isReady: true, stage: 'disabled' };
    }

    const total = lobby.photos.length;
    if (total === 0) {
      if (aiPlayer) aiPlayer.ready = true;
      return { processed: 0, total: 0, details: [], isReady: true, stage: 'waiting_for_photos' };
    }

    const tasks = [];

    if (enableAIGuessing && lobby.settings.gameType !== 'uploader') {
      tasks.push({
        name: 'predictions',
        total,
        processed: lobby.photos.filter(p =>
          lobby.settings.gameType === 'date'
            ? this._isFresh(this.datePredictions.get(p.id))
              || this._datePredictionAttempted.has(p.id)
            : this._isFresh(this.predictions.get(p.id)) || this._predictionAttempted.has(p.id)
        ).length,
      });
    }

    if (visionCommentary && lobby.settings.gameType !== 'uploader') {
      tasks.push({
        name: 'commentary',
        total,
        processed: lobby.photos.filter(p =>
          this._isFresh(this.visionCommentaries.get(p.id))
          || this._visionAttempted.has(p.id)
        ).length,
      });
    }

    if (autoNameImages) {
      tasks.push({
        name: 'auto-naming',
        total,
        processed: lobby.photos.filter(p =>
          p.title?.length ||
          this._isFresh(this.imageTitles.get(p.id)) ||
          this._autoNamingAttempted.has(p.id)
        ).length,
      });
    }

    const allDone = tasks.every(t => t.processed >= t.total);
    const totalWork = tasks.reduce((sum, t) => sum + t.total, 0);
    const completedWork = tasks.reduce((sum, t) => sum + t.processed, 0);

    if (aiPlayer) aiPlayer.ready = allDone;
    if (allDone) this.broadcastLobby(lobbyId);

    const nextTask = tasks.find(t => t.processed < t.total)?.name || 'complete';

    return { processed: completedWork, total: totalWork, details: tasks, isReady: allDone, stage: nextTask };
  }
}
