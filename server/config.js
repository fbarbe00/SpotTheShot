/**
 * Server-wide limits and defaults.
 * Edit this file or set the corresponding environment variables to change behavior.
 * All env vars accept 'false' as string to disable boolean flags.
 */

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export const SERVER_CONFIG = {
  // Maximum simultaneous active lobbies on this server
  maxLobbies: positiveInt(process.env.MAX_LOBBIES, 5, 1000),

  // Default per-lobby constraints applied when no access token is presented.
  // A valid token can override any of these upward.
  defaults: {
    maxPlayersPerLobby:    positiveInt(process.env.DEFAULT_MAX_PLAYERS, 20, 1000),
    maxPhotosPerPlayer:    positiveInt(process.env.DEFAULT_MAX_PHOTOS_PER_PLAYER, 10, 100),
    allowAllMaps:          process.env.DEFAULT_ALLOW_ALL_MAPS          !== 'false',
    allowAIGuessing:       process.env.DEFAULT_ALLOW_AI_GUESSING       !== 'false',
    allowAutoNaming:       process.env.DEFAULT_ALLOW_AUTO_NAMING       !== 'false',
    allowVisionCommentary: process.env.DEFAULT_ALLOW_VISION_COMMENTARY !== 'false',
  },
};
