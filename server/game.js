import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { computeRoundScore } from './scoring.js';
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
    const timerMode = settings?.timerMode || 'fixed';
    const roundDurationSec = timerMode === 'progressive' ? 0 : (settings?.roundDurationSec ?? 45);
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
        gameMode: settings?.gameMode || 'individual',
        timerMode,
        hintThresholdSec: settings?.hintThresholdSec || 15,
        enableAIGuessing: (settings?.enableAIGuessing ?? true) && constraints.allowAIGuessing,
        visionCommentary: (settings?.visionCommentary || false) && constraints.allowVisionCommentary,
        autoNameImages: (settings?.autoNameImages || false) && constraints.allowAutoNaming,
        uploaderPenaltyPercent: settings?.uploaderPenaltyPercent ?? 10,
        minPhotosPerPlayer: settings?.minPhotosPerPlayer ?? 0,
        maxPhotosPerPlayer: Math.min(settings?.maxPhotosPerPlayer ?? constraints.maxPhotosPerPlayer, constraints.maxPhotosPerPlayer),
        duelRaceTimeSec,
        language,
      },
      roundIndex: -1,
      roundOrder: [],
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
      roundStatistics: [],
    };

    lobby.players.set(playerId, {
      id: playerId, nickname, score: 0, ready: false, color: null, socketId, team: null, wins: 0, clientSessionId,
    });

    this.lobbies.set(lobbyId, lobby);

    if (lobby.settings.enableAIGuessing) this.addAIPlayer(lobbyId);

    return { lobby, playerId };
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
    const s = lobby.settings;

    if (newSettings.timerMode === 'fixed' || newSettings.timerMode === 'progressive') {
      s.timerMode = newSettings.timerMode;
      if (s.timerMode === 'progressive') s.roundDurationSec = 0;
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
      s.language = this._normalizeLanguage(newSettings.language);
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
            .then(() => this.prefetchLocation(photo.id, photo))
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
                await this.prefetchLocation(photo.id, photo);
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
      s.showImageDate = newSettings.showImageDate;
    }

    // Map settings — if allowAllMaps is false, only osm is permitted
    if (['osm', 'hot', 'cyclosm', 'opnvkarte', 'dark', 'light', 'satellite', 'terrain'].includes(newSettings.mapStyle)) {
      s.mapStyle = lobby.constraints.allowAllMaps ? newSettings.mapStyle : 'osm';
    }
    // Only these languages have working tile servers for OSM style
    if (['en', 'fr', 'de', 'local'].includes(newSettings.mapLanguage)) {
      s.mapLanguage = newSettings.mapLanguage;
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

    if (lobby.settings.enableAIGuessing) {
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

  kickPlayer(lobbyId, playerIdToKick) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const playerToKick = lobby.players.get(playerIdToKick);
    if (!playerToKick || playerIdToKick === lobby.hostId) return;
    const socket = this.io.sockets.sockets.get(playerToKick.socketId);
    if (socket) { socket.emit('kicked'); socket.disconnect(true); }
    lobby.players.delete(playerIdToKick);
    this.broadcastLobby(lobbyId);
  }

  joinLobby({ lobbyId, nickname, socketId, clientSessionId = null }) {
    const lobby = findLobbyById(this.lobbies, lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const humanCount = [...lobby.players.values()].filter(p => !p.id.startsWith('ai-')).length;
    if (humanCount >= lobby.constraints.maxPlayersPerLobby) {
      throw new Error(`Lobby is full (max ${lobby.constraints.maxPlayersPerLobby} players)`);
    }
    const playerId = uuid();
    lobby.players.set(playerId, {
      id: playerId, nickname, score: 0, ready: false, color: null, socketId, team: null, wins: 0, clientSessionId,
    });
    if (lobby.settings.gameMode === 'teams') this._assignPlayerToLeastPopulatedTeam(lobby, playerId);
    return { lobby, playerId };
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
        .then(() => this.prefetchLocation(photo.id, photo))
        .catch(() => { });
    }

    if (lobby.settings.autoNameImages && !photo.title?.length) {
      this.prefetchAutoNaming(photo.id, photo, lobbyId);
    }

    this.broadcastLobby(lobbyId);
  }

  async deletePhoto(lobbyId, playerId, photoId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
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
    p.ready = ready;
    this.broadcastLobby(lobbyId);
  }

  startGame(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    if (lobby.state !== 'waiting') throw new Error('Game already started');
    if (lobby.photos.length === 0) throw new Error('No photos uploaded');

    const realPlayers = [...lobby.players.values()].filter(p => p.socketId !== null && !p.isAI);
    for (const player of realPlayers) {
      const count = lobby.photos.filter(p => p.uploaderId === player.id).length;
      if (count < lobby.settings.minPhotosPerPlayer) {
        throw new Error(`${player.nickname} must upload at least ${lobby.settings.minPhotosPerPlayer} photo(s)`);
      }
    }

    const photosWithLocation = lobby.photos.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number');
    if (photosWithLocation.length === 0) throw new Error('No photos with location data available');

    lobby.roundOrder = photosWithLocation.map(p => p.id);
    for (let i = lobby.roundOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lobby.roundOrder[i], lobby.roundOrder[j]] = [lobby.roundOrder[j], lobby.roundOrder[i]];
    }

    lobby.state = 'in_round';
    lobby.roundIndex = -1;
    lobby.gameStartTime = Date.now();
    lobby.roundStatistics = [];
    this.broadcastLobby(lobbyId);
    this.nextRound(lobbyId);
  }

  currentPhoto(lobby) {
    const id = lobby.roundOrder[lobby.roundIndex];
    return lobby.photos.find(p => p.id === id);
  }

  async nextRound(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.roundIndex += 1;
    lobby.guesses = new Map();
    lobby.firstGuessAt = null;
    lobby.isEndingRound = false;
    lobby.lastRoundResults = null;
    lobby.roundToken = uuid();

    if (lobby.roundIndex >= lobby.roundOrder.length) {
      return this._finishGame(lobbyId, lobby);
    }

    lobby.state = 'in_round';
    lobby.roundStartAt = Date.now();
    const photo = this.currentPhoto(lobby);
    if (!photo) return this._finishGame(lobbyId, lobby);

    lobby.currentRoundPhoto = {
      id: photo.id, url: photo.url, uploaderId: photo.uploaderId,
      title: photo.title || '', hint: photo.hint || '',
      captureDate: photo.captureDate,
    };

    lobby.aiTipIndex = lobby.settings.enableAIGuessing && Math.random() < 0.6
      ? Math.floor(Math.random() * 50)
      : null;

    this.io.to(lobbyId).emit('round_start', {
      roundIndex: lobby.roundIndex,
      totalRounds: lobby.roundOrder.length,
      photo: lobby.currentRoundPhoto,
      roundDurationMs: lobby.roundDurationMs,
      roundStartAt: lobby.roundStartAt,
      aiTipIndex: lobby.aiTipIndex,
    });

    if (lobby.settings.enableAIGuessing) {
      this.queryGeoCLIP(lobbyId, photo, lobby.roundToken).catch(err => handleError(err, 'GeoCLIP query'));
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
          remaining = Math.max(0, lobby.duelRaceTimeMs - (Date.now() - lobby.firstGuessAt));
        } else {
          remaining = 0; timerStarted = false;
        }
      } else {
        remaining = Math.max(0, lobby.roundDurationMs - (Date.now() - lobby.roundStartAt));
      }
      this.io.to(lobbyId).emit('timer', { remainingMs: remaining, timerStarted });
    }, 1000);

    this.broadcastLobby(lobbyId);
  }

  _finishGame(lobbyId, lobby) {
    lobby.state = 'finished';
    lobby.currentRoundPhoto = null;
    this.io.to(lobbyId).emit('game_finished', this.serializeLobby(lobby));

    this._cleanupPhotos(lobby);

    if (typeof this.config?.onGameFinished === 'function') {
      try {
        this.config.onGameFinished({
          lobbyId: lobby.id,
          finishedAt: new Date().toISOString(),
          playerCount: lobby.players.size,
          humanPlayerCount: [...lobby.players.values()].filter(p => !p.isAI && !String(p.id).startsWith('ai-')).length,
          totalRounds: lobby.roundOrder.length,
          settings: {
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

  submitGuess(lobbyId, playerId, { lat, lon }) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.state !== 'in_round') return;
    const photo = this.currentPhoto(lobby);
    if (!photo || !isValidCoordinate(lat, lon)) return;

    const isAI = playerId.startsWith('ai-');
    const now = Date.now();
    lobby.guesses.set(playerId, { lat, lon, timeTakenMs: now - lobby.roundStartAt });

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
  }

  async endRound(lobbyId) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.state !== 'in_round' || lobby.isEndingRound) return;
    lobby.isEndingRound = true;

    clearTimeout(lobby.timers.roundEnd);
    clearInterval(lobby.timers.ticker);

    const aiPlayerId = `ai-${lobbyId}`;
    if (lobby.settings.enableAIGuessing && !lobby.guesses.has(aiPlayerId)) {
      await new Promise(resolve => setTimeout(resolve, Math.min(2000, lobby.roundDurationMs * 0.05)));
    }

    lobby.state = 'showing_results';
    const photo = this.currentPhoto(lobby);
    const results = [];

    for (const p of lobby.players.values()) {
      const g = lobby.guesses.get(p.id);
      if (!g) continue;
      const isUploader = p.id === photo.uploaderId;
      const score = computeRoundScore({
        guess: g, target: { lat: photo.lat, lon: photo.lon },
        timeTakenMs: g.timeTakenMs, roundDurationMs: lobby.roundDurationMs,
        isUploader, settings: lobby.settings,
      });
      p.score += score.total;
      results.push({
        playerId: p.id, nickname: p.nickname, color: p.color, icon: p.icon,
        lat: g.lat, lon: g.lon,
        timeTakenMs: g.timeTakenMs,
        points: score.total,
        distanceKm: Number(score.distanceKm.toFixed(2)),
        isUploader,
        isAI: p.isAI ?? p.id.startsWith('ai-'),
      });
    }

    const sorted = [...results].sort((a, b) => a.distanceKm - b.distanceKm);

    const photoCountry = await this.ensurePhotoLocation(photo.lat, photo.lon, photo.id).catch(err => {
      handleError(err, 'photo location lookup'); return { country: null, region: null, isoCode: null };
    });

    const guessCountries = results.length > 0
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
      } else {
        result.country = null;
        result.region = null;
        result.countryFlag = '';
        result.countryCode = null;
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
        country: photoCountry.country, region: photoCountry.region,
        countryCode: photoCountry.isoCode,
      },
      guesses: results.map(r => ({
        playerId: r.playerId, nickname: r.nickname, distanceKm: r.distanceKm,
        points: r.points, country: r.country, isUploader: r.isUploader,
      })),
    });

    lobby.lastRoundResults = {
      photo: {
        id: photo.id, url: photo.url, lat: photo.lat, lon: photo.lon, uploaderId: photo.uploaderId,
        title: photo.title, manualLocation: photo.manualLocation,
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
    };

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
      photos: lobby.photos.map(({ id, url, uploaderId, lat, lon, title, hint, manualLocation, captureDate }) => {
        const showCoords = !hideAll && (viewerPlayerId === null || uploaderId === viewerPlayerId);
        const serialized = { id, url, uploaderId,
          lat: showCoords ? lat : null,
          lon: showCoords ? lon : null,
          title, hint, manualLocation, captureDate };
        const prediction = this.predictions.get(id);
        if (prediction) { serialized.predictionLat = prediction.lat; serialized.predictionLon = prediction.lon; }
        return serialized;
      }),
      currentRoundPhoto: lobby.currentRoundPhoto,
      roundStartAt: lobby.roundStartAt,
      firstGuessAt: lobby.firstGuessAt,
      lastRoundResults: lobby.state === 'showing_results' ? lobby.lastRoundResults : null,
      currentGuesses: lobby.state === 'in_round' ? Object.fromEntries(lobby.guesses) : null,
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
      // In-round / results: send a single shared payload with coords stripped.
      this.io.to(lobbyId).emit('lobby_update', this.serializeLobby(lobby));
    }
  }

  /* ─── Game reset / restart ─── */

  _resetLobbyState(lobby) {
    lobby.photos = [];
    for (const player of lobby.players.values()) { player.score = 0; player.ready = false; }
    lobby.state = 'waiting';
    lobby.roundIndex = -1;
    lobby.roundOrder = [];
    lobby.guesses = new Map();
    lobby.firstGuessAt = null;
    lobby.isEndingRound = false;
    lobby.currentRoundPhoto = null;
    lobby.lastRoundResults = null;
    lobby.roundToken = null;
    lobby.roundStatistics = [];
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
          if (entry.score === topScore) {
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

  reconnectPlayer({ lobbyId, playerId, socketId, clientSessionId = null }) {
    const lobby = findLobbyById(this.lobbies, lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const player = lobby.players.get(playerId);
    if (!player) throw new Error('Player not found');

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
          photo: lobby.currentRoundPhoto, roundDurationMs: lobby.roundDurationMs, isReconnect: true,
          roundStartAt: lobby.roundStartAt,
          firstGuessAt: lobby.firstGuessAt,
          aiTipIndex: lobby.aiTipIndex ?? null,
        });
      } else if (lobby.state === 'showing_results' && lobby.lastRoundResults) {
        socket.emit('round_results', lobby.lastRoundResults);
      } else if (lobby.state === 'finished') {
        socket.emit('game_finished', this.serializeLobby(lobby));
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
    lobby.players.delete(playerId);

    if (lobby.hostId === playerId && lobby.players.size > 0) {
      const realPlayers = [...lobby.players.values()].filter(p => p.socketId !== null);
      const newHost = realPlayers[0] ?? [...lobby.players.values()][0];
      lobby.hostId = newHost.id;
    }

    this.broadcastLobby(lobbyId);
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
        this.leaveLobby(lobbyId, playerId).catch(() => { });
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
}
