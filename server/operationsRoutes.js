import crypto from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const PROBE_TIMEOUT_MS = 2500;

function constantTimeEqual(actual, expected) {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function probe(name, url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { name, available: response.ok, status: response.status, latencyMs: Date.now() - started };
  } catch (error) {
    return { name, available: false, error: error.name === 'AbortError' ? 'timeout' : 'unreachable', latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOperationsRouter({ gm, gameStats, uploadsDir }) {
  const router = express.Router();
  const adminToken = process.env.ADMIN_TOKEN || '';
  const geoclipUrl = process.env.GEOCLIP_URL || 'http://geoclip:8000';
  const visionUrl = process.env.VISION_URL || 'http://vision:8001';
  let services = {
    checkedAt: null,
    geoclip: { name: 'GeoCLIP', available: false, error: 'not_checked' },
    vision: { name: 'Vision', available: false, error: 'not_checked' },
  };

  async function refreshServices() {
    const [geoclip, vision] = await Promise.all([
      probe('GeoCLIP', `${geoclipUrl}/openapi.json`),
      probe('Vision', `${visionUrl}/health`),
    ]);
    services = { checkedAt: new Date().toISOString(), geoclip, vision };
    return services;
  }

  const refreshTimer = setInterval(refreshServices, 15000);
  refreshTimer.unref();
  refreshServices().catch(() => {});

  function requireAdmin(req, res, next) {
    if (!adminToken) return res.status(503).json({ error: 'Admin access is not configured' });
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!constantTimeEqual(supplied, adminToken)) return res.status(401).json({ error: 'Invalid admin credentials' });
    next();
  }

  function referencedUploads() {
    return new Set([...gm.lobbies.values()].flatMap(lobby =>
      (lobby.photos || []).map(photo => path.basename(photo.url || '')).filter(Boolean)
    ));
  }

  async function uploadSummary() {
    const referenced = referencedUploads();
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
    let totalSizeBytes = 0;
    let orphanedFiles = 0;
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const stat = await fs.stat(path.join(uploadsDir, entry.name)).catch(() => null);
      totalSizeBytes += stat?.size || 0;
      if (!referenced.has(entry.name)) orphanedFiles++;
    }
    return { totalFiles: entries.filter(entry => entry.isFile()).length, totalSizeMB: +(totalSizeBytes / 1048576).toFixed(2), orphanedFiles };
  }

  // Public, intentionally coarse service availability powers the in-game
  // degraded-mode banner. Hostnames, errors and operational counts stay admin-only.
  router.get('/services-status', (req, res) => res.json({
    checkedAt: services.checkedAt,
    geoclip: { available: services.geoclip.available },
    vision: { available: services.vision.available },
  }));

  router.use('/admin', requireAdmin);
  router.get('/admin/overview', async (req, res) => {
    const lobbies = [...gm.lobbies.values()].filter(lobby =>
      [...lobby.players.values()].some(player => player.socketId)
    ).map(lobby => ({
      id: lobby.id,
      state: lobby.state,
      gameType: lobby.settings.gameType,
      players: [...lobby.players.values()].filter(player => player.socketId).length,
      photos: lobby.photos.length,
      round: lobby.roundIndex + 1,
      createdAt: lobby.createdAt || null,
    }));
    const games = gameStats.games || [];
    const modeCounts = games.reduce((counts, game) => {
      const mode = game.settings?.gameType || game.gameType || 'unknown';
      counts[mode] = (counts[mode] || 0) + 1;
      return counts;
    }, {});
    res.json({
      health: { status: 'ok', uptimeSec: Math.floor(process.uptime()), timestamp: new Date().toISOString() },
      services,
      lobbies,
      uploads: await uploadSummary(),
      statistics: { totalGamesPlayed: gameStats.totalGamesPlayed, retainedGames: games.length, modeCounts, updatedAt: gameStats.updatedAt },
    });
  });

  router.post('/admin/refresh-models', async (req, res) => res.json(await refreshServices()));
  router.post('/admin/cleanup-orphans', async (req, res) => {
    const referenced = referencedUploads();
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
    const cutoff = Date.now() - 10 * 60 * 1000; // Do not race uploads currently being processed.
    const removed = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.') || referenced.has(entry.name)) continue;
      const target = path.join(uploadsDir, entry.name);
      const stat = await fs.stat(target).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) {
        await fs.unlink(target).catch(() => null);
        removed.push(entry.name);
      }
    }
    res.json({ removedCount: removed.length });
  });

  return router;
}
