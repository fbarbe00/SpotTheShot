import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { lookupLocation } from './geoclipClient.js';
import { preprocessImageBuffer, queryVisionModel, queryVisionModelForTitleAndHint } from './visionClient.js';
import { handleError, handleAIOperationError, mimeTypeForFile } from './gameHelpers.js';
import { isValidCoordinate } from './utils.js';

const GEOCLIP_URL = process.env.GEOCLIP_URL || 'http://geoclip:8000';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const FormDataClass = globalThis.FormData;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class AIPipeline {

  _initAIPipeline() {
    this.predictions = new Map();
    this.photoLocations = new Map();
    this.predictionLocations = new Map();
    this.visionCommentaries = new Map();
    this.imageTitles = new Map();

    this._inflightPredictions = new Map();
    this._inflightPhotoLocations = new Map();
    this._inflightPredictionLocations = new Map();
    this._inflightVisions = new Map();
    this._inflightTitles = new Map();
    this._preprocessedImages = new Map();

    this._predictionAttempted = new Set();
    this._visionAttempted = new Set();
    this._autoNamingAttempted = new Set();

    this.geoActive = 0;
    this.geoQueue = [];
    // Reduce concurrency for CPU-based AI processing (GeoCLIP runs on CPU)
    // Can be overridden via GEO_CONCURRENCY env var
    this.geoConcurrency = parseInt(process.env.GEO_CONCURRENCY || '2', 10);

    this.visionActive = 0;
    this.visionQueue = [];
    // Vision model runs sequentially to avoid memory issues on CPU
    // Can be overridden via VISION_CONCURRENCY env var
    this.visionConcurrency = parseInt(process.env.VISION_CONCURRENCY || '1', 10);
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

  _invalidateLocationCaches(photoId) {
    for (const cache of [
      this.photoLocations, this.predictionLocations,
      this._inflightPhotoLocations, this._inflightPredictionLocations,
    ]) {
      cache.delete(photoId);
    }
  }

  _normalizeLanguage(language) {
    const lang = String(language || '').toLowerCase();
    return ['en', 'fr', 'it', 'es', 'de', 'ru'].includes(lang) ? lang : 'en';
  }

  _aiNicknameForLanguage(language) {
    const lang = this._normalizeLanguage(language);
    return { en: 'AI Player', fr: 'Joueur IA', it: 'Giocatore IA', es: 'IA', de: 'KI-Spieler', ru: 'ИИ Игрок' }[lang] ?? 'AI Player';
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

    const promise = factory().finally(() => inflight.delete(key));
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

  async ensureVisionCommentary(photo, lobbyId, { timeoutMs = 120000 } = {}) {
    const lobby = this.lobbies.get(lobbyId);

    return this._dedupedAsync(this.visionCommentaries, this._inflightVisions, photo.id, async () => {
      // GeoCLIP and preprocessing run before acquiring the vision slot so the
      // slot is not held while waiting on unrelated geo/disk work.
      const pred = await this.ensurePrediction(photo, { timeoutMs: 15000 }).catch(err => { handleError(err, 'AI prediction'); return null; });

      // Look up the photo's actual location (what the AI will compare its guess against)
      let actualRegion = null, actualCountry = null;
      if (typeof photo.lat === 'number' && typeof photo.lon === 'number') {
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
        const resp = await queryVisionModel(imageB64, actualRegion, actualCountry, guessedRegion, guessedCountry, timeoutMs, language);

        const commentary = resp?.commentary || '';
        if (!commentary) return null;

        const entry = { commentary, timestamp: Date.now() };
        this.visionCommentaries.set(photo.id, entry);
        return entry;
      } finally {
        release();
        this._visionAttempted.add(photo.id);
      }
    });
  }

  /* ─── Auto-naming (title + hint) ─── */

  async ensureImageTitleAndHint(photo, lobbyId, { timeoutMs = 120000 } = {}) {
    const lobby = this.lobbies.get(lobbyId);

    return this._dedupedAsync(this.imageTitles, this._inflightTitles, photo.id, async () => {
      // Location lookup and preprocessing run before acquiring the vision slot.
      let region = null, country = null;
      if (typeof photo.lat === 'number' && typeof photo.lon === 'number' && !isNaN(photo.lat) && !isNaN(photo.lon)) {
        ({ region, country } = await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id).catch(err => {
          handleError(err, 'location lookup for title/hint'); return {};
        }));
      }

      const imageB64 = await this._ensurePreprocessed(photo);

      const release = await this._acquire('vision');
      try {
        const language = this._normalizeLanguage(lobby?.settings?.language);
        const resp = await queryVisionModelForTitleAndHint(imageB64, region, country, timeoutMs, language);

        const title = resp?.title || '';
        const hint = resp?.hint || '';
        if (!title) return null;

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
      this._autoNamingAttempted.add(photoId);
    }

    this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
  }

  /* ─── AI prefetch pipeline ─── */

  async prefetchAIPrediction(photoId, photo, lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) { console.warn(`Cannot prefetch AI prediction: Lobby ${lobbyId} not found`); return; }

    try {
      this._emitAIStatus(lobbyId);
      await this.ensurePrediction(photo);
      if (!lobby.settings.visionCommentary) {
        this.io.to(lobbyId).emit('ai_processing_status', this.getAIProcessingStatus(lobbyId));
      }
    } catch (err) {
      console.warn(`AI prefetch failed for photo ${photoId}:`, err.message ?? err);
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
      await this.ensurePrediction(photo);
      await this.prefetchLocation(photoId, photo);
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

    if (enableAIGuessing) {
      tasks.push({
        name: 'predictions',
        total,
        processed: lobby.photos.filter(p =>
          this._isFresh(this.predictions.get(p.id)) || this._predictionAttempted.has(p.id)
        ).length,
      });
    }

    if (visionCommentary) {
      tasks.push({
        name: 'commentary',
        total,
        processed: lobby.photos.filter(p =>
          this._isFresh(this.visionCommentaries.get(p.id)) || this._visionAttempted.has(p.id)
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
