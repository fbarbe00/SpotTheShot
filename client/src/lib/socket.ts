import { io } from 'socket.io-client';
import { logger } from './logger';

// Derive server URL from current window location at runtime
// This eliminates the need to rebuild the client when the server URL changes
export const SERVER_URL = window.location.origin;
const CLIENT_SESSION_KEY = 'geo-snap-clientSessionId';
const PLAYER_SESSION_KEY = 'geo-snap-playerSessionToken';
const TOKEN_KEY = 'spottheshot_access_token';

export function getStoredToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setStoredToken(secret: string): void {
  try { window.localStorage.setItem(TOKEN_KEY, secret); } catch { /* ignore */ }
}
export function clearStoredToken(): void {
  try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function setPlayerSessionToken(token: string): void {
  try { window.localStorage.setItem(PLAYER_SESSION_KEY, token); } catch { /* ignore */ }
}
export function getPlayerSessionToken(): string | null {
  try { return window.localStorage.getItem(PLAYER_SESSION_KEY); } catch { return null; }
}
export function clearPlayerSessionToken(): void {
  try { window.localStorage.removeItem(PLAYER_SESSION_KEY); } catch { /* ignore */ }
}

// Settings type for lobby creation
interface LobbySettings {
  roundDurationSec?: number;
  gameMode?: 'individual' | 'teams';
  timerMode?: 'fixed' | 'progressive';
  hintThresholdSec?: number;
  enableAIGuessing?: boolean;
  visionCommentary?: boolean;
  autoNameImages?: boolean;
  uploaderPenaltyPercent?: number;
  minPhotosPerPlayer?: number;
  maxPhotosPerPlayer?: number;
  duelRaceTimeSec?: number;
  language?: string;
  showImageDate?: boolean;
}

// Helper to get session from localStorage
function getSession() {
  try {
    const lobbyId = window.localStorage.getItem('geo-snap-lobbyId');
    const playerId = window.localStorage.getItem('geo-snap-playerId');
    return { lobbyId, playerId, sessionToken: getPlayerSessionToken(), clientSessionId: getClientSessionId() };
  } catch {
    return { lobbyId: null, playerId: null, sessionToken: null, clientSessionId: null };
  }
}

export function getClientSessionId() {
  try {
    let clientSessionId = window.localStorage.getItem(CLIENT_SESSION_KEY);
    if (!clientSessionId) {
      clientSessionId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(CLIENT_SESSION_KEY, clientSessionId);
    }
    return clientSessionId;
  } catch {
    return null;
  }
}

export function buildPhotoUrl(photoUrl: string, lobbyId?: string | null, playerId?: string | null): string {
  if (!photoUrl) return '';
  if (photoUrl.startsWith('http')) return photoUrl;

  let resolvedLobbyId = lobbyId;
  let resolvedPlayerId = playerId;

  if (!resolvedLobbyId || !resolvedPlayerId) {
    const session = getSession();
    resolvedLobbyId = resolvedLobbyId || session.lobbyId;
    resolvedPlayerId = resolvedPlayerId || session.playerId;
  }

  const url = new URL(photoUrl, SERVER_URL);
  const sessionToken = getPlayerSessionToken();
  if (resolvedLobbyId && resolvedPlayerId && sessionToken) {
    url.searchParams.set('lobbyId', resolvedLobbyId.toUpperCase());
    url.searchParams.set('playerId', resolvedPlayerId);
    url.searchParams.set('sessionToken', sessionToken);
  }
  return url.toString();
}

export const socket = io(SERVER_URL, {
  // React installs all game listeners before explicitly connecting. This
  // avoids losing a fast handshake reconnection event during initial render.
  autoConnect: false,
  // Optimize socket transports for better performance
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
  timeout: 20000,
  auth: (() => {
    const { lobbyId, playerId, sessionToken, clientSessionId } = getSession();
    return {
      ...(lobbyId && playerId && sessionToken ? { lobbyId, playerId, sessionToken } : {}),
      ...(clientSessionId ? { clientSessionId } : {}),
    };
  })(),
});

function refreshSocketAuth() {
  const { lobbyId, playerId, sessionToken, clientSessionId } = getSession();
  socket.auth = {
    ...(lobbyId && playerId && sessionToken ? { lobbyId, playerId, sessionToken } : {}),
    ...(clientSessionId ? { clientSessionId } : {}),
  };
}

socket.io.on('reconnect_attempt', refreshSocketAuth);
socket.on('connect_error', refreshSocketAuth);

export function connectSocket(): void {
  refreshSocketAuth();
  if (!socket.connected) socket.connect();
}

export const api = {
  base: SERVER_URL,
  createLobby: async (nickname: string, settings?: LobbySettings, clientSessionId?: string | null, tokenSecret?: string | null) => {
    const r = await fetch(`${SERVER_URL}/api/lobbies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, settings, clientSessionId, tokenSecret: tokenSecret || undefined }) });
    return r.json();
  },
  validateToken: async (secret: string) => {
    const r = await fetch(`${SERVER_URL}/api/token/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) });
    return r.json();
  },
  joinLobby: async (lobbyId: string, nickname: string, clientSessionId?: string | null) => {
    const r = await fetch(`${SERVER_URL}/api/lobbies/${lobbyId}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, clientSessionId }) });
    return r.json();
  },
  uploadPhoto: async (
    lobbyId: string,
    playerId: string,
    prepared: Array<{ file: File; lat: number | null; lon: number | null; captureDate?: string | null }>
  ) => {
    const fd = new FormData()

    prepared.forEach(({ file, lat, lon, captureDate }, i) => {
      fd.append('photos', file)
      if (lat != null && lon != null) {
        fd.append(`gps[${i}]`, JSON.stringify({ lat, lon }))
      }
      if (captureDate) {
        fd.append(`captureDate[${i}]`, captureDate)
      }
    })

    try {
      const r = await fetch(
        `${SERVER_URL}/api/lobbies/${lobbyId}/upload/${playerId}`,
        {
          method: 'POST',
          headers: getPlayerSessionToken() ? { Authorization: `Bearer ${getPlayerSessionToken()}` } : {},
          body: fd,
        }
      )

      if (!r.ok) {
        let message = `Upload failed with status ${r.status}`
        try {
          const body = await r.json()
          if (typeof body?.error === 'string') message = body.error
        } catch {
          // Keep the status fallback when a proxy returns a non-JSON response.
        }
        throw new Error(message)
      }

      return r.json()
    } catch (err) {
      logger.error('Upload request error', err)
      throw err
    }
  }

};
