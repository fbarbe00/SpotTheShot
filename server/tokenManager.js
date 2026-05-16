/**
 * Access token manager.
 * Tokens are stored in data/tokens.json (backed by a Docker volume in production).
 *
 * Token schema:
 * {
 *   "id": "uuid",
 *   "secret": "long-random-string",
 *   "name": "Human-readable label",
 *   "expiresAt": 1234567890000,  // ms epoch, or null/omit for never
 *   "maxPlayersPerLobby": 50,
 *   "maxPhotosPerPlayer": 20,
 *   "allowAllMaps": true,
 *   "allowAIGuessing": true,
 *   "allowAutoNaming": true,
 *   "allowVisionCommentary": true
 * }
 *
 * Any field can be omitted — the server default fills in the gap.
 */

import fs from 'fs/promises';
import path from 'path';

const TOKENS_FILE = path.join(process.cwd(), 'data', 'tokens.json');

async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns the token object if the secret is valid and not expired, null otherwise.
 */
export async function validateToken(secret) {
  if (!secret || typeof secret !== 'string' || secret.length < 16 || secret.length > 256) return null;
  const tokens = await loadTokens();
  const token = tokens.find(t => t.secret === secret);
  if (!token) return null;
  if (token.expiresAt && Date.now() > token.expiresAt) return null;
  return token;
}

/**
 * Rewrite tokens.json without entries whose expiresAt is in the past.
 * Safe to call while games are in progress: token capabilities are baked into
 * each lobby at creation time (via applyToken) and never re-checked, so
 * removing an already-expired token here cannot disrupt an active session.
 * Returns the number of pruned entries.
 */
export async function pruneExpiredTokens() {
  const tokens = await loadTokens();
  if (tokens.length === 0) return 0;
  const now = Date.now();
  const kept = tokens.filter(t => !t.expiresAt || t.expiresAt > now);
  if (kept.length === tokens.length) return 0;
  const tmp = `${TOKENS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(kept, null, 2), 'utf8');
  await fs.rename(tmp, TOKENS_FILE);
  return tokens.length - kept.length;
}

/**
 * Merge token capabilities with server defaults.
 * Token fields win over defaults; missing token fields fall back to defaults.
 */
export function applyToken(token, defaults) {
  if (!token) return { ...defaults };
  return {
    maxPlayersPerLobby:    token.maxPlayersPerLobby    ?? defaults.maxPlayersPerLobby,
    maxPhotosPerPlayer:    token.maxPhotosPerPlayer    ?? defaults.maxPhotosPerPlayer,
    allowAllMaps:          token.allowAllMaps          ?? defaults.allowAllMaps,
    allowAIGuessing:       token.allowAIGuessing       ?? defaults.allowAIGuessing,
    allowAutoNaming:       token.allowAutoNaming       ?? defaults.allowAutoNaming,
    allowVisionCommentary: token.allowVisionCommentary ?? defaults.allowVisionCommentary,
  };
}
