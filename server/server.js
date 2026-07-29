import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import mime from 'mime';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GameManager } from './game.js';
import { pickAvatarColor, pickAvatarIcon, AVATAR_ICONS, isValidCoordinate } from './utils.js';
import { SERVER_CONFIG } from './config.js';
import { validateToken, applyToken, pruneExpiredTokens } from './tokenManager.js';
import { normalizePhotoDate, todayUtcDate } from './scoring.js';
import { GAME_TYPES, gameModeDefinition } from './gameModes.js';

dotenv.config();

const PORT = 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const positiveNumber = (value, fallback, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};
const ROUND_DURATION_SEC = positiveNumber(process.env.ROUND_DURATION_SEC, 30, 300);
const UPLOAD_LIMIT_MB = positiveNumber(process.env.UPLOAD_LIMIT_MB, 20, 50);
const MAX_PHOTOS_PER_PLAYER = Math.floor(positiveNumber(process.env.MAX_PHOTOS_PER_PLAYER, 10, 100));
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const GAME_STATS_FILE = process.env.GAME_STATS_FILE || path.join(DATA_DIR, 'game-stats.json');
const parsedStatsHistoryLimit = Number(process.env.GAME_STATS_HISTORY_LIMIT);
const GAME_STATS_HISTORY_LIMIT = Number.isInteger(parsedStatsHistoryLimit) && parsedStatsHistoryLimit >= 0
  ? parsedStatsHistoryLimit
  : 1000;
const PENDING_JOIN_TIMEOUT_MS = 5 * 60 * 1000;
const SOCKET_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;
const EMPTY_LOBBY_GRACE_MS = 3 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const TOKEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_RATE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const VALID_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'ru'];
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_NICKNAME_LENGTH = 30;

const app = express();
// The production nginx proxy is the only hop in front of Express. Trusting one
// hop lets the lightweight per-IP limits below use the real client address.
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
  // Optimize socket transports for better performance
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '5mb' }));

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ─── Game stats persistence ─── */

function createDefaultGameStats() {
  return { totalGamesPlayed: 0, updatedAt: new Date().toISOString(), games: [] };
}

function loadGameStats() {
  try {
    if (!fs.existsSync(GAME_STATS_FILE)) {
      const initial = createDefaultGameStats();
      fs.writeFileSync(GAME_STATS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(GAME_STATS_FILE, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.games)) {
      return createDefaultGameStats();
    }
    return {
      totalGamesPlayed: Number(parsed.totalGamesPlayed || 0),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      games: parsed.games,
    };
  } catch (error) {
    console.error('Failed to load game stats; using empty defaults:', error.message);
    return createDefaultGameStats();
  }
}

function saveGameStats(stats) {
  // Write to a sibling tmp file and rename — rename is atomic on POSIX, so a
  // crash mid-write cannot leave GAME_STATS_FILE truncated.
  const tmp = `${GAME_STATS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stats, null, 2), 'utf-8');
  fs.renameSync(tmp, GAME_STATS_FILE);
}

const gameStats = loadGameStats();

function appendGameStats(summary) {
  gameStats.totalGamesPlayed += 1;
  gameStats.games.push({ gameNumber: gameStats.totalGamesPlayed, ...summary });
  if (gameStats.games.length > GAME_STATS_HISTORY_LIMIT) {
    gameStats.games.splice(0, gameStats.games.length - GAME_STATS_HISTORY_LIMIT);
  }
  gameStats.updatedAt = new Date().toISOString();
  saveGameStats(gameStats);
}

/* ─── Input validation ─── */

function validateInput(value, type, min = null, max = null, regex = null) {
  if (value == null) return false;
  switch (type) {
    case 'string':
      return typeof value === 'string'
        && (min === null || value.length >= min)
        && (max === null || value.length <= max)
        && (regex === null || regex.test(value));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        && (min === null || value >= min)
        && (max === null || value <= max);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

function validateFile(file) {
  if (!file?.originalname) return false;
  if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) return false;
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return allowedExts.includes(path.extname(file.originalname).toLowerCase())
    && allowedMimes.includes(file.mimetype);
}

function normalizeLobbyId(id) {
  return typeof id === 'string' ? id.toUpperCase() : id;
}

function normalizeNickname(value) {
  const nickname = String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, MAX_NICKNAME_LENGTH);
  return nickname || null;
}

function validateLobbySettings(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid lobby settings');
  const checks = [
    ['roundDurationSec', 5, 300], ['duelRaceTimeSec', 5, 120],
    ['hintThresholdSec', 0, 300], ['uploaderPenaltyPercent', 0, 100],
    ['minPhotosPerPlayer', 0, 100], ['maxPhotosPerPlayer', 1, 100],
  ];
  for (const [key, min, max] of checks) {
    if (settings[key] !== undefined && (!validateInput(settings[key], 'number', min, max) || !Number.isInteger(settings[key]))) {
      throw new Error(`${key} must be an integer between ${min} and ${max}`);
    }
  }
  for (const key of ['enableAIGuessing', 'visionCommentary', 'autoNameImages', 'showImageDate']) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') throw new Error(`${key} must be a boolean`);
  }
  if (settings.gameMode !== undefined && !['individual', 'teams'].includes(settings.gameMode)) throw new Error('Invalid game mode');
  if (settings.gameType !== undefined && !GAME_TYPES.includes(settings.gameType)) throw new Error('Invalid game type');
  if (settings.timerMode !== undefined && !['fixed', 'progressive'].includes(settings.timerMode)) throw new Error('Invalid timer mode');
  if (settings.language !== undefined && !VALID_LANGUAGES.includes(String(settings.language).toLowerCase())) throw new Error('Invalid language');
  if (settings.minPhotosPerPlayer !== undefined && settings.maxPhotosPerPlayer !== undefined
    && settings.minPhotosPerPlayer > settings.maxPhotosPerPlayer) throw new Error('Minimum photos cannot exceed maximum photos');
  return settings;
}

function getSessionToken(req) {
  const authorization = req.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return typeof req.query.sessionToken === 'string' ? req.query.sessionToken : null;
}

function isAuthorizedPlayer(lobby, playerId, sessionToken) {
  return !!(sessionToken && lobby?.players.get(playerId)?.sessionToken === sessionToken);
}

async function cleanupUploadedFiles(files = []) {
  await Promise.all(
    files
      .map(file => file?.path)
      .filter(Boolean)
      .map(async filePath => {
        try {
          await fs.promises.unlink(filePath);
        } catch (err) {
          if (err?.code !== 'ENOENT') {
            console.warn(`Failed to cleanup uploaded file ${filePath}:`, err.message);
          }
        }
      })
  );
}

/* ─── Multer ─── */

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${uuid()}.${mime.getExtension(file.mimetype) || 'bin'}`),
  }),
  limits: {
    fileSize: UPLOAD_LIMIT_MB * 1024 * 1024,
    files: MAX_PHOTOS_PER_PLAYER,
    fields: MAX_PHOTOS_PER_PLAYER * 2,
    parts: MAX_PHOTOS_PER_PLAYER * 3,
    fieldNameSize: 100,
    fieldSize: 4096,
  },
});

/* ─── Game manager ─── */

const gm = new GameManager(io, {
  roundDurationSec: ROUND_DURATION_SEC,
  onGameFinished: appendGameStats,
});

const latestSessionByClient = new Map();
const emptyLobbyTimestamps = new Map();

const uploadRateLimits = new Map();
function checkUploadRateLimit(playerId, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const recent = (uploadRateLimits.get(playerId) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= maxRequests) return false;
  recent.push(now);
  uploadRateLimits.set(playerId, recent);
  return true;
}

function sweepUploadRateLimits(windowMs = 60000) {
  const cutoff = Date.now() - windowMs;
  for (const [playerId, timestamps] of uploadRateLimits) {
    const recent = timestamps.filter(timestamp => timestamp >= cutoff);
    if (recent.length) uploadRateLimits.set(playerId, recent);
    else uploadRateLimits.delete(playerId);
  }
}

// Lightweight in-memory limits protect the small self-hosted server without
// adding a database or a per-request network dependency. They intentionally
// allow normal party setup bursts while preventing lobby-slot exhaustion.
const requestRateLimits = new Map();
function rateLimit(scope, maxRequests, windowMs) {
  return (req, res, next) => {
    const key = `${scope}:${req.ip}`;
    const now = Date.now();
    const recent = (requestRateLimits.get(key) ?? []).filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    }
    recent.push(now);
    requestRateLimits.set(key, recent);
    next();
  };
}

function sweepRequestRateLimits() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, timestamps] of requestRateLimits) {
    const recent = timestamps.filter(timestamp => timestamp >= cutoff);
    if (recent.length) requestRateLimits.set(key, recent);
    else requestRateLimits.delete(key);
  }
}

setInterval(sweepRequestRateLimits, REQUEST_RATE_SWEEP_INTERVAL_MS).unref();

/* ─── Lobby cleanup ─── */

async function cleanupEmptyLobbies() {
  const now = Date.now();
  const toDelete = [];

  for (const [lobbyId, lobby] of gm.lobbies.entries()) {
    const hasActivePlayers = [...lobby.players.values()].some(
      p => p.socketId !== null || p.disconnectTimeoutId != null
    );

    if (!hasActivePlayers) {
      if (!emptyLobbyTimestamps.has(lobbyId)) {
        emptyLobbyTimestamps.set(lobbyId, now);
      } else if (now - emptyLobbyTimestamps.get(lobbyId) >= EMPTY_LOBBY_GRACE_MS) {
        toDelete.push({ lobbyId, lobby });
      }
    } else {
      emptyLobbyTimestamps.delete(lobbyId);
    }
  }

  for (const { lobbyId } of toDelete) {
    await gm.deleteLobby(lobbyId);
    emptyLobbyTimestamps.delete(lobbyId);
  }
}

setInterval(cleanupEmptyLobbies, CLEANUP_INTERVAL_MS);

function sweepStaleSessions() {
  sweepUploadRateLimits();
  for (const [clientId, session] of latestSessionByClient.entries()) {
    const lobby = gm.lobbies.get(session.lobbyId);
    if (!lobby || !lobby.players.has(session.playerId)) {
      latestSessionByClient.delete(clientId);
    }
  }
}

setInterval(sweepStaleSessions, SESSION_SWEEP_INTERVAL_MS);

// Drop expired access tokens from data/tokens.json once a day. Capabilities
// are baked into each lobby at creation, so pruning expired tokens cannot
// disrupt active games.
setInterval(() => {
  pruneExpiredTokens()
    .then(removed => { if (removed > 0) console.log(`[tokens] pruned ${removed} expired token(s)`); })
    .catch(err => console.warn('[tokens] prune failed:', err?.message));
}, TOKEN_PRUNE_INTERVAL_MS);

/* ─── REST endpoints ─── */

app.get('/api/server-status', (req, res) => {
  try {
    let activeLobbies = 0, totalPlayers = 0, gamesInProgress = 0;

    for (const lobby of gm.lobbies.values()) {
      const connectedPlayers = [...lobby.players.values()].filter(p => p.socketId !== null).length;
      if (connectedPlayers > 0) {
        activeLobbies++;
        totalPlayers += connectedPlayers;
        if (lobby.state !== 'waiting') gamesInProgress++;
      }
    }

    const uploadsPath = [path.join(process.cwd(), 'uploads'), '/app/uploads', '/uploads'].find(p => fs.existsSync(p));
    let uploadsInfo = { totalFiles: 0, totalSizeMB: 0, orphanedFiles: 0 };

    if (uploadsPath) {
      const referencedFiles = new Set(
        [...gm.lobbies.values()].flatMap(l => (l.photos ?? []).map(p => path.basename(p.url)).filter(Boolean))
      );
      let totalSizeBytes = 0, orphanedCount = 0;
      const files = fs.readdirSync(uploadsPath);

      for (const file of files) {
        try {
          const stats = fs.statSync(path.join(uploadsPath, file));
          if (stats.isDirectory()) continue;
          totalSizeBytes += stats.size;
          if (!referencedFiles.has(file)) orphanedCount++;
        } catch (err) {
          console.warn(`Could not stat file ${file}:`, err.message);
        }
      }

      uploadsInfo = {
        totalFiles: files.length,
        totalSizeMB: parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(2)),
        orphanedFiles: orphanedCount,
      };
    }

    res.json({
      activeLobbies, totalPlayers, gamesInProgress,
      uploadsFolder: uploadsInfo,
      safeToRestart: gamesInProgress === 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in server status endpoint:', error);
    res.status(500).json({ error: 'Failed to get server status' });
  }
});

app.get('/api/game-stats', (req, res) => {
  res.json(gameStats);
});

app.get('/uploads/:filename', (req, res) => {
  res.set({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  });
  const { filename } = req.params;
  const { lobbyId, playerId } = req.query;

  if (!validateInput(filename, 'string', 1, 256)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!validateInput(lobbyId, 'string', 3, 12) || !validateInput(playerId, 'string', 1, 80)) {
    return res.status(401).json({ error: 'Missing or invalid photo access credentials' });
  }

  const normalizedLobbyId = normalizeLobbyId(lobbyId);
  const lobby = gm.lobbies.get(normalizedLobbyId);
  if (!lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }
  if (!isAuthorizedPlayer(lobby, playerId, getSessionToken(req))) {
    return res.status(403).json({ error: 'Invalid photo access session' });
  }

  const safeFilename = path.basename(filename);
  const photoBelongsToLobby = lobby.photos.some(photo => path.basename(photo.url) === safeFilename);
  if (!photoBelongsToLobby) {
    return res.status(404).json({ error: 'Photo not found in this lobby' });
  }

  return res.sendFile(path.join(UPLOADS_DIR, safeFilename));
});

app.post('/api/token/validate', rateLimit('token', 30, 60 * 1000), async (req, res) => {
  const { secret } = req.body || {};
  const token = await validateToken(secret);
  if (!token) return res.json({ valid: false });
  const capabilities = applyToken(token, SERVER_CONFIG.defaults);
  res.json({ valid: true, name: token.name || null, expiresAt: token.expiresAt || null, capabilities });
});

app.post('/api/lobbies', rateLimit('create-lobby', 6, 10 * 60 * 1000), async (req, res) => {
  const { nickname: rawNickname, settings, clientSessionId, tokenSecret } = req.body || {};
  const nickname = normalizeNickname(rawNickname);
  if (!nickname) return res.status(400).json({ error: 'Nickname is required' });

  if (gm.lobbies.size >= SERVER_CONFIG.maxLobbies) {
    return res.status(503).json({ error: 'Server is at capacity', maxLobbies: SERVER_CONFIG.maxLobbies });
  }

  try { validateLobbySettings(settings); } catch (error) { return res.status(400).json({ error: error.message }); }

  const token = await validateToken(tokenSecret);
  const constraints = applyToken(token, SERVER_CONFIG.defaults);

  const { lobby, playerId, sessionToken } = await gm.createLobby({ nickname, socketId: null, settings, constraints, clientSessionId });
  gm.schedulePendingJoinExpiry(lobby.id, playerId, PENDING_JOIN_TIMEOUT_MS);
  gm.setPlayerColor(lobby, playerId, pickAvatarColor(nickname));
  gm.setPlayerIcon(lobby, playerId, pickAvatarIcon(nickname));
  res.json({ lobby: gm.serializeLobby(lobby, playerId), playerId, sessionToken });
});

// Minimal public lobby preview used by invitation links. Lobby IDs are already
// shareable; exposing only the mode lets invitees see which game they are joining.
app.get('/api/lobbies/:lobbyId/public', rateLimit('lobby-preview', 60, 60 * 1000), (req, res) => {
  const lobbyId = normalizeLobbyId(req.params.lobbyId);
  if (!validateInput(lobbyId, 'string', 3, 12)) {
    return res.status(400).json({ error: 'Invalid lobby ID format' });
  }
  const lobby = gm.lobbies.get(lobbyId);
  if (!lobby) return res.status(404).json({ error: 'Lobby not found' });
  return res.json({ id: lobby.id, gameType: lobby.settings.gameType });
});

app.post('/api/lobbies/:lobbyId/join', rateLimit('join-lobby', 30, 60 * 1000), (req, res) => {
  const { nickname: rawNickname, clientSessionId } = req.body || {};
  const nickname = normalizeNickname(rawNickname);
  if (!nickname) return res.status(400).json({ error: 'Nickname is required' });
  const { lobbyId } = req.params;

  if (!validateInput(lobbyId, 'string', 3, 12)) {
    return res.status(400).json({ error: 'Invalid lobby ID format' });
  }

  try {
    const { lobby, playerId, sessionToken } = gm.joinLobby({ lobbyId: lobbyId.toUpperCase(), nickname, socketId: null, clientSessionId });
    gm.schedulePendingJoinExpiry(lobby.id, playerId, PENDING_JOIN_TIMEOUT_MS);
    gm.setPlayerColor(lobby, playerId, pickAvatarColor(nickname));
    gm.setPlayerIcon(lobby, playerId, pickAvatarIcon(nickname));
    res.json({ lobby: gm.serializeLobby(lobby, playerId), playerId, sessionToken });
  } catch (e) {
    const status = e.message === 'Lobby not found' ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

app.post('/api/lobbies/:lobbyId/upload/:playerId', upload.array('photos', MAX_PHOTOS_PER_PLAYER), async (req, res) => {
  const { lobbyId, playerId } = req.params;
  const normalizedLobbyId = normalizeLobbyId(lobbyId);
  const files = req.files;

  if (!validateInput(normalizedLobbyId, 'string', 3, 12)) {
    await cleanupUploadedFiles(files);
    return res.status(400).json({ error: 'Invalid lobby ID format' });
  }
  if (!validateInput(playerId, 'string', 1, 50)) {
    await cleanupUploadedFiles(files);
    return res.status(400).json({ error: 'Invalid player ID format' });
  }
  if (!files?.length) return res.status(400).json({ error: 'No files uploaded' });
  if (!checkUploadRateLimit(playerId)) {
    await cleanupUploadedFiles(files);
    return res.status(429).json({ error: 'Too many upload requests. Please wait before uploading again.' });
  }

  const invalidFiles = files.filter(f => !validateFile(f));
  if (invalidFiles.length > 0) {
    await cleanupUploadedFiles(files);
    return res.status(400).json({
      error: 'Invalid file type or size',
      details: invalidFiles.map(f => ({ filename: f.originalname, error: `Must be an image (jpg, png, gif, webp) under ${UPLOAD_LIMIT_MB}MB` })),
    });
  }

  const lobby = gm.lobbies.get(normalizedLobbyId);
  if (!lobby) {
    await cleanupUploadedFiles(files);
    return res.status(404).json({ error: 'Lobby not found' });
  }
  if (!lobby.players.has(playerId)) {
    await cleanupUploadedFiles(files);
    return res.status(403).json({ error: 'Player not found in this lobby' });
  }
  if (!isAuthorizedPlayer(lobby, playerId, getSessionToken(req))) {
    await cleanupUploadedFiles(files);
    return res.status(403).json({ error: 'Invalid upload session' });
  }
  if (lobby.state !== 'waiting') {
    await cleanupUploadedFiles(files);
    return res.status(409).json({ error: 'Photos can only be uploaded before the game starts' });
  }

  // Use lobby settings for max photos, fallback to server default
  const maxPhotos = lobby.settings?.maxPhotosPerPlayer ?? MAX_PHOTOS_PER_PLAYER;
  const existing = lobby.photos.filter(p => p.uploaderId === playerId).length;
  const remainingSlots = Math.max(0, maxPhotos - existing);
  const acceptedFiles = files.slice(0, remainingSlots);
  const rejectedFiles = files.slice(remainingSlots);
  await cleanupUploadedFiles(rejectedFiles);

  const results = new Array(files.length);
  rejectedFiles.forEach((file, index) => {
    results[acceptedFiles.length + index] = { error: 'Upload limit reached', filename: file.originalname, max: maxPhotos };
  });

  for (let i = 0; i < acceptedFiles.length; i++) {
    const file = acceptedFiles[i];
    try {
      const metadata = await sharp(file.path, { limitInputPixels: 40_000_000 }).metadata();
      if (!['jpeg', 'png', 'gif', 'webp'].includes(metadata.format)) throw new Error('Unsupported or malformed image');
      let lat = null, lon = null;
      const gpsRaw = gameModeDefinition(lobby.settings.gameType).requiresLocation ? req.body.gps?.[i] : null;
      if (gpsRaw) {
        try {
          const parsed = JSON.parse(gpsRaw);
          if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number'
            && parsed.lat >= -90 && parsed.lat <= 90
            && parsed.lon >= -180 && parsed.lon <= 180) {
            lat = parsed.lat;
            lon = parsed.lon;
          }
        } catch (err) {
          console.warn('Invalid GPS payload:', gpsRaw, err.message);
        }
      }

      const id = uuid();
      const url = `/uploads/${file.filename}`;
      
      // Extract captureDate from request body
      let captureDate = null;
      const captureDateRaw = req.body.captureDate?.[i];
      if (captureDateRaw && typeof captureDateRaw === 'string') {
        const normalized = normalizePhotoDate(captureDateRaw);
        if (!normalized && lobby.settings.gameType === 'date') {
          throw new Error('Photo date must use YYYY-MM-DD format');
        }
        if (normalized && normalized > todayUtcDate() && lobby.settings.gameType === 'date') {
          throw new Error('Photo date cannot be in the future');
        }
        if (normalized && normalized <= todayUtcDate()) captureDate = normalized;
      }
      
      const photoData = { id, url, lat, lon, uploaderId: playerId, captureDate };

      gm.upsertPhoto(normalizedLobbyId, photoData);
      results[i] = { ok: true, photo: { id, url, lat, lon, captureDate }, hasGPS: lat !== null };

    } catch (err) {
      console.error('Upload failed:', err);
      await cleanupUploadedFiles([file]);
      const safeError = ['Photo date cannot be in the future', 'Photo date must use YYYY-MM-DD format'].includes(err.message)
        ? err.message
        : 'Failed to process image';
      results[i] = { error: safeError, filename: file.originalname, details: err.message };
    }
  }

  res.json({ results, ignored: rejectedFiles.length });
});

/* ─── Session management ─── */

async function enforceSingleSessionForClient(clientSessionId, nextSession) {
  if (!clientSessionId) return;
  const previous = latestSessionByClient.get(clientSessionId);

  if (!previous) {
    latestSessionByClient.set(clientSessionId, nextSession);
    return;
  }

  const isSameSession = previous.lobbyId === nextSession.lobbyId && previous.playerId === nextSession.playerId;
  if (isSameSession) {
    latestSessionByClient.set(clientSessionId, { ...previous, socketId: nextSession.socketId });
    return;
  }

  try {
    const prevSocket = previous.socketId ? io.sockets.sockets.get(previous.socketId) : null;
    // A create/join action can replace the authenticated session on the same
    // socket. That is normal navigation, not another browser tab taking over.
    if (prevSocket && previous.socketId !== nextSession.socketId) {
      prevSocket.emit('error_msg', 'This session moved to another lobby in your latest tab.');
      prevSocket.leave(previous.lobbyId);
      prevSocket.disconnect(true);
    }
    await gm.leaveLobby(previous.lobbyId, previous.playerId);
  } catch (error) {
    console.warn('Failed to close previous session for client:', error.message);
  }

  latestSessionByClient.set(clientSessionId, nextSession);
}

/* ─── Socket.IO ─── */

io.on('connection', (socket) => {
  // Socket.IO callbacks are optional at the protocol level. Normalize every
  // game packet to an object and add a no-op acknowledgement where a handler
  // expects one, so malformed/truncated packets cannot throw a process-level
  // TypeError. Field-level authorization still happens in each handler.
  const objectPayloadEvents = new Set([
    'join_lobby', 'leave_lobby', 'kick_player', 'update_settings',
    'add_ai_player', 'remove_ai_player', 'get_ai_processing_status', 'set_team',
    'delete_photo', 'update_icon', 'update_photo_location', 'update_photo_details',
    'set_ready', 'start_game', 'request_lobby_sync', 'submit_guess',
    'restart_game', 'next_round', 'reset_lobby',
  ]);
  const acknowledgementEvents = new Set([
    'leave_lobby', 'update_settings', 'get_ai_processing_status',
    'update_photo_details', 'request_lobby_sync', 'submit_guess',
    'next_round', 'reset_lobby',
  ]);
  socket.use((packet, next) => {
    const eventName = packet[0];
    if (objectPayloadEvents.has(eventName)
      && (!packet[1] || typeof packet[1] !== 'object' || Array.isArray(packet[1]))) {
      packet[1] = {};
    }
    if (acknowledgementEvents.has(eventName)
      && typeof packet[packet.length - 1] !== 'function') {
      packet.push(() => {});
    }
    next();
  });

  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const lobbyId = auth.lobbyId || query.lobbyId;
  const playerId = auth.playerId || query.playerId;
  const sessionToken = auth.sessionToken || query.sessionToken;
  const handshakeClientSessionId = auth.clientSessionId || query.clientSessionId || null;

  let currentLobbyId = null;
  let currentPlayerId = null;
  let currentClientSessionId = handshakeClientSessionId;

  const validateSocket = (incomingLobbyId, incomingPlayerId) =>
    !!(currentLobbyId && currentPlayerId
      && currentLobbyId === normalizeLobbyId(incomingLobbyId)
      && currentPlayerId === incomingPlayerId);

  if (lobbyId && playerId) {
    (async () => {
      try {
        const normalizedLobbyId = lobbyId.toUpperCase();
        const reconnectResult = gm.reconnectPlayer({ lobbyId: normalizedLobbyId, playerId, sessionToken, socketId: socket.id, clientSessionId: currentClientSessionId });
        await enforceSingleSessionForClient(currentClientSessionId, { lobbyId: normalizedLobbyId, playerId, socketId: socket.id });
        socket.join(normalizedLobbyId);
        currentLobbyId = normalizedLobbyId;
        currentPlayerId = playerId;
        socket.emit('reconnected', { lobby: gm.serializeLobby(reconnectResult.lobby, playerId), playerId });
        gm.broadcastLobby(normalizedLobbyId);
      } catch (e) {
        console.error('Reconnection failed:', e.message);
        socket.emit('reconnection_failed', { error: e.message });
      }
    })();
  }

  socket.on('join_lobby', async ({ lobbyId, nickname: rawNickname, playerId, sessionToken: incomingSessionToken, clientSessionId }) => {
    const nickname = normalizeNickname(rawNickname);
    try {
      currentClientSessionId = clientSessionId || currentClientSessionId;
      if (!lobbyId || typeof lobbyId !== 'string') throw new Error('Lobby ID is required');
      if (!nickname) throw new Error('Nickname is required');

      const normalizedLobbyId = lobbyId.toUpperCase();
      let lobby;
      let newPlayerId = playerId;

      if (newPlayerId) {
        lobby = gm.lobbies.get(normalizedLobbyId);
        const player = lobby?.players.get(newPlayerId);
        if (!player) throw new Error('Session not found. Please rejoin the lobby.');
        if (!incomingSessionToken || player.sessionToken !== incomingSessionToken) throw new Error('Session not found. Please rejoin the lobby.');
        player.socketId = socket.id;
        if (currentClientSessionId) player.clientSessionId = currentClientSessionId;
        if (player.disconnectTimeoutId) {
          clearTimeout(player.disconnectTimeoutId);
          player.disconnectTimeoutId = null;
        }
      } else {
        const res = gm.joinLobby({ lobbyId: normalizedLobbyId, nickname, socketId: socket.id, clientSessionId: currentClientSessionId });
        lobby = res.lobby;
        newPlayerId = res.playerId;
        incomingSessionToken = res.sessionToken;
        gm.setPlayerColor(lobby, newPlayerId, pickAvatarColor(nickname));
        gm.setPlayerIcon(lobby, newPlayerId, pickAvatarIcon(nickname));
      }

      if (!lobby) throw new Error('Lobby not found');

      await enforceSingleSessionForClient(currentClientSessionId, { lobbyId: normalizedLobbyId, playerId: newPlayerId, socketId: socket.id });
      socket.join(normalizedLobbyId);
      currentLobbyId = normalizedLobbyId;
      currentPlayerId = newPlayerId;
      socket.emit('joined', { lobby: gm.serializeLobby(lobby, newPlayerId), playerId: newPlayerId, sessionToken: incomingSessionToken });
      gm.broadcastLobby(normalizedLobbyId);
    } catch (e) {
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('leave_lobby', async ({ lobbyId, playerId }, callback) => {
    try {
      const normalizedLobbyId = normalizeLobbyId(lobbyId);
      if (!validateSocket(normalizedLobbyId, playerId)) {
        return callback({ success: false, error: 'Invalid socket' });
      }
      await gm.leaveLobby(normalizedLobbyId, playerId);
      if (currentClientSessionId) {
        const tracked = latestSessionByClient.get(currentClientSessionId);
        if (tracked?.lobbyId === normalizedLobbyId && tracked?.playerId === playerId) {
          latestSessionByClient.delete(currentClientSessionId);
        }
      }
      socket.leave(normalizedLobbyId);
      currentLobbyId = null;
      currentPlayerId = null;
      callback({ success: true });
    } catch (error) {
      console.error('Error leaving lobby:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('kick_player', ({ lobbyId, hostId, playerIdToKick }) => {
    if (!validateSocket(lobbyId, hostId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === hostId) gm.kickPlayer(lobbyId, playerIdToKick);
  });

  socket.on('update_settings', ({ lobbyId, playerId, settings }, callback) => {
    if (!validateSocket(lobbyId, playerId)) return callback?.({ success: false, error: 'Invalid socket' });
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) {
      try {
        gm.updateSettings(lobbyId, validateLobbySettings(settings));
        callback?.({ success: true });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    } else {
      callback?.({ success: false, error: 'Only the host can update settings' });
    }
  });

  socket.on('add_ai_player', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId && lobby.state === 'waiting') {
      try { gm.addAIPlayer(lobbyId); } catch (e) { socket.emit('error_msg', e.message); }
    }
  });

  socket.on('remove_ai_player', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId && lobby.state === 'waiting') gm.removeAIPlayer(lobbyId);
  });

  socket.on('get_ai_processing_status', ({ lobbyId }, callback) => {
    try {
      if (!currentPlayerId || !validateSocket(lobbyId, currentPlayerId)) {
        return callback?.({ processed: 0, total: 0, stage: 'unavailable', isReady: false });
      }
      callback?.(gm.getAIProcessingStatus(lobbyId));
    } catch (e) {
      console.error('Error getting AI processing status:', e);
      callback?.({ processed: 0, total: 0, stage: 'complete', isReady: true });
    }
  });

  socket.on('set_team', ({ lobbyId, playerId, team }) => {
    const normalizedLobbyId = normalizeLobbyId(lobbyId);
    const lobby = gm.lobbies.get(normalizedLobbyId);
    if (!lobby) return;
    if (lobby.state !== 'waiting') return;
    if (!validateSocket(normalizedLobbyId, playerId) && lobby.hostId !== currentPlayerId) return;
    if (!['Team 1', 'Team 2', null].includes(team)) {
      socket.emit('error_msg', 'Invalid team assignment');
      return;
    }
    const player = lobby.players.get(playerId);
    if (player) { player.team = team; gm.broadcastLobby(normalizedLobbyId); }
  });

  socket.on('delete_photo', ({ lobbyId, playerId, photoId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(normalizeLobbyId(lobbyId));
    if (lobby?.state !== 'waiting') return;
    gm.deletePhoto(normalizeLobbyId(lobbyId), playerId, photoId)
      .catch(error => console.warn('Failed to delete photo:', error?.message));
  });

  socket.on('update_icon', ({ lobbyId, playerId, icon }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    if (!AVATAR_ICONS.includes(icon)) return;
    const lobby = gm.lobbies.get(normalizeLobbyId(lobbyId));
    if (!lobby) return;
    gm.setPlayerIcon(lobby, playerId, icon);
    gm.broadcastLobby(normalizeLobbyId(lobbyId));
  });

  socket.on('update_photo_location', ({ lobbyId, playerId, photoId, lat, lon }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    try {
      if (!isValidCoordinate(lat, lon)) {
        socket.emit('error_msg', 'Invalid coordinates. Please select a valid location on the map.');
        return;
      }
      const lobby = gm.lobbies.get(lobbyId);
      if (!lobby) return;
      if (lobby.state !== 'waiting') return;
      if (!gameModeDefinition(lobby.settings.gameType).requiresLocation) {
        socket.emit('error_msg', 'Locations are not used in this game mode');
        return;
      }
      const photo = lobby.photos.find(p => p.id === photoId && p.uploaderId === playerId);
      if (!photo) return;
      photo.lat = lat;
      photo.lon = lon;
      photo.manualLocation = true;
      gm._invalidateLocationCaches(photoId);
      gm._invalidateModeDependentCaches(photo);
      if (lobby.settings.visionCommentary) {
        gm._markAINotReady(lobbyId);
        gm.prefetchVisionCommentary(photo.id, photo, lobbyId)
          .catch(err => console.error(`AI commentary refresh failed for photo ${photo.id}:`, err.message));
      }
      if (lobby.settings.autoNameImages) {
        gm.prefetchAutoNaming(photo.id, photo, lobbyId)
          .catch(err => console.error(`AI title refresh failed for photo ${photo.id}:`, err.message));
      }
      gm.broadcastLobby(lobbyId);
      io.to(lobbyId).emit('ai_processing_status', gm.getAIProcessingStatus(lobbyId));
    } catch (e) {
      console.error('Failed to update photo location:', e);
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('update_photo_details', ({ lobbyId, playerId, photoId, title, hint }, callback) => {
    if (!validateSocket(lobbyId, playerId)) return callback?.({ success: false, error: 'Invalid socket' });
    try {
      const lobby = gm.lobbies.get(lobbyId);
      if (!lobby) return callback?.({ success: false, error: 'Lobby not found' });
      if (lobby.state !== 'waiting') return callback?.({ success: false, error: 'Photo details are locked after the game starts' });
      const photo = lobby.photos.find(p => p.id === photoId && p.uploaderId === playerId);
      if (!photo) return callback?.({ success: false, error: 'Photo not found' });
      photo.title = String(title || '').slice(0, 50);
      photo.hint = String(hint || '').slice(0, 80);
      gm.broadcastLobby(lobbyId);
      callback?.({ success: true });
    } catch (e) {
      console.error('Failed to update photo details:', e);
      callback?.({ success: false, error: e.message });
    }
  });

  socket.on('update_photo_date', ({ lobbyId, playerId, photoId, captureDate }, callback) => {
    if (!validateSocket(lobbyId, playerId)) return callback?.({ success: false, error: 'Invalid socket' });
    try {
      const normalized = gm.updatePhotoDate(lobbyId, playerId, photoId, captureDate);
      callback?.({ success: true, captureDate: normalized });
    } catch (e) {
      callback?.({ success: false, error: e.message });
    }
  });

  socket.on('set_ready', ({ lobbyId, playerId, ready }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    if (typeof ready !== 'boolean') return;
    try { gm.setReady(lobbyId, playerId, ready); } catch (e) {
      console.error('Failed to set ready status:', e);
    }
  });

  socket.on('start_game', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== playerId) return;
    if (lobby.state !== 'waiting') {
      socket.emit('error_msg', 'Game is already in progress or finished');
      return;
    }
    try { gm.startGame(lobbyId); } catch (e) {
      console.error('Failed to start game:', e);
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('request_lobby_sync', ({ lobbyId, playerId }, callback) => {
    try {
      if (!validateSocket(lobbyId, playerId)) return callback?.({ success: false, error: 'Invalid socket' });
      const lobby = gm.lobbies.get(lobbyId);
      if (!lobby) return callback?.({ success: false, error: 'Lobby not found' });
      callback?.({ success: true, lobby: gm.serializeLobby(lobby, playerId) });
    } catch (error) {
      callback?.({ success: false, error: error?.message || 'Sync failed' });
    }
  });

  socket.on('submit_guess', ({ lobbyId, playerId, lat, lon, date, uploaderId }, callback) => {
    if (!validateSocket(lobbyId, playerId)) return callback?.({ success: false, error: 'Invalid socket' });
    try {
      const lobby = gm.lobbies.get(normalizeLobbyId(lobbyId));
      const guessKind = gameModeDefinition(lobby?.settings.gameType).guessKind;
      if (guessKind === 'location' && !isValidCoordinate(lat, lon)) {
        return callback?.({ success: false, error: 'Invalid guess location' });
      }
      const guess = guessKind === 'date' ? { date }
        : guessKind === 'player' ? { uploaderId }
          : { lat, lon };
      const result = gm.submitGuess(lobbyId, playerId, guess);
      callback?.({ success: result.accepted, duplicate: result.duplicate, error: result.error });
    } catch (e) {
      console.error('Submit guess error:', e);
      callback?.({ success: false, error: e.message });
    }
  });

  socket.on('restart_game', async ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) {
      try {
        await gm.restartGame(lobbyId);
      } catch (e) {
        console.error('Failed to restart game:', e);
        socket.emit('error_msg', e.message);
      }
    }
  });

  socket.on('next_round', async ({ lobbyId, playerId }, callback) => {
    try {
      if (!validateSocket(lobbyId, playerId)) return callback({ success: false, error: 'Invalid socket' });
      const lobby = gm.lobbies.get(lobbyId);
      if (lobby?.hostId === playerId) {
        await gm.nextRound(lobbyId);
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Lobby not found or not host' });
      }
    } catch (error) {
      console.error('Error starting next round:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('reset_lobby', async ({ lobbyId, playerId }, callback) => {
    try {
      const normalizedLobbyId = normalizeLobbyId(lobbyId);
      if (!validateSocket(normalizedLobbyId, playerId)) return callback({ success: false, error: 'Invalid socket' });
      const lobby = gm.lobbies.get(normalizedLobbyId);
      if (!lobby) return callback({ success: false, error: 'Lobby not found' });
      // Returning is a shared transition: the first player performs the reset
      // and concurrent clicks simply wait for the same lobby update.
      if (lobby.state === 'waiting' || lobby.isResetting) {
        return callback({ success: true });
      }
      if (lobby.state !== 'finished') {
        return callback({ success: false, error: 'The game must be finished before returning to the lobby' });
      }
      lobby.isResetting = true;
      await gm.resetLobby(normalizedLobbyId);
      callback({ success: true });
    } catch (error) {
      console.error('Error resetting lobby:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    if (currentClientSessionId) {
      const tracked = latestSessionByClient.get(currentClientSessionId);
      if (tracked?.socketId === socket.id) {
        latestSessionByClient.set(currentClientSessionId, { ...tracked, socketId: null });
      }
    }

    if (currentLobbyId && currentPlayerId) {
      const lobby = gm.lobbies.get(currentLobbyId);
      const player = lobby?.players.get(currentPlayerId);
      if (player) {
        player.socketId = null;
        player.disconnectTimeoutId = setTimeout(() => {
          const activeLobby = gm.lobbies.get(currentLobbyId);
          const activePlayer = activeLobby?.players.get(currentPlayerId);
          if (activePlayer?.socketId === null) {
            gm.leaveLobby(currentLobbyId, currentPlayerId)
              .then(() => gm.broadcastLobby(currentLobbyId))
              .catch(err => console.warn(`[disconnect] leaveLobby failed for ${currentPlayerId}:`, err?.message));
          }
        }, SOCKET_DISCONNECT_TIMEOUT_MS);
      }
    }
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

/* ─── Process error guards ─── */

process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

server.listen(PORT, () => {
  console.log(`SpotTheShot server on http://localhost:${PORT}`);
});
