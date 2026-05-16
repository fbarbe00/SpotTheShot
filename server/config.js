/**
 * Server-wide limits and defaults.
 * Edit this file or set the corresponding environment variables to change behavior.
 * All env vars accept 'false' as string to disable boolean flags.
 */

export const SERVER_CONFIG = {
  // Maximum simultaneous active lobbies on this server
  maxLobbies: parseInt(process.env.MAX_LOBBIES || '5', 10),

  // Default per-lobby constraints applied when no access token is presented.
  // A valid token can override any of these upward.
  defaults: {
    maxPlayersPerLobby:    parseInt(process.env.DEFAULT_MAX_PLAYERS            || '20',  10),
    maxPhotosPerPlayer:    parseInt(process.env.DEFAULT_MAX_PHOTOS_PER_PLAYER  || '10',  10),
    allowAllMaps:          process.env.DEFAULT_ALLOW_ALL_MAPS          !== 'false',
    allowAIGuessing:       process.env.DEFAULT_ALLOW_AI_GUESSING       !== 'false',
    allowAutoNaming:       process.env.DEFAULT_ALLOW_AUTO_NAMING       !== 'false',
    allowVisionCommentary: process.env.DEFAULT_ALLOW_VISION_COMMENTARY !== 'false',
  },
};
