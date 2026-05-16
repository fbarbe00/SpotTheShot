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
import { GameManager } from './game.js';
import { pickAvatarColor, pickAvatarIcon, AVATAR_ICONS, isValidCoordinate } from './utils.js';
import { SERVER_CONFIG } from './config.js';
import { validateToken, applyToken, pruneExpiredTokens } from './tokenManager.js';

dotenv.config();

const PORT = 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const ROUND_DURATION_SEC = Number(process.env.ROUND_DURATION_SEC || 30);
const UPLOAD_LIMIT_MB = Number(process.env.UPLOAD_LIMIT_MB || 20);
const MAX_PHOTOS_PER_PLAYER = Number(process.env.MAX_PHOTOS_PER_PLAYER || 10);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const GAME_STATS_FILE = process.env.GAME_STATS_FILE || path.join(DATA_DIR, 'game-stats.json');
const PENDING_JOIN_TIMEOUT_MS = 5 * 60 * 1000;
const SOCKET_DISCONNECT_TIMEOUT_MS = 30 * 60 * 1000;
const EMPTY_LOBBY_GRACE_MS = 3 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;
const TOKEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const VALID_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'ru'];
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const MAX_NICKNAME_LENGTH = 30;

const app = express();
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
  limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 },
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

/* ─── Lobby cleanup ─── */

async function cleanupEmptyLobbies() {
  const now = Date.now();
  const toDelete = [];

  for (const [lobbyId, lobby] of gm.lobbies.entries()) {
    const hasActivePlayers = [...lobby.players.values()].some(
      p => p.socketId !== null || p.disconnectTimeoutId !== null
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

  for (const { lobbyId, lobby } of toDelete) {
    await Promise.all((lobby.photos ?? []).map(async photo => {
      const filePath = path.join(UPLOADS_DIR, path.basename(photo.url));
      await fs.promises.unlink(filePath).catch(err => {
        if (err.code !== 'ENOENT') console.error(`Failed to delete photo ${photo.url}:`, err.message);
      });
      gm._invalidatePhotoCaches(photo.id);
    }));
    gm.lobbies.delete(lobbyId);
    emptyLobbyTimestamps.delete(lobbyId);
  }
}

setInterval(cleanupEmptyLobbies, CLEANUP_INTERVAL_MS);

function sweepStaleSessions() {
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
  if (!lobby.players.has(playerId)) {
    return res.status(403).json({ error: 'Player is not in this lobby' });
  }

  const safeFilename = path.basename(filename);
  const photoBelongsToLobby = lobby.photos.some(photo => path.basename(photo.url) === safeFilename);
  if (!photoBelongsToLobby) {
    return res.status(404).json({ error: 'Photo not found in this lobby' });
  }

  return res.sendFile(path.join(UPLOADS_DIR, safeFilename));
});

app.post('/api/token/validate', async (req, res) => {
  const { secret } = req.body || {};
  const token = await validateToken(secret);
  if (!token) return res.json({ valid: false });
  const capabilities = applyToken(token, SERVER_CONFIG.defaults);
  res.json({ valid: true, name: token.name || null, expiresAt: token.expiresAt || null, capabilities });
});

app.post('/api/lobbies', async (req, res) => {
  const { nickname: rawNickname, settings, clientSessionId, tokenSecret } = req.body || {};
  const nickname = String(rawNickname || '').trim().slice(0, MAX_NICKNAME_LENGTH);

  if (gm.lobbies.size >= SERVER_CONFIG.maxLobbies) {
    return res.status(503).json({ error: 'Server is at capacity', maxLobbies: SERVER_CONFIG.maxLobbies });
  }

  if (settings) {
    if (settings.roundDurationSec !== undefined && !validateInput(settings.roundDurationSec, 'number', 10, 300)) {
      return res.status(400).json({ error: 'roundDurationSec must be a number between 10 and 300' });
    }
    if (settings.gameMode !== undefined && !['individual', 'teams'].includes(settings.gameMode)) {
      return res.status(400).json({ error: 'gameMode must be either "individual" or "teams"' });
    }
    if (settings.timerMode !== undefined && !['fixed', 'progressive'].includes(settings.timerMode)) {
      return res.status(400).json({ error: 'timerMode must be either "fixed" or "progressive"' });
    }
    if (settings.language !== undefined && !VALID_LANGUAGES.includes(String(settings.language).toLowerCase())) {
      return res.status(400).json({ error: `language must be one of: ${VALID_LANGUAGES.join(', ')}` });
    }
  }

  const token = await validateToken(tokenSecret);
  const constraints = applyToken(token, SERVER_CONFIG.defaults);

  const { lobby, playerId } = await gm.createLobby({ nickname, socketId: null, settings, constraints, clientSessionId });
  gm.schedulePendingJoinExpiry(lobby.id, playerId, PENDING_JOIN_TIMEOUT_MS);
  gm.setPlayerColor(lobby, playerId, pickAvatarColor(nickname));
  gm.setPlayerIcon(lobby, playerId, pickAvatarIcon(nickname));
  res.json({ lobby: gm.serializeLobby(lobby, playerId), playerId });
});

app.post('/api/lobbies/:lobbyId/join', (req, res) => {
  const { nickname: rawNickname, clientSessionId } = req.body || {};
  const nickname = String(rawNickname || '').trim().slice(0, MAX_NICKNAME_LENGTH);
  const { lobbyId } = req.params;

  if (!validateInput(lobbyId, 'string', 3, 12)) {
    return res.status(400).json({ error: 'Invalid lobby ID format' });
  }

  try {
    const { lobby, playerId } = gm.joinLobby({ lobbyId: lobbyId.toUpperCase(), nickname, socketId: null, clientSessionId });
    gm.schedulePendingJoinExpiry(lobby.id, playerId, PENDING_JOIN_TIMEOUT_MS);
    gm.setPlayerColor(lobby, playerId, pickAvatarColor(nickname));
    gm.setPlayerIcon(lobby, playerId, pickAvatarIcon(nickname));
    res.json({ lobby: gm.serializeLobby(lobby, playerId), playerId });
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

  // Use lobby settings for max photos, fallback to server default
  const maxPhotos = lobby.settings?.maxPhotosPerPlayer ?? MAX_PHOTOS_PER_PLAYER;
  const existing = lobby.photos.filter(p => p.uploaderId === playerId).length;
  const remainingSlots = Math.max(0, maxPhotos - existing);
  const acceptedFiles = files.slice(0, remainingSlots);
  const rejectedFiles = files.slice(remainingSlots);
  await cleanupUploadedFiles(rejectedFiles);

  const results = rejectedFiles.map(f => ({ error: 'Upload limit reached', filename: f.originalname, max: maxPhotos }));

  for (let i = 0; i < acceptedFiles.length; i++) {
    const file = acceptedFiles[i];
    try {
      let lat = null, lon = null;
      const gpsRaw = req.body.gps?.[i];
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
        // Validate that it looks like a reasonable date string
        const date = new Date(captureDateRaw);
        if (!isNaN(date.getTime())) {
          captureDate = captureDateRaw;
        }
      }
      
      const photoData = { id, url, lat, lon, uploaderId: playerId, captureDate };

      gm.upsertPhoto(normalizedLobbyId, photoData);
      results.push({ ok: true, photo: { id, url, lat, lon, captureDate }, hasGPS: lat !== null });

      if (lobby.settings?.enableAIGuessing) {
        gm.prefetchAIPrediction(id, photoData, normalizedLobbyId).catch(err =>
          console.error(`AI prefetch failed for photo ${id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('Upload failed:', err);
      await cleanupUploadedFiles([file]);
      results.push({ error: 'Failed to process image', filename: file.originalname, details: err.message });
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
    if (prevSocket) {
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
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const lobbyId = auth.lobbyId || query.lobbyId;
  const playerId = auth.playerId || query.playerId;
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
        const reconnectResult = gm.reconnectPlayer({ lobbyId: normalizedLobbyId, playerId, socketId: socket.id, clientSessionId: currentClientSessionId });
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

  socket.on('join_lobby', async ({ lobbyId, nickname: rawNickname, playerId, clientSessionId }) => {
    const nickname = String(rawNickname || '').trim().slice(0, MAX_NICKNAME_LENGTH);
    try {
      currentClientSessionId = clientSessionId || currentClientSessionId;
      if (!lobbyId || typeof lobbyId !== 'string') throw new Error('Lobby ID is required');

      const normalizedLobbyId = lobbyId.toUpperCase();
      let lobby;
      let newPlayerId = playerId;

      if (newPlayerId) {
        lobby = gm.lobbies.get(normalizedLobbyId);
        const player = lobby?.players.get(newPlayerId);
        if (!player) throw new Error('Session not found. Please rejoin the lobby.');
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
        gm.setPlayerColor(lobby, newPlayerId, pickAvatarColor(nickname));
        gm.setPlayerIcon(lobby, newPlayerId, pickAvatarIcon(nickname));
      }

      if (!lobby) throw new Error('Lobby not found');

      await enforceSingleSessionForClient(currentClientSessionId, { lobbyId: normalizedLobbyId, playerId: newPlayerId, socketId: socket.id });
      socket.join(normalizedLobbyId);
      currentLobbyId = normalizedLobbyId;
      currentPlayerId = newPlayerId;
      socket.emit('joined', { lobby: gm.serializeLobby(lobby, newPlayerId), playerId: newPlayerId });
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

  socket.on('update_settings', ({ lobbyId, playerId, settings }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) gm.updateSettings(lobbyId, settings);
  });

  socket.on('add_ai_player', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) {
      try { gm.addAIPlayer(lobbyId); } catch (e) { socket.emit('error_msg', e.message); }
    }
  });

  socket.on('remove_ai_player', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) gm.removeAIPlayer(lobbyId);
  });

  socket.on('get_ai_processing_status', ({ lobbyId }, callback) => {
    try {
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
    gm.deletePhoto(lobbyId, playerId, photoId);
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
      const photo = lobby.photos.find(p => p.id === photoId && p.uploaderId === playerId);
      if (!photo) return;
      photo.lat = lat;
      photo.lon = lon;
      photo.manualLocation = true;
      gm._invalidateLocationCaches(photoId);
      gm.broadcastLobby(lobbyId);
      io.to(lobbyId).emit('ai_processing_status', gm.getAIProcessingStatus(lobbyId));
    } catch (e) {
      console.error('Failed to update photo location:', e);
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('update_photo_details', ({ lobbyId, playerId, photoId, title, hint }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    try {
      const lobby = gm.lobbies.get(lobbyId);
      if (!lobby) return;
      const photo = lobby.photos.find(p => p.id === photoId && p.uploaderId === playerId);
      if (!photo) return;
      photo.title = String(title || '').slice(0, 50);
      photo.hint = String(hint || '').slice(0, 80);
      gm.broadcastLobby(lobbyId);
    } catch (e) {
      console.error('Failed to update photo details:', e);
      socket.emit('error_msg', e.message);
    }
  });

  socket.on('set_ready', ({ lobbyId, playerId, ready }) => {
    if (!validateSocket(lobbyId, playerId)) return;
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

  socket.on('submit_guess', ({ lobbyId, playerId, lat, lon }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    try {
      if (!isValidCoordinate(lat, lon)) { socket.emit('error_msg', 'Invalid guess location.'); return; }
      gm.submitGuess(lobbyId, playerId, { lat, lon });
    } catch (e) {
      console.error('Submit guess error:', e);
    }
  });

  socket.on('restart_game', ({ lobbyId, playerId }) => {
    if (!validateSocket(lobbyId, playerId)) return;
    const lobby = gm.lobbies.get(lobbyId);
    if (lobby?.hostId === playerId) {
      try {
        gm.restartGame(lobbyId);
      } catch (e) {
        console.error('Failed to restart game:', e);
        socket.emit('error_msg', e.message);
      }
    }
  });

  socket.on('next_round', ({ lobbyId, playerId }, callback) => {
    try {
      if (!validateSocket(lobbyId, playerId)) return callback({ success: false, error: 'Invalid socket' });
      const lobby = gm.lobbies.get(lobbyId);
      if (lobby?.hostId === playerId) {
        gm.nextRound(lobbyId);
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Lobby not found or not host' });
      }
    } catch (error) {
      console.error('Error starting next round:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('reset_lobby', ({ lobbyId, playerId }, callback) => {
    try {
      const normalizedLobbyId = normalizeLobbyId(lobbyId);
      if (!validateSocket(normalizedLobbyId, playerId)) return callback({ success: false, error: 'Invalid socket' });
      const lobby = gm.lobbies.get(normalizedLobbyId);
      if (!lobby) return callback({ success: false, error: 'Lobby not found' });
      if (lobby.state !== 'finished' && lobby.hostId !== playerId) {
        return callback({ success: false, error: 'Only host can reset lobby' });
      }
      gm.resetLobby(normalizedLobbyId);
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
});

server.listen(PORT, () => {
  console.log(`SpotTheShot server on http://localhost:${PORT}`);
});
