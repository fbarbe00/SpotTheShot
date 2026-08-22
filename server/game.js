import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { clampDateToRange, computeDateRoundScore, computeRoundScore, computeUploaderRoundScore, deriveDateTimelineBounds, normalizePhotoDate, todayUtcDate } from './scoring.js';
import { aiTipCountForMode, buildDateChallengePlan, gameModeDefinition, normalizeGameType } from './gameModes.js';
import { isValidCoordinate } from './utils.js';
import { batchLookup } from './geoclipClient.js';
import { isoToFlag } from './countryFlags.js';
import { AIPipeline } from './aiPipeline.js';
import { findLobbyById, generateMemorableLobbyId, handleError } from './gameHelpers.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const VISION_INTER_PHOTO_DELAY_MS = parseInt(process.env.VISION_INTER_PHOTO_DELAY_MS || '500', 10);

export class GameManager extends AIPipeline {
  constructor(io, config = {}) {
    super();
    this.io = io;
    this.config = config;
    this.lobbies = new Map();
    this._initAIPipeline();
  }

  /* ─── Game statistics ─── */

  computeGameStatistics(lobby) {
    if (!lobby.roundStatistics?.length) return null;

    const playerStats = new Map();

    for (const player of lobby.players.values()) {
      if (player.isAI) continue;
      playerStats.set(player.id, {
        nickname: player.nickname,
        uploadedPhotos: [],
        guesses: [],
        totalDistance: 0,
        averageDistance: 0,
        bestGuess: null,
        worstGuess: null,
        mostGuessedCountry: new Map(),
      });
    }

    for (const round of lobby.roundStatistics) {
      const uploader = playerStats.get(round.photo.uploaderId);
      uploader?.uploadedPhotos.push({ country: round.photo.country, region: round.photo.region });

      for (const guess of round.guesses) {
        if (guess.playerId.startsWith('ai-')) continue;
        const player = playerStats.get(guess.playerId);
        if (!player) continue;

        player.guesses.push({
          distanceKm: guess.distanceKm,
          country: guess.country,
          targetCountry: round.photo.country,
          targetRegion: round.photo.region,
          isUploader: guess.isUploader,
        });
        player.totalDistance += guess.distanceKm;

        if (!player.bestGuess || guess.distanceKm < player.bestGuess.distanceKm) {
          player.bestGuess = { distanceKm: guess.distanceKm, targetCountry: round.photo.country, targetRegion: round.photo.region };
        }
        if (!player.worstGuess || guess.distanceKm > player.worstGuess.distanceKm) {
          player.worstGuess = { distanceKm: guess.distanceKm, targetCountry: round.photo.country, targetRegion: round.photo.region };
        }

        if (guess.country) {
          player.mostGuessedCountry.set(guess.country, (player.mostGuessedCountry.get(guess.country) || 0) + 1);
        }
      }
    }

    for (const stats of playerStats.values()) {
      if (stats.guesses.length) stats.averageDistance = stats.totalDistance / stats.guesses.length;

      let maxCount = 0, mostCountry = null;
      for (const [country, count] of stats.mostGuessedCountry) {
        if (count > maxCount) { maxCount = count; mostCountry = country; }
      }
      stats.mostGuessedCountryName = mostCountry;
      stats.mostGuessedCountryCount = maxCount;
    }

    return Array.from(playerStats.values());
  }

  /* ─── Lobby management ─── */

  async createLobby({ nickname, socketId, settings, constraints, clientSessionId = null }) {
    let lobbyId;
    let lobbyNameMetadata;
    let attempts = 0;

    do {
      const result = generateMemorableLobbyId();
      lobbyId = result.id;
      lobbyNameMetadata = result.metadata;
      if (!findLobbyById(this.lobbies, lobbyId)) break;
    } while (++attempts < 10);

    if (attempts >= 10) throw new Error('Failed to generate unique lobby ID after multiple attempts');

    const playerId = uuid();
    const sessionToken = uuid();
    const timerMode = settings?.timerMode || 'fixed';
    const roundDurationSec = timerMode === 'progressive'
      ? 0
      : (settings?.roundDurationSec ?? this.config.roundDurationSec ?? 30);
    const duelRaceTimeSec = settings?.duelRaceTimeSec ?? 15;
    const language = this._normalizeLanguage(settings?.language);

    const lobby = {
      id: lobbyId,
      nameMetadata: lobbyNameMetadata,
      createdAt: Date.now(),
      hostId: playerId,
      state: 'waiting',
      constraints,
      settings: {
        roundDurationSec,
        gameType: normalizeGameType(settings?.gameType),
        dateSubmode: ['exact', 'before_after', 'timeline'].includes(settings?.dateSubmode) ? settings.dateSubmode : 'exact',
        dateTimelineStart: null,
        dateTimelineEnd: todayUtcDate(),
        gameMode: settings?.gameMode || 'individual',
        timerMode,
        hintThresholdSec: settings?.hintThresholdSec || 15,
        enableAIGuessing: (settings?.enableAIGuessing ?? true) && constraints.allowAIGuessing,
        visionCommentary: (settings?.visionCommentary || false) && constraints.allowVisionCommentary,
        autoNameImages: (settings?.autoNameImages || false) && constraints.allowAutoNaming,
        showImageDate: normalizeGameType(settings?.gameType) !== 'date' ? (settings?.showImageDate || false) : false,
        requireReady: settings?.requireReady || false,
        uploaderPenaltyPercent: settings?.uploaderPenaltyPercent ?? 10,
        minPhotosPerPlayer: settings?.minPhotosPerPlayer ?? 0,
        maxPhotosPerPlayer: Math.min(settings?.maxPhotosPerPlayer ?? constraints.maxPhotosPerPlayer, constraints.maxPhotosPerPlayer),
        duelRaceTimeSec,
        language,
      },
      roundIndex: -1,
      roundOrder: [],
      dateChallengePlan: null,
      roundStartAt: null,
      roundDurationMs: (roundDurationSec + 1) * 1000,
      duelRaceTimeMs: (duelRaceTimeSec + 1) * 1000,
      players: new Map(),
      photos: [],
      guesses: new Map(),
      timers: {},
      isEndingRound: false,
      currentRoundPhoto: null,
      lastRoundResults: null,
      roundHistory: [],
      roundStatistics: [],
    };

    lobby.players.set(playerId, {
      id: playerId, sessionToken, nickname, score: 0, ready: false, color: null, socketId, team: null, wins: 0, clientSessionId,
    });

    this.lobbies.set(lobbyId, lobby);

    if (lobby.settings.enableAIGuessing) this.addAIPlayer(lobbyId);

    return { lobby, playerId, sessionToken };
  }

  _availableNickname(lobby, requested) {
    const base = String(requested || '').trim();
    const used = new Set([...lobby.players.values()].map(player => player.nickname.toLocaleLowerCase()));
    if (!used.has(base.toLocaleLowerCase())) return base;
    let suffix = 2;
    while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
    return `${base} ${suffix}`;
  }

  _assignPlayerToLeastPopulatedTeam(lobby, playerId) {
    const player = lobby.players.get(playerId);
    if (!player || player.team !== null) return;
    const counts = { 'Team 1': 0, 'Team 2': 0 };
    for (const p of lobby.players.values()) if (p.team) counts[p.team]++;
    player.team = counts['Team 1'] <= counts['Team 2'] ? 'Team 1' : 'Team 2';
    this.broadcastLobby(lobby.id);
  }

  updateSettings(lobbyId, newSettings) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.state !== 'waiting') throw new Error('Settings cannot be changed after the game starts');
    const s = lobby.settings;
    const previousLanguage = s.language;

    if (newSettings.timerMode === 'fixed' || newSettings.timerMode === 'progressive') {
      s.timerMode = newSettings.timerMode;
      if (s.timerMode === 'progressive') {
        s.roundDurationSec = 0;
        // The visible timer reaches zero at the configured duration while the
        // server keeps one final second for answers already in flight.
        lobby.roundDurationMs = 1000;
      }
    }

    if (typeof newSettings.roundDurationSec === 'number' && s.timerMode === 'fixed') {
      s.roundDurationSec = Math.max(5, newSettings.roundDurationSec);
      lobby.roundDurationMs = (s.roundDurationSec + 1) * 1000;
    }

    if (typeof newSettings.duelRaceTimeSec === 'number') {
      s.duelRaceTimeSec = Math.max(5, newSettings.duelRaceTimeSec);
      lobby.duelRaceTimeMs = (s.duelRaceTimeSec + 1) * 1000;
    }

    if (newSettings.gameMode === 'individual' || newSettings.gameMode === 'teams') {
      s.gameMode = newSettings.gameMode;
    }
    if (newSettings.gameType && normalizeGameType(newSettings.gameType) === newSettings.gameType) {
      const changedGameType = s.gameType !== newSettings.gameType;
      s.gameType = newSettings.gameType;
      if (s.gameType === 'date') s.showImageDate = false;
      if (changedGameType) {
        // Date bounds belong to one concrete round order and are regenerated
        // from the current photo collection only when a Date game starts.
        s.dateTimelineStart = null;
        s.dateTimelineEnd = todayUtcDate();
        for (const player of lobby.players.values()) {
          if (!player.isAI) player.ready = false;
        }
        this._markAINotReady(lobbyId);
        for (const photo of lobby.photos) {
          this._invalidateModeDependentCaches(photo);
          if (s.visionCommentary) {
            this.prefetchVisionCommentary(photo.id, photo, lobbyId)
              .catch(err => handleError(err, 'AI mode-change commentary'));
          } else if (s.enableAIGuessing) {
            this.prefetchAIPrediction(photo.id, photo, lobbyId)
              .catch(err => handleError(err, 'AI mode-change prefetch'));
          }
          if (s.autoNameImages) this.prefetchAutoNaming(photo.id, photo, lobbyId);
        }
      }
    }
    if (['exact', 'before_after', 'timeline'].includes(newSettings.dateSubmode)) {
      s.dateSubmode = newSettings.dateSubmode;
    }
    if (newSettings.gameMode === 'teams') {
      for (const player of lobby.players.values()) {
        this._assignPlayerToLeastPopulatedTeam(lobby, player.id);
      }
    }

    if (typeof newSettings.hintThresholdSec === 'number') s.hintThresholdSec = newSettings.hintThresholdSec;
    if (typeof newSettings.uploaderPenaltyPercent === 'number') {
      s.uploaderPenaltyPercent = Math.max(0, Math.min(100, newSettings.uploaderPenaltyPercent));
    }
    if (typeof newSettings.minPhotosPerPlayer === 'number') s.minPhotosPerPlayer = Math.max(0, newSettings.minPhotosPerPlayer);
    if (typeof newSettings.maxPhotosPerPlayer === 'number') {
      s.maxPhotosPerPlayer = Math.max(1, Math.min(newSettings.maxPhotosPerPlayer, lobby.constraints.maxPhotosPerPlayer));
    }

    if (typeof newSettings.language === 'string') {
      const language = this._normalizeLanguage(newSettings.language);
      s.language = language;
      const aiPlayer = lobby.players.get(`ai-${lobbyId}`);
      if (aiPlayer) aiPlayer.nickname = this._aiNicknameForLanguage(s.language);
    }

    if (typeof newSettings.enableAIGuessing === 'boolean') {
      const wasEnabled = s.enableAIGuessing;
      s.enableAIGuessing = newSettings.enableAIGuessing && lobby.constraints.allowAIGuessing;

      if (newSettings.enableAIGuessing && !this.hasAIPlayer(lobbyId)) this.addAIPlayer(lobbyId);
      if (!newSettings.enableAIGuessing && this.hasAIPlayer(lobbyId)) this.removeAIPlayer(lobbyId);

      if (!wasEnabled && newSettings.enableAIGuessing && lobby.photos.length > 0) {
        this._markAINotReady(lobbyId);
        for (const photo of lobby.photos) {
          this.prefetchAIPrediction(photo.id, photo, lobbyId)
            .then(() => s.gameType === 'spot' ? this.prefetchLocation(photo.id, photo) : undefined)
            .catch(err => handleError(err, 'AI prefetch'));
        }
      }
    }

    if (typeof newSettings.visionCommentary === 'boolean') {
      const wasEnabled = s.visionCommentary;
      s.visionCommentary = newSettings.visionCommentary && lobby.constraints.allowVisionCommentary;

      if (!wasEnabled && newSettings.visionCommentary && lobby.photos.length > 0) {
        this._markAINotReady(lobbyId);
        const processSequentially = async () => {
          for (const photo of lobby.photos) {
            if (!this.visionCommentaries.has(photo.id)) {
              try {
                await this.prefetchAIPrediction(photo.id, photo, lobbyId);
                if (s.gameType === 'spot') await this.prefetchLocation(photo.id, photo);
                await this.prefetchVisionCommentary(photo.id, photo, lobbyId);
              } catch (err) {
                handleError(err, 'vision prefetch');
              }
              await new Promise(resolve => setTimeout(resolve, VISION_INTER_PHOTO_DELAY_MS));
            }
          }
        };
        processSequentially().catch(err => handleError(err, 'vision prefetch sequence'));
      }
    }

    if (typeof newSettings.autoNameImages === 'boolean') {
      s.autoNameImages = newSettings.autoNameImages && lobby.constraints.allowAutoNaming;
      if (newSettings.autoNameImages && lobby.photos.length > 0) {
        this._startAutoNamingPipeline(lobbyId, lobby);
      }
    }

    if (typeof newSettings.showImageDate === 'boolean') {
      s.showImageDate = s.gameType !== 'date' ? newSettings.showImageDate : false;
    }
    if (typeof newSettings.requireReady === 'boolean') s.requireReady = newSettings.requireReady;

    // Map settings — if allowAllMaps is false, only osm is permitted
    if (['osm', 'hot', 'cyclosm', 'opnvkarte', 'dark', 'light', 'satellite', 'terrain'].includes(newSettings.mapStyle)) {
      s.mapStyle = lobby.constraints.allowAllMaps ? newSettings.mapStyle : 'osm';
    }
    // Only these languages have working tile servers for OSM style
    if (['en', 'fr', 'de', 'local'].includes(newSettings.mapLanguage)) {
      s.mapLanguage = newSettings.mapLanguage;
    }

    if (s.language !== previousLanguage) {
      this._markAINotReady(lobbyId);
      for (const photo of lobby.photos) {
        this._invalidateModeDependentCaches(photo);
        if (s.visionCommentary) {
          this.prefetchVisionCommentary(photo.id, photo, lobbyId)
            .catch(err => handleError(err, 'AI language-change commentary'));
        } else if (s.enableAIGuessing) {
          this.prefetchAIPrediction(photo.id, photo, lobbyId)
            .catch(err => handleError(err, 'AI language-change prefetch'));
        }
        if (s.autoNameImages) this.prefetchAutoNaming(photo.id, photo, lobbyId);
      }
    }

    this.broadcastLobby(lobbyId);
  }

  async _startAutoNamingPipeline(lobbyId, lobby) {
    this._markAINotReady(lobbyId);
    this.broadcastLobby(lobbyId);

    const untitled = lobby.photos.filter(p => !p.title && !this.imageTitles.has(p.id));
    if (untitled.length === 0) {
      this.getAIProcessingStatus(lobbyId);
      return;
    }

    if (lobby.settings.enableAIGuessing && lobby.settings.gameType === 'spot') {
      const missingPredictions = lobby.photos.filter(p => !this._isFresh(this.predictions.get(p.id)));
      await Promise.all(
        missingPredictions.map(p =>
          this.ensurePrediction(p).catch(err => console.warn(`[AI] Prediction failed for ${p.id}:`, err.message))
        )
      );
    }

    for (const photo of untitled) {
      await this.prefetchAutoNaming(photo.id, photo, lobbyId).catch(err => handleError(err, 'auto-name prefetch'));
      await new Promise(resolve => setTimeout(resolve, VISION_INTER_PHOTO_DELAY_MS));
    }

    this.getAIProcessingStatus(lobbyId);
  }

  async kickPlayer(lobbyId, playerIdToKick) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const playerToKick = lobby.players.get(playerIdToKick);
    if (!playerToKick || playerIdToKick === lobby.hostId) return;
    const socket = this.io.sockets.sockets.get(playerToKick.socketId);
    if (socket) { socket.emit('kicked'); socket.disconnect(true); }
    await this._removePlayerPhotos(lobby, playerIdToKick);
    lobby.players.delete(playerIdToKick);
    this.broadcastLobby(lobbyId);
  }

  joinLobby({ lobbyId, nickname, socketId, clientSessionId = null }) {
    const lobby = findLobbyById(this.lobbies, lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (lobby.state !== 'waiting') throw new Error('Game already started');
    const humanCount = [...lobby.players.values()].filter(p => !p.id.startsWith('ai-')).length;
    if (humanCount >= lobby.constraints.maxPlayersPerLobby) {
      throw new Error(`Lobby is full (max ${lobby.constraints.maxPlayersPerLobby} players)`);
    }
    const playerId = uuid();
    const sessionToken = uuid();
    const uniqueNickname = this._availableNickname(lobby, nickname);
    lobby.players.set(playerId, {
      id: playerId, sessionToken, nickname: uniqueNickname, score: 0, ready: false, color: null, socketId, team: null, wins: 0, clientSessionId,
    });
    if (lobby.settings.gameMode === 'teams') this._assignPlayerToLeastPopulatedTeam(lobby, playerId);
    return { lobby, playerId, sessionToken };
  }

  setPlayerColor(lobby, playerId, color) {
    const p = lobby.players.get(playerId);
    if (p) p.color = color;
  }

  setPlayerIcon(lobby, playerId, icon) {
    const p = lobby.players.get(playerId);
    if (p) p.icon = icon;
  }

  upsertPhoto(lobbyId, photo) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (lobby.state !== 'waiting') throw new Error('Photos are locked after the game starts');

    const playerPhotoCount = lobby.photos.filter(p => p.uploaderId === photo.uploaderId).length;
    if (playerPhotoCount >= lobby.settings.maxPhotosPerPlayer) {
      throw new Error(`Max photos per player (${lobby.settings.maxPhotosPerPlayer}) reached`);
    }

    lobby.photos.push(photo);

    if (lobby.settings.enableAIGuessing || lobby.settings.visionCommentary || lobby.settings.autoNameImages) {
      this._markAINotReady(lobbyId);
    }

    if (lobby.settings.visionCommentary) {
      this.prefetchVisionCommentary(photo.id, photo, lobbyId).catch(() => { });
    } else if (lobby.settings.enableAIGuessing) {
      this.prefetchAIPrediction(photo.id, photo, lobbyId)
        .then(() => lobby.settings.gameType === 'spot' ? this.prefetchLocation(photo.id, photo) : undefined)
        .catch(() => { });
    }

    if (lobby.settings.autoNameImages && !photo.title?.length) {
      this.prefetchAutoNaming(photo.id, photo, lobbyId);
    }

    this.broadcastLobby(lobbyId);
  }

  updatePhotoDate(lobbyId, playerId, photoId, captureDate) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (lobby.state !== 'waiting') throw new Error('Photo dates are locked after the game starts');
    const photo = lobby.photos.find(p => p.id === photoId && p.uploaderId === playerId);
    if (!photo) throw new Error('Photo not found');
    const normalized = normalizePhotoDate(captureDate);
    if (!normalized) throw new Error('Use a valid date in YYYY-MM-DD format');
    if (normalized > todayUtcDate()) throw new Error('Photo date cannot be in the future');
    photo.captureDate = normalized;
    this._invalidateModeDependentCaches(photo);
    for (const candidate of lobby.photos) {
      this._invalidateDatePrediction(candidate.id);
      if (candidate.id !== photo.id) this._invalidateVisionCommentary(candidate.id);
    }
    if (lobby.settings.gameType === 'date'
      && (lobby.settings.enableAIGuessing || lobby.settings.visionCommentary)) {
      this._markAINotReady(lobbyId);
      for (const candidate of lobby.photos) {
        const prefetch = lobby.settings.visionCommentary
          ? this.prefetchVisionCommentary(candidate.id, candidate, lobbyId)
          : this.prefetchAIPrediction(candidate.id, candidate, lobbyId);
        prefetch.catch(err => handleError(err, 'AI photo-date prediction refresh'));
      }
    }
    if (lobby.settings.autoNameImages) {
      this.prefetchAutoNaming(photo.id, photo, lobbyId)
        .catch(err => handleError(err, 'AI photo-date title refresh'));
    }
    this.broadcastLobby(lobbyId);
    return normalized;
  }

  async deletePhoto(lobbyId, playerId, photoId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.state !== 'waiting') return;
    const idx = lobby.photos.findIndex(p => p.id === photoId);
    if (idx === -1) return;
    const photo = lobby.photos[idx];
    if (photo.uploaderId !== playerId) return;

    await fs.unlink(path.join(UPLOADS_DIR, path.basename(photo.url))).catch(err => handleError(err, 'file cleanup'));
    this._invalidatePhotoCaches(photoId);
    lobby.photos.splice(idx, 1);

    if (lobby.settings.enableAIGuessing || lobby.settings.visionCommentary || lobby.settings.autoNameImages) {
      this.getAIProcessingStatus(lobbyId);
    }

    this.broadcastLobby(lobbyId);
  }

  setReady(lobbyId, playerId, ready) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const p = lobby.players.get(playerId);
    if (!p) throw new Error('Player not found');
    if (lobby.state !== 'waiting') throw new Error('Ready state is locked after the game starts');
    p.ready = ready;
    this.broadcastLobby(lobbyId);
  }

  startGame(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (lobby.state !== 'waiting') throw new Error('Game already started');
    if (lobby.photos.length === 0) throw new Error('No photos uploaded');

    const humanPlayers = [...lobby.players.values()]
      .filter(p => !p.isAI && !String(p.id).startsWith('ai-'));
    if (lobby.settings.gameType === 'uploader' && humanPlayers.length < 3) {
      throw new Error('WhoTookTheShot requires at least 3 players');
    }

    const realPlayers = [...lobby.players.values()].filter(p => p.socketId !== null && !p.isAI);
    if (lobby.settings.requireReady) {
      const notReady = realPlayers.find(player => !player.ready);
      if (notReady) throw new Error(`${notReady.nickname} is not ready`);
    }
    for (const player of realPlayers) {
      const count = lobby.photos.filter(p => p.uploaderId === player.id).length;
      if (count < lobby.settings.minPhotosPerPlayer) {
        throw new Error(`${player.nickname} must upload at least ${lobby.settings.minPhotosPerPlayer} photo(s)`);
      }
    }

    const mode = gameModeDefinition(lobby.settings.gameType);
    const eligiblePhotos = mode.requiresDate
      ? lobby.photos.filter(p => normalizePhotoDate(p.captureDate) && p.captureDate <= todayUtcDate())
      : mode.requiresLocation
        ? lobby.photos.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number')
        : [...lobby.photos];
    if (eligiblePhotos.length === 0) {
      throw new Error(mode.requiresDate
        ? 'No photos with a valid capture date available'
        : mode.requiresLocation
          ? 'No photos with location data available'
          : 'No photos available');
    }
    if (lobby.settings.gameType === 'date' && eligiblePhotos.length !== lobby.photos.length) {
      throw new Error('Every photo needs a valid date before DateTheShot can start');
    }
    if (mode.requiresDate) {
      const bounds = deriveDateTimelineBounds(eligiblePhotos.map(photo => photo.captureDate));
      lobby.settings.dateTimelineStart = bounds.start;
      lobby.settings.dateTimelineEnd = bounds.end;
      for (const photo of eligiblePhotos) {
        this._invalidateVisionCommentary(photo.id);
      }
      if (lobby.settings.dateSubmode === 'before_after'
        && !eligiblePhotos.some((photo, index) => eligiblePhotos.some((other, otherIndex) => index !== otherIndex && photo.captureDate !== other.captureDate))) {
        throw new Error('Before or After needs at least two photos with different dates');
      }
      if (lobby.settings.dateSubmode === 'timeline'
        && new Set(eligiblePhotos.map(photo => photo.captureDate)).size < 3) {
        throw new Error('Timeline Builder needs photos from at least three different dates');
      }
    }

    lobby.dateChallengePlan = null;
    if (lobby.settings.gameType === 'date' && lobby.settings.dateSubmode !== 'exact') {
      lobby.dateChallengePlan = buildDateChallengePlan(lobby.settings.dateSubmode, eligiblePhotos);
      lobby.roundOrder = lobby.dateChallengePlan.map(round => round.currentPhoto.id);
    } else {
      lobby.roundOrder = eligiblePhotos.map(p => p.id);
      for (let i = lobby.roundOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lobby.roundOrder[i], lobby.roundOrder[j]] = [lobby.roundOrder[j], lobby.roundOrder[i]];
      }
    }

    lobby.state = 'in_round';
    lobby.roundIndex = -1;
    lobby.gameId = uuid();
    lobby.gameStartTime = Date.now();
    lobby.roundStatistics = [];
    lobby.roundHistory = [];
    this.broadcastLobby(lobbyId);
    this.nextRound(lobbyId);
  }

  currentPhoto(lobby) {
    const id = lobby.roundOrder[lobby.roundIndex];
    return lobby.photos.find(p => p.id === id);
  }

  async nextRound(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return false;
    // The first transition is started internally by startGame. Every later
    // transition must originate from the results screen. This makes repeated
    // acknowledgements and double-clicks harmless.
    if (lobby.roundIndex >= 0 && lobby.state !== 'showing_results') return false;
    if (lobby.roundAdvanceInProgress) return false;
    lobby.roundAdvanceInProgress = true;
    try {

      lobby.roundIndex += 1;
    lobby.guesses = new Map();
    lobby.firstGuessAt = null;
    lobby.isEndingRound = false;
    lobby.lastRoundResults = null;
    lobby.roundToken = uuid();

    if (lobby.roundIndex >= lobby.roundOrder.length) {
      this._finishGame(lobbyId, lobby);
      lobby.roundAdvanceInProgress = false;
      return true;
    }

    lobby.state = 'in_round';
    lobby.roundStartAt = Date.now();
    const photo = this.currentPhoto(lobby);
    if (!photo) {
      this._finishGame(lobbyId, lobby);
      lobby.roundAdvanceInProgress = false;
      return true;
    }

    const mode = gameModeDefinition(lobby.settings.gameType);
    lobby.currentDateChallenge = null;
    if (lobby.settings.gameType === 'date' && lobby.settings.dateSubmode !== 'exact') {
      lobby.currentDateChallenge = lobby.dateChallengePlan?.[lobby.roundIndex]?.challenge || null;
    }
    if (lobby.settings.gameType === 'date' && lobby.settings.dateSubmode !== 'exact' && !lobby.currentDateChallenge) {
      throw new Error(`Unable to build ${lobby.settings.dateSubmode} challenge for this round`);
    }
    lobby.currentRoundPhoto = {
      id: mode.hidesUploaderDuringRound ? lobby.roundToken : photo.id,
      url: photo.url,
      uploaderId: mode.hidesUploaderDuringRound ? undefined : photo.uploaderId,
      title: photo.title || '', hint: photo.hint || '',
      captureDate: mode.requiresDate ? undefined : photo.captureDate,
      // The reference's captureDate is deliberately not sent: players must
      // judge Before or After from the two images, not read the answer.
      // uploaderId is public in date games (it is already serialized for every
      // lobby photo) and lets clients mirror the server's penalty rule.
      dateReference: lobby.currentDateChallenge?.kind === 'before_after' ? {
        id: lobby.currentDateChallenge.reference.id,
        url: lobby.currentDateChallenge.reference.url,
        uploaderId: lobby.currentDateChallenge.reference.uploaderId,
      } : undefined,
      timelinePhotos: lobby.currentDateChallenge?.kind === 'timeline'
        ? lobby.currentDateChallenge.photos.map(item => ({ id: item.id, url: item.url }))
        : undefined,
    };

    lobby.aiTipIndex = lobby.settings.enableAIGuessing
      && Math.random() < 0.6
      ? Math.floor(Math.random() * aiTipCountForMode(lobby.settings.gameType, lobby.settings.dateSubmode))
      : null;

    this.io.to(lobbyId).emit('round_start', {
      roundIndex: lobby.roundIndex,
      totalRounds: lobby.roundOrder.length,
      photo: lobby.currentRoundPhoto,
      // Never expose the transport grace second as playable countdown time.
      roundDurationMs: lobby.settings.timerMode === 'fixed' ? lobby.settings.roundDurationSec * 1000 : 0,
      roundStartAt: lobby.roundStartAt,
      aiTipIndex: lobby.aiTipIndex,
    });

    if (lobby.settings.enableAIGuessing) {
      const task = mode.guessKind === 'date'
        ? this.queryDateVision(lobbyId, photo, lobby.roundToken)
        : mode.guessKind === 'player'
          ? this.queryRandomUploader(lobbyId, photo, lobby.roundToken)
          : this.queryGeoCLIP(lobbyId, photo, lobby.roundToken);
      const trackedTask = task.catch(err => handleError(err, 'AI guess query'));
      const trackedRoundToken = lobby.roundToken;
      lobby.aiGuessTask = { roundToken: trackedRoundToken, promise: trackedTask };
      trackedTask.finally(() => {
        if (lobby.aiGuessTask?.roundToken === trackedRoundToken) lobby.aiGuessTask = null;
      });
    }

    clearTimeout(lobby.timers.roundEnd);
    clearInterval(lobby.timers.ticker);

    const isProgressiveNoTimer = lobby.settings.timerMode === 'progressive' && lobby.settings.roundDurationSec === 0;
    if (!isProgressiveNoTimer) {
      lobby.timers.roundEnd = setTimeout(() => this.endRound(lobbyId), lobby.roundDurationMs);
    } else {
      // Safety net: even unlimited-duel rounds end after 24 h to prevent stuck state
      lobby.timers.roundEnd = setTimeout(() => this.endRound(lobbyId), 24 * 60 * 60 * 1000);
    }

    lobby.timers.ticker = setInterval(() => {
      let remaining, timerStarted = true;
      if (lobby.settings.timerMode === 'progressive') {
        if (lobby.firstGuessAt) {
          remaining = Math.max(0, lobby.settings.duelRaceTimeSec * 1000 - (Date.now() - lobby.firstGuessAt));
        } else {
          remaining = 0; timerStarted = false;
        }
      } else {
        remaining = Math.max(0, lobby.settings.roundDurationSec * 1000 - (Date.now() - lobby.roundStartAt));
      }
      this.io.to(lobbyId).emit('timer', { remainingMs: remaining, timerStarted });
    }, 1000);

    this.broadcastLobby(lobbyId);
      return true;
    } finally {
      lobby.roundAdvanceInProgress = false;
    }
  }

  _finishGame(lobbyId, lobby) {
    lobby.state = 'finished';
    lobby.currentRoundPhoto = null;
    lobby.currentDateChallenge = null;
    for (const player of lobby.players.values()) {
      if (!player.socketId) continue;
      this.io.sockets.sockets.get(player.socketId)?.emit('game_finished', this.serializeLobby(lobby, player.id));
    }

    this._cleanupPhotos(lobby).catch(error => handleError(error, 'finished game photo cleanup'));

    if (typeof this.config?.onGameFinished === 'function') {
      try {
        this.config.onGameFinished({
          lobbyId: lobby.id,
          finishedAt: new Date().toISOString(),
          playerCount: lobby.players.size,
          humanPlayerCount: [...lobby.players.values()].filter(p => !p.isAI && !String(p.id).startsWith('ai-')).length,
          totalRounds: lobby.roundOrder.length,
          settings: {
            gameType: lobby.settings.gameType,
            gameMode: lobby.settings.gameMode,
            timerMode: lobby.settings.timerMode,
            roundDurationSec: lobby.settings.roundDurationSec,
            duelRaceTimeSec: lobby.settings.duelRaceTimeSec,
            hintThresholdSec: lobby.settings.hintThresholdSec,
            enableAIGuessing: !!lobby.settings.enableAIGuessing,
          },
        });
      } catch (error) {
        console.error('Failed to record game stats:', error?.message ?? error);
      }
    }
  }

  submitGuess(lobbyId, playerId, guess) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return { accepted: false, error: 'Lobby not found' };
    if (lobby.state !== 'in_round') {
      if (lobby.state === 'showing_results' && lobby.guesses.has(playerId)) {
        return { accepted: true, duplicate: true };
      }
      return { accepted: false, error: 'Round is no longer accepting guesses' };
    }
    const photo = this.currentPhoto(lobby);
    if (!photo) return { accepted: false, error: 'Round photo not found' };
    if (!lobby.players.has(playerId)) return { accepted: false, error: 'Player not found' };
    const mode = gameModeDefinition(lobby.settings.gameType);
    if (mode.guessKind === 'date') {
      const submode = lobby.settings.dateSubmode || 'exact';
      if (submode === 'before_after') {
        // The AI derives its choice from two independent image estimates in
        // queryDateVision; real capture dates must never reach this branch.
        const choice = guess?.dateChoice;
        if (!['before', 'after'].includes(choice)) return { accepted: false, error: 'Choose before or after' };
        guess = { dateChoice: choice };
      } else if (submode === 'timeline') {
        const photoOrder = guess?.photoOrder;
        const expected = lobby.currentDateChallenge?.answer || [];
        if (!Array.isArray(photoOrder) || photoOrder.length !== expected.length
          || new Set(photoOrder).size !== expected.length || photoOrder.some(id => !expected.includes(id))) {
          return { accepted: false, error: 'Submit every timeline photo exactly once' };
        }
        guess = { photoOrder };
      } else {
        const guessDate = normalizePhotoDate(guess?.date);
        if (!guessDate || guessDate > (lobby.settings.dateTimelineEnd || todayUtcDate()) || guessDate < lobby.settings.dateTimelineStart) {
          return { accepted: false, error: 'Guess date is outside the lobby timeline' };
        }
        guess = { date: guessDate };
      }
    } else if (mode.guessKind === 'player') {
      const guessedPlayer = lobby.players.get(guess?.uploaderId);
      if (!guessedPlayer || guessedPlayer.isAI || String(guessedPlayer.id).startsWith('ai-')) {
        return { accepted: false, error: 'Invalid player vote' };
      }
      guess = { uploaderId: guessedPlayer.id };
    } else if (!isValidCoordinate(guess?.lat, guess?.lon)) {
      return { accepted: false, error: 'Invalid guess location' };
    }

    // Submission is idempotent: retries caused by a lost acknowledgement must
    // not overwrite the original guess or restart progressive timers.
    if (lobby.guesses.has(playerId)) return { accepted: true, duplicate: true };

    const isAI = playerId.startsWith('ai-');
    const now = Date.now();
    lobby.guesses.set(playerId, { ...guess, timeTakenMs: now - lobby.roundStartAt });

    if (!isAI && lobby.settings.timerMode === 'progressive' && !lobby.firstGuessAt) {
      lobby.firstGuessAt = now;
      clearTimeout(lobby.timers.roundEnd);
      lobby.timers.roundEnd = setTimeout(() => this.endRound(lobbyId), lobby.duelRaceTimeMs);
    }

    const realPlayers = [...lobby.players.values()].filter(
      p => !p.isAI && (p.socketId !== null || p.disconnectTimeoutId != null)
    );
    if (realPlayers.length > 0 && realPlayers.every(p => lobby.guesses.has(p.id))) {
      this.endRound(lobbyId);
    }

    this.io.to(lobbyId).emit('guess_update', {
      guessesCount: lobby.guesses.size,
      totalPlayers: realPlayers.length,
    });

    const player = lobby.players.get(playerId);
    if (player && !player.isAI) {
      this.io.to(lobbyId).emit('player_guess', { playerId, nickname: player.icon + player.nickname });
    }
    return { accepted: true, duplicate: false };
  }

  _scoreDateChallenge(lobby, guess, photo, isUploader, playerId) {
    const challenge = lobby.currentDateChallenge;
    let base;
    let correct;
    if (challenge?.kind === 'before_after') {
      correct = guess.dateChoice === challenge.answer;
      base = correct ? 5000 : 0;
      // Knowing your own photo's date only decides the round when the same
      // player also uploaded the reference. Otherwise there is no
      // self-guessing advantage to tax.
      const bothPhotosFromUploader = isUploader && challenge.reference?.uploaderId === playerId;
      const multiplier = bothPhotosFromUploader ? 1 - (lobby.settings.uploaderPenaltyPercent ?? 10) / 100 : 1;
      return { correct, base, total: Math.round(base * multiplier) };
    } else if (challenge?.kind === 'timeline') {
      const position = new Map((guess.photoOrder || []).map((id, index) => [id, index]));
      let correctPairs = 0;
      let totalPairs = 0;
      for (let i = 0; i < challenge.answer.length; i++) {
        for (let j = i + 1; j < challenge.answer.length; j++) {
          totalPairs++;
          if (position.get(challenge.answer[i]) < position.get(challenge.answer[j])) correctPairs++;
        }
      }
      correct = correctPairs === totalPairs;
      base = totalPairs ? Math.round(5000 * correctPairs / totalPairs) : 0;
      const multiplier = isUploader ? 1 - (lobby.settings.uploaderPenaltyPercent ?? 10) / 100 : 1;
      return { correct, base, total: Math.round(base * multiplier) };
    } else {
      return computeDateRoundScore({
        guessDate: guess.date, targetDate: photo.captureDate, isUploader, settings: lobby.settings,
      });
    }
  }

  async endRound(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.state !== 'in_round' || lobby.isEndingRound) return;
    lobby.isEndingRound = true;
    const roundToken = lobby.roundToken;

    clearTimeout(lobby.timers.roundEnd);
    clearInterval(lobby.timers.ticker);

    const aiPlayerId = `ai-${lobbyId}`;
    const pendingAI = lobby.aiGuessTask?.roundToken === lobby.roundToken
      ? lobby.aiGuessTask.promise
      : null;
    if (lobby.settings.enableAIGuessing && !lobby.guesses.has(aiPlayerId) && pendingAI) {
      const graceMs = Math.min(2000, lobby.roundDurationMs * 0.05);
      console.log(
        `[ai] Waiting up to ${graceMs}ms for ${lobby.settings.gameType} guess `
        + `(lobby ${lobbyId}, round ${lobby.roundIndex + 1})`,
      );
      let graceTimer;
      const outcome = await Promise.race([
        pendingAI.then(() => 'completed'),
        new Promise(resolve => {
          graceTimer = setTimeout(() => resolve('timed out'), graceMs);
        }),
      ]);
      clearTimeout(graceTimer);
      console.log(
        `[ai] Pending ${lobby.settings.gameType} guess ${outcome}; `
        + `accepted=${lobby.guesses.has(aiPlayerId)} `
        + `(lobby ${lobbyId}, round ${lobby.roundIndex + 1})`,
      );
    }
    if ((lobby.settings.gameType === 'date' || lobby.settings.gameType === 'uploader')
      && lobby.settings.visionCommentary
      && lobby.guesses.has(aiPlayerId)
      && !this.visionCommentaries.has(this.currentPhoto(lobby)?.id)) {
      const commentaryPhoto = this.currentPhoto(lobby);
      if (commentaryPhoto) {
        await Promise.race([
          this.ensureVisionCommentary(commentaryPhoto, lobbyId, {
            guessedUploaderId: lobby.settings.gameType === 'uploader'
              ? lobby.guesses.get(aiPlayerId)?.uploaderId
              : undefined,
          }),
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);
      }
    }

    // While we were waiting, the round may have been advanced or finished by
    // another path (for example _removePlayerPhotos when the uploader left).
    // Never resurrect such a round: it would score the wrong photo and could
    // revert a finished lobby back to showing_results.
    if (this.lobbies.get(lobbyId) !== lobby || lobby.roundToken !== roundToken || lobby.state !== 'in_round') {
      // Only clear our own flag: a newer round may already be ending itself.
      if (lobby.roundToken === roundToken) lobby.isEndingRound = false;
      return;
    }

    lobby.state = 'showing_results';
    const photo = this.currentPhoto(lobby);
    if (!photo) {
      // Defensive: an inconsistent round order must not crash scoring.
      lobby.isEndingRound = false;
      return;
    }
    const mode = gameModeDefinition(lobby.settings.gameType);
    const results = [];

    for (const p of lobby.players.values()) {
      const g = lobby.guesses.get(p.id);
      if (!g) continue;
      const isUploader = p.id === photo.uploaderId;
      const score = lobby.settings.gameType === 'date'
        ? this._scoreDateChallenge(lobby, g, photo, isUploader, p.id)
        : lobby.settings.gameType === 'uploader'
          ? computeUploaderRoundScore({
            guessedUploaderId: g.uploaderId, targetUploaderId: photo.uploaderId, isUploader, settings: lobby.settings,
          })
        : computeRoundScore({
          guess: g, target: { lat: photo.lat, lon: photo.lon },
          timeTakenMs: g.timeTakenMs, roundDurationMs: lobby.roundDurationMs,
          isUploader, settings: lobby.settings,
        });
      p.score += score.total;
      results.push({
        playerId: p.id, nickname: p.nickname, color: p.color, icon: p.icon,
        lat: g.lat, lon: g.lon, guessedDate: g.date, dateChoice: g.dateChoice, photoOrder: g.photoOrder, guessedUploaderId: g.uploaderId,
        timeTakenMs: g.timeTakenMs,
        points: score.total,
        basePoints: score.base,
        distanceKm: score.distanceKm != null ? Number(score.distanceKm.toFixed(2)) : 0,
        distanceDays: score.distanceDays,
        correctUploader: score.correct,
        isUploader,
        isAI: p.isAI ?? p.id.startsWith('ai-'),
      });
    }

    const sorted = [...results].sort((a, b) => b.points - a.points);

    const photoCountry = lobby.settings.gameType !== 'spot'
      ? { country: null, region: null, isoCode: null }
      : await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id).catch(err => {
      handleError(err, 'photo location lookup'); return { country: null, region: null, isoCode: null };
    });

    const guessCountries = lobby.settings.gameType === 'spot' && results.length > 0
      ? await batchLookup(results.map(r => ({ lat: r.lat, lon: r.lon }))).catch(err => {
        handleError(err, 'batch location lookup'); return [];
      })
      : [];

    results.forEach((result, i) => {
      if (guessCountries[i]) {
        result.country = guessCountries[i].country;
        result.region = guessCountries[i].region;
        const isoCode = guessCountries[i].isoCode;
        result.countryFlag = isoToFlag(isoCode);
        result.countryCode = isoCode;
        result.locationLookupSucceeded = guessCountries[i].lookupSucceeded === true;
      } else {
        result.country = null;
        result.region = null;
        result.countryFlag = '';
        result.countryCode = null;
        result.locationLookupSucceeded = false;
      }
      if (result.playerId.startsWith('ai-') && lobby.settings.visionCommentary) {
        const visionData = this.visionCommentaries.get(photo.id);
        if (visionData) result.visionCommentary = visionData.commentary;
      }
    });

    lobby.roundStatistics.push({
      roundIndex: lobby.roundIndex,
      photo: {
        id: photo.id, uploaderId: photo.uploaderId, lat: photo.lat, lon: photo.lon,
        title: photo.title, manualLocation: photo.manualLocation,
        captureDate: photo.captureDate,
        country: photoCountry.country, region: photoCountry.region,
        countryCode: photoCountry.isoCode,
      },
      guesses: results.map(r => ({
        playerId: r.playerId, nickname: r.nickname, distanceKm: r.distanceKm,
        distanceDays: r.distanceDays, guessedDate: r.guessedDate, dateChoice: r.dateChoice, photoOrder: r.photoOrder,
        guessedUploaderId: r.guessedUploaderId, correctUploader: r.correctUploader,
        points: r.points, country: r.country, isUploader: r.isUploader,
      })),
    });

    lobby.lastRoundResults = {
      gameId: lobby.gameId,
      photo: {
        id: mode.hidesUploaderDuringRound ? lobby.roundToken : photo.id,
        url: photo.url, lat: photo.lat, lon: photo.lon, uploaderId: photo.uploaderId,
        title: photo.title, manualLocation: photo.manualLocation,
        captureDate: photo.captureDate,
        country: photoCountry.country, region: photoCountry.region, countryFlag: isoToFlag(photoCountry.isoCode),
        countryCode: photoCountry.isoCode,
      },
      results,
      leaderboard: this.leaderboard(lobby),
      best: sorted[0] ?? null,
      worst: sorted[sorted.length - 1] ?? null,
      roundIndex: lobby.roundIndex,
      totalRounds: lobby.roundOrder.length,
      roundDurationMs: lobby.roundDurationMs,
      dateChallenge: lobby.currentDateChallenge?.kind === 'before_after'
        ? {
          kind: 'before_after', answer: lobby.currentDateChallenge.answer,
          reference: {
            id: lobby.currentDateChallenge.reference.id,
            url: lobby.currentDateChallenge.reference.url,
            captureDate: lobby.currentDateChallenge.reference.captureDate,
          },
        }
        : lobby.currentDateChallenge?.kind === 'timeline'
          ? { kind: 'timeline', answer: lobby.currentDateChallenge.answer, photos: lobby.currentDateChallenge.photos.map(item => ({ id: item.id, url: item.url, captureDate: item.captureDate })) }
          : undefined,
    };

    lobby.roundHistory.push(lobby.lastRoundResults);

    this.io.to(lobbyId).emit('round_results', lobby.lastRoundResults);

    clearTimeout(lobby.timers.resultsEnd);

    lobby.isEndingRound = false;
  }

  leaderboard(lobby) {
    if (lobby.settings.gameMode === 'teams') {
      const teams = new Map();

      for (const p of lobby.players.values()) {
        const t = p.team || 'Unassigned';
        if (!teams.has(t)) teams.set(t, { team: t, score: 0, players: [] });
        teams.get(t).players.push({ id: p.id, nickname: p.nickname, icon: p.icon, color: p.color });
      }

      for (const round of (lobby.roundStatistics ?? [])) {
        const roundPoints = new Map(round.guesses.map(g => [g.playerId, g.points ?? 0]));
        for (const entry of teams.values()) {
          const bestThisRound = entry.players.reduce((best, p) => Math.max(best, roundPoints.get(p.id) ?? 0), 0);
          entry.score += bestThisRound;
        }
      }

      return [...teams.values()].sort((a, b) => b.score - a.score);
    }

    return [...lobby.players.values()]
      .map(p => ({ id: p.id, nickname: p.nickname, score: p.score, color: p.color, icon: p.icon }))
      .sort((a, b) => b.score - a.score);
  }

  serializeLobby(lobby, viewerPlayerId = null) {
    // During a round, hide all photo coordinates (they're revealed via lastRoundResults).
    // In the lobby (waiting), hide other players' coordinates to prevent peeking.
    const hideAll = lobby.state === 'in_round' || lobby.state === 'showing_results';
    const hideUploaderAnswers = hideAll && gameModeDefinition(lobby.settings.gameType).hidesUploaderDuringRound;

    // Reconcile host: if hostId no longer refers to a present member (e.g. due
    // to a race between disconnect timeouts and rejoins), reassign to a real
    // player so the client never renders a crown on a missing or duplicate row.
    if (!lobby.players.has(lobby.hostId)) {
      const realPlayer = [...lobby.players.values()].find(p => p.socketId !== null && !p.isAI);
      const fallback = realPlayer ?? [...lobby.players.values()].find(p => !p.isAI);
      lobby.hostId = fallback?.id ?? null;
    }

    return {
      id: lobby.id,
      gameId: lobby.gameId,
      nameMetadata: lobby.nameMetadata,
      hostId: lobby.hostId,
      state: lobby.state,
      constraints: lobby.constraints,
      settings: lobby.settings,
      roundIndex: lobby.roundIndex,
      totalRounds: lobby.roundOrder.length,
      roundDurationMs: lobby.roundDurationMs,
      players: [...lobby.players.values()].map(p => ({
        id: p.id, nickname: p.nickname, score: p.score,
        ready: p.ready, color: p.color, icon: p.icon, team: p.team, wins: p.wins,
      })),
      photos: hideUploaderAnswers && lobby.state === 'in_round' ? [] : lobby.photos.map(({ id, url, uploaderId, lat, lon, title, hint, manualLocation, captureDate }) => {
        const showCoords = !hideAll && (viewerPlayerId === null || uploaderId === viewerPlayerId);
        const isOwnPhoto = viewerPlayerId === null || uploaderId === viewerPlayerId;
        // Before play, other members only need counts/uploader ownership. Do
        // not send the original URL: a CSS blur can always be removed locally.
        const showPhotoDetails = lobby.state !== 'waiting' || isOwnPhoto;
        const normalizedCaptureDate = normalizePhotoDate(captureDate);
        const serialized = { id, url: showPhotoDetails ? url : '',
          uploaderId: hideUploaderAnswers ? undefined : uploaderId,
          hasLocation: typeof lat === 'number' && typeof lon === 'number',
          hasCaptureDate: !!normalizedCaptureDate && normalizedCaptureDate <= todayUtcDate(),
          lat: showCoords ? lat : null,
          lon: showCoords ? lon : null,
          title: showPhotoDetails ? title : undefined,
          hint: showPhotoDetails ? hint : undefined,
          manualLocation: showPhotoDetails ? manualLocation : undefined,
          captureDate: showPhotoDetails && !(lobby.settings.gameType === 'date' && hideAll)
            ? captureDate
            : undefined };
        const prediction = this.predictions.get(id);
        if (!hideAll && uploaderId === viewerPlayerId && prediction) {
          serialized.predictionLat = prediction.lat;
          serialized.predictionLon = prediction.lon;
        }
        return serialized;
      }),
      currentRoundPhoto: lobby.currentRoundPhoto,
      roundStartAt: lobby.roundStartAt,
      firstGuessAt: lobby.firstGuessAt,
      lastRoundResults: lobby.state === 'showing_results' ? lobby.lastRoundResults : null,
      roundHistory: lobby.state === 'finished' || lobby.state === 'showing_results'
        ? lobby.roundHistory
        : [],
      currentGuesses: lobby.state === 'in_round' && viewerPlayerId && lobby.guesses.has(viewerPlayerId)
        ? { [viewerPlayerId]: lobby.guesses.get(viewerPlayerId) }
        : null,
      aiTipIndex: lobby.state === 'in_round' ? (lobby.aiTipIndex ?? null) : null,
    };
  }

  broadcastLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    if (lobby.state === 'waiting') {
      // Send each connected player a view where only their own photos have coords.
      for (const player of lobby.players.values()) {
        if (!player.socketId) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        if (socket) socket.emit('lobby_update', this.serializeLobby(lobby, player.id));
      }
    } else {
      // Send personalized payloads so reconnect metadata never reveals another
      // player's submitted guess or a model prediction.
      for (const player of lobby.players.values()) {
        if (!player.socketId) continue;
        const socket = this.io.sockets.sockets.get(player.socketId);
        if (socket) socket.emit('lobby_update', this.serializeLobby(lobby, player.id));
      }
    }
  }

  /* ─── Game reset / restart ─── */

  _resetLobbyState(lobby) {
    lobby.photos = [];
    for (const player of lobby.players.values()) { player.score = 0; player.ready = false; }
    lobby.state = 'waiting';
    lobby.roundIndex = -1;
    lobby.roundOrder = [];
    lobby.dateChallengePlan = null;
    lobby.gameId = null;
    lobby.guesses = new Map();
    lobby.firstGuessAt = null;
    lobby.isEndingRound = false;
    lobby.currentRoundPhoto = null;
    lobby.currentDateChallenge = null;
    lobby.lastRoundResults = null;
    lobby.roundHistory = [];
    lobby.roundToken = null;
    lobby.roundStatistics = [];
    lobby.isResetting = false;
    clearTimeout(lobby.timers.roundEnd);
    clearTimeout(lobby.timers.resultsEnd);
    clearInterval(lobby.timers.ticker);
  }

  async _cleanupPhotos(lobby) {
    for (const photo of lobby.photos) {
      const filePath = path.join(UPLOADS_DIR, path.basename(photo.url));
      try {
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      } catch (err) {
        handleError(err, 'file cleanup');
      }
      this._invalidatePhotoCaches(photo.id);
    }
  }

  async restartGame(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.state === 'in_round' || lobby.state === 'showing_results') return;
    const aiPlayerId = `ai-${lobbyId}`;
    const aiPlayer = lobby.players.get(aiPlayerId);
    const aiWins = aiPlayer?.wins || 0;
    const hadAI = !!aiPlayer;
    await this._cleanupPhotos(lobby);
    this._resetLobbyState(lobby);
    if (hadAI && !lobby.players.has(aiPlayerId)) {
      lobby.players.set(aiPlayerId, {
        id: aiPlayerId, nickname: this._aiNicknameForLanguage(lobby.settings?.language),
        score: 0, ready: true, color: '#888888', icon: '🤖', socketId: null, isAI: true, team: null, wins: aiWins,
      });
    }
    this.broadcastLobby(lobbyId);
  }

  async resetLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    if (lobby.state === 'finished' || lobby.lastRoundResults) {
      const leaderboard = this.leaderboard(lobby);
      if (leaderboard.length > 0) {
        const topScore = leaderboard[0].score;
        for (const entry of leaderboard) {
          if (entry.score !== topScore) continue;
          if (lobby.settings.gameMode === 'teams') {
            for (const member of entry.players ?? []) {
              const player = lobby.players.get(member.id);
              if (player) player.wins = (player.wins || 0) + 1;
            }
          } else {
            const player = lobby.players.get(entry.id);
            if (player) player.wins = (player.wins || 0) + 1;
          }
        }
      }
    }

    await this._cleanupPhotos(lobby);
    this._resetLobbyState(lobby);
    this.broadcastLobby(lobbyId);
  }

  reconnectPlayer({ lobbyId, playerId, sessionToken, socketId, clientSessionId = null }) {
    const lobby = findLobbyById(this.lobbies, lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const player = lobby.players.get(playerId);
    if (!player) throw new Error('Player not found');
    if (!sessionToken || player.sessionToken !== sessionToken) throw new Error('Session not found');

    if (player.disconnectTimeoutId) {
      clearTimeout(player.disconnectTimeoutId);
      player.disconnectTimeoutId = null;
    }
    player.socketId = socketId;
    if (clientSessionId) player.clientSessionId = clientSessionId;

    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      if (lobby.state === 'in_round' && lobby.currentRoundPhoto) {
        socket.emit('round_start', {
          roundIndex: lobby.roundIndex, totalRounds: lobby.roundOrder.length,
          photo: lobby.currentRoundPhoto,
          roundDurationMs: lobby.settings.timerMode === 'fixed' ? lobby.settings.roundDurationSec * 1000 : 0,
          isReconnect: true,
          roundStartAt: lobby.roundStartAt,
          firstGuessAt: lobby.firstGuessAt,
          aiTipIndex: lobby.aiTipIndex ?? null,
        });
      } else if (lobby.state === 'showing_results' && lobby.lastRoundResults) {
        socket.emit('round_results', lobby.lastRoundResults);
      } else if (lobby.state === 'finished') {
        socket.emit('game_finished', this.serializeLobby(lobby, playerId));
      }
    }

    this.broadcastLobby(lobbyId);
    return { lobby };
  }

  /* ─── AI player management ─── */

  addAIPlayer(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const aiPlayerId = `ai-${lobbyId}`;
    if (!lobby.players.has(aiPlayerId)) {
      lobby.players.set(aiPlayerId, {
        id: aiPlayerId, nickname: this._aiNicknameForLanguage(lobby.settings?.language),
        score: 0, ready: false, color: '#888888', icon: '🤖', socketId: null, isAI: true, team: null, wins: 0,
      });
      if (lobby.settings.gameMode === 'teams') this._assignPlayerToLeastPopulatedTeam(lobby, aiPlayerId);
      this.broadcastLobby(lobbyId);
    }
  }

  removeAIPlayer(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const aiPlayerId = `ai-${lobbyId}`;
    if (lobby.players.has(aiPlayerId)) {
      lobby.players.delete(aiPlayerId);
      this.broadcastLobby(lobbyId);
    }
  }

  hasAIPlayer(lobbyId) {
    return this.lobbies.get(lobbyId)?.players.has(`ai-${lobbyId}`) ?? false;
  }

  async leaveLobby(lobbyId, playerId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const leavingPlayer = lobby.players.get(playerId);
    if (leavingPlayer?.disconnectTimeoutId) {
      clearTimeout(leavingPlayer.disconnectTimeoutId);
    }
    await this._removePlayerPhotos(lobby, playerId);
    lobby.players.delete(playerId);

    if (lobby.hostId === playerId && lobby.players.size > 0) {
      const realPlayers = [...lobby.players.values()].filter(p => p.socketId !== null);
      const newHost = realPlayers[0] ?? [...lobby.players.values()][0];
      lobby.hostId = newHost.id;
    }

    this.broadcastLobby(lobbyId);
  }

  async _removePlayerPhotos(lobby, playerId) {
    const removed = lobby.photos.filter(photo => photo.uploaderId === playerId);
    if (!removed.length) return;
    const removedIds = new Set(removed.map(photo => photo.id));
    const invalidRoundIds = new Set(removedIds);
    // A finished game is a record: rewriting its round plan would contradict
    // the already-published round history (round indices and totals).
    const preserveRoundPlan = lobby.state === 'finished';
    if (lobby.dateChallengePlan && !preserveRoundPlan) {
      const challengePhotoIds = round => round.challenge.kind === 'before_after'
        ? [round.currentPhoto.id, round.challenge.reference.id]
        : round.challenge.photos.map(photo => photo.id);
      lobby.dateChallengePlan = lobby.dateChallengePlan.filter(round => {
        const invalid = challengePhotoIds(round).some(id => removedIds.has(id));
        if (invalid) invalidRoundIds.add(round.currentPhoto.id);
        return !invalid;
      });
    }
    if (preserveRoundPlan) {
      invalidRoundIds.clear();
    }
    const oldOrder = [...lobby.roundOrder];
    const nextRemainingId = oldOrder.slice(lobby.roundIndex + 1).find(id => !invalidRoundIds.has(id));
    const removedCurrent = lobby.state === 'in_round' && invalidRoundIds.has(oldOrder[lobby.roundIndex]);

    await Promise.all(removed.map(async photo => {
      await fs.unlink(path.join(UPLOADS_DIR, path.basename(photo.url))).catch(err => {
        if (err?.code !== 'ENOENT') handleError(err, 'departing player photo cleanup');
      });
      this._invalidatePhotoCaches(photo.id);
    }));
    lobby.photos = lobby.photos.filter(photo => !removedIds.has(photo.id));
    if (!preserveRoundPlan) {
      lobby.roundOrder = lobby.roundOrder.filter(id => !invalidRoundIds.has(id));

      if (lobby.roundIndex >= 0) {
        const nextIndex = nextRemainingId ? lobby.roundOrder.indexOf(nextRemainingId) : lobby.roundOrder.length;
        lobby.roundIndex = Math.max(-1, nextIndex - 1);
      }
    }
    if (removedCurrent) {
      clearTimeout(lobby.timers.roundEnd);
      clearInterval(lobby.timers.ticker);
      lobby.state = 'showing_results';
      await this.nextRound(lobby.id);
    }
  }

  async deleteLobby(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    clearTimeout(lobby.timers.roundEnd);
    clearTimeout(lobby.timers.resultsEnd);
    clearInterval(lobby.timers.ticker);
    await this._cleanupPhotos(lobby);
    this.lobbies.delete(lobbyId);
  }

  schedulePendingJoinExpiry(lobbyId, playerId, timeoutMs = 2 * 60 * 1000) {
    const lobby = this.lobbies.get(lobbyId);
    const player = lobby?.players.get(playerId);
    if (!lobby || !player || player.isAI || player.socketId !== null) return;
    if (player.disconnectTimeoutId) clearTimeout(player.disconnectTimeoutId);
    player.disconnectTimeoutId = setTimeout(() => {
      const activeLobby = this.lobbies.get(lobbyId);
      const activePlayer = activeLobby?.players.get(playerId);
      if (activeLobby && activePlayer && activePlayer.socketId === null) {
        this.leaveLobby(lobbyId, playerId)
          .then(async () => {
            const remainingLobby = this.lobbies.get(lobbyId);
            const hasHumanPlayers = remainingLobby
              && [...remainingLobby.players.values()].some(p => !p.isAI && !String(p.id).startsWith('ai-'));
            if (remainingLobby?.state === 'waiting' && !hasHumanPlayers) {
              await this.deleteLobby(lobbyId);
            }
          })
          .catch(() => { });
      }
    }, timeoutMs);
  }

  /* ─── AI gameplay ─── */

  async queryGeoCLIP(lobbyId, photo, roundToken) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby?.settings.enableAIGuessing) return;

    const aiPlayerId = `ai-${lobbyId}`;
    if (lobby.guesses.has(aiPlayerId)) return;

    try {
      const cached = this.predictions.get(photo.id);
      let lat, lon;

      if (this._isFresh(cached)) {
        ({ lat, lon } = cached);
      } else {
        const pred = await this.ensurePrediction(photo);
        if (!pred) return;
        ({ lat, lon } = pred);
      }

      if (!isValidCoordinate(lat, lon)) return;

      const currentLobby = this.lobbies.get(lobbyId);
      if (!currentLobby || currentLobby.roundToken !== roundToken || currentLobby.state !== 'in_round') return;
      if (currentLobby.guesses.has(aiPlayerId)) return;

      this.submitGuess(lobbyId, aiPlayerId, { lat, lon });

      if (lobby.settings.visionCommentary && !this.visionCommentaries.has(photo.id)) {
        await this.ensureVisionCommentary(photo, lobbyId);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('GeoCLIP query error:', err?.message ?? err);
    }
  }

  async queryDateVision(lobbyId, photo, roundToken) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby?.settings.enableAIGuessing) {
      console.log(`[vision] Date guess skipped for photo ${photo.id}: AI guessing is disabled`);
      return;
    }
    const aiPlayerId = `ai-${lobbyId}`;
    if (lobby.guesses.has(aiPlayerId)) {
      console.log(`[vision] Date guess skipped for photo ${photo.id}: AI already submitted this round`);
      return;
    }
    try {
      const promptBounds = this._datePromptBounds(lobby);
      if (!promptBounds) {
        console.warn(`[vision] Date guess skipped for photo ${photo.id}: no valid timeline bounds`);
        return;
      }
      console.log(
        `[vision] Starting DateTheShot guess for photo ${photo.id} using ${promptBounds.source}: `
        + `${promptBounds.start}..${promptBounds.end}`,
      );
      if (lobby.settings.dateSubmode === 'timeline' && lobby.currentDateChallenge?.kind === 'timeline') {
        // Timeline dates are hidden from everyone. Estimate every card instead
        // of giving the AI the two real dates that human players cannot see.
        const estimates = await Promise.all(lobby.currentDateChallenge.photos.map(async challengePhoto => {
          const result = await this.ensureDatePrediction(challengePhoto, {
            earliestDate: promptBounds.start,
            latestDate: promptBounds.end,
          });
          return result?.date ? { id: challengePhoto.id, date: result.date } : null;
        }));
        const currentLobby = this.lobbies.get(lobbyId);
        if (!currentLobby || currentLobby.roundToken !== roundToken || currentLobby.state !== 'in_round') return;
        if (estimates.some(estimate => !estimate)) {
          console.warn(`[vision] Timeline guess unavailable in lobby ${lobbyId}: one or more dates could not be estimated`);
          return;
        }
        const photoOrder = estimates
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
          .map(estimate => estimate.id);
        const submission = this.submitGuess(lobbyId, aiPlayerId, { photoOrder });
        console.log(
          `[vision] AI timeline submission for photo ${photo.id}: accepted=${submission.accepted}, `
          + `duplicate=${!!submission.duplicate}${submission.error ? `, error=${submission.error}` : ''}`,
        );
        if (currentLobby.settings.visionCommentary && !this.visionCommentaries.has(photo.id)) {
          this.ensureVisionCommentary(photo, lobbyId)
            .catch(err => handleError(err, 'AI date commentary'));
        }
        return;
      }
      if (lobby.settings.dateSubmode === 'before_after' && lobby.currentDateChallenge?.kind === 'before_after') {
        // The reference's real capture date is the answer: estimating only the
        // current photo and comparing against it would leak ground truth.
        // Estimate both images exactly like a human player would.
        const [currentEstimate, referenceEstimate] = await Promise.all([
          this.ensureDatePrediction(photo, {
            earliestDate: promptBounds.start,
            latestDate: promptBounds.end,
          }),
          this.ensureDatePrediction(lobby.currentDateChallenge.reference, {
            earliestDate: promptBounds.start,
            latestDate: promptBounds.end,
          }),
        ]);
        const currentLobby = this.lobbies.get(lobbyId);
        if (!currentLobby || currentLobby.roundToken !== roundToken || currentLobby.state !== 'in_round') return;
        if (!currentEstimate?.date || !referenceEstimate?.date) {
          console.warn(`[vision] Before or After guess unavailable in lobby ${lobbyId}: a date could not be estimated`);
          return;
        }
        if (currentLobby.settings.visionCommentary && !this.visionCommentaries.has(photo.id)) {
          this.ensureVisionCommentary(photo, lobbyId)
            .catch(err => handleError(err, 'AI date commentary'));
        }
        const dateChoice = currentEstimate.date < referenceEstimate.date ? 'before' : 'after';
        const submission = this.submitGuess(lobbyId, aiPlayerId, { dateChoice });
        const log = submission.accepted ? console.log : console.warn;
        log(
          `[vision] AI Before or After submission for photo ${photo.id}: choice=${dateChoice}, `
          + `accepted=${submission.accepted}, duplicate=${!!submission.duplicate}`
          + `${submission.error ? `, error=${submission.error}` : ''}`,
        );
        return;
      }
      const prediction = await this.ensureDatePrediction(photo, {
        earliestDate: promptBounds.start,
        latestDate: promptBounds.end,
      });
      if (!prediction?.date) {
        console.warn(`[vision] Date guess unavailable for photo ${photo.id}: prediction returned no date`);
        return;
      }
      const currentLobby = this.lobbies.get(lobbyId);
      if (!currentLobby || currentLobby.roundToken !== roundToken || currentLobby.state !== 'in_round') {
        console.warn(
          `[vision] Discarding date ${prediction.date} for photo ${photo.id}: `
          + `round is no longer active (exists=${!!currentLobby}, `
          + `tokenMatches=${currentLobby?.roundToken === roundToken}, state=${currentLobby?.state || 'missing'})`,
        );
        return;
      }
      if (currentLobby.settings.visionCommentary && !this.visionCommentaries.has(photo.id)) {
        this.ensureVisionCommentary(photo, lobbyId)
          .catch(err => handleError(err, 'AI date commentary'));
      }
      const date = clampDateToRange(
        prediction.date,
        currentLobby.settings.dateTimelineStart,
        currentLobby.settings.dateTimelineEnd,
      );
      if (!date) {
        console.warn(
          `[vision] Discarding invalid date prediction for photo ${photo.id}: `
          + `${prediction.date} (lobby range ${currentLobby.settings.dateTimelineStart}`
          + `..${currentLobby.settings.dateTimelineEnd})`,
        );
        return;
      }
      if (date !== prediction.date) {
        console.warn(
          `[vision] Clamped AI round guess for photo ${photo.id}: ${prediction.date} -> ${date} `
          + `(lobby range ${currentLobby.settings.dateTimelineStart}..${currentLobby.settings.dateTimelineEnd})`,
        );
      }
      const submission = this.submitGuess(lobbyId, aiPlayerId, { date });
      const log = submission.accepted ? console.log : console.warn;
      log(
        `[vision] AI date guess submission for photo ${photo.id}: date=${date}, `
        + `accepted=${submission.accepted}, duplicate=${!!submission.duplicate}`
        + `${submission.error ? `, error=${submission.error}` : ''}`,
      );
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Vision date query error:', err?.message ?? err);
    }
  }

  async queryRandomUploader(lobbyId, photo, roundToken) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby?.settings.enableAIGuessing) return;
    const candidates = [...lobby.players.values()]
      .filter(player => !player.isAI && !String(player.id).startsWith('ai-'));
    const guessed = candidates[Math.floor(Math.random() * candidates.length)];
    const currentLobby = this.lobbies.get(lobbyId);
    if (!guessed || !currentLobby || currentLobby.roundToken !== roundToken || currentLobby.state !== 'in_round') return;

    this.submitGuess(lobbyId, `ai-${lobbyId}`, { uploaderId: guessed.id });
    if (currentLobby.settings.visionCommentary && !this.visionCommentaries.has(photo.id)) {
      this.ensureVisionCommentary(photo, lobbyId, { guessedUploaderId: guessed.id })
        .catch(err => handleError(err, 'AI uploader commentary'));
    }
  }
}
