import path from 'path';
import { LOBBY_NAMES } from './lobbyNames.js';

export function handleError(error, context = 'operation') {
  console.warn(`Error during ${context}:`, error?.message ?? error);
  return null;
}

export function handleAIOperationError(error, context, photoId = null, lobbyId = null) {
  const errorId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const photo = photoId ? `photo ${photoId}` : '';
  const lobby = lobbyId ? `in lobby ${lobbyId}` : '';

  if (error.name === 'AbortError') {
    console.warn(`[AI:${errorId}] ${context} timed out ${photo} ${lobby}`);
  } else if (error.code === 'ECONNREFUSED') {
    console.error(`[AI:${errorId}] Service unavailable for ${context} ${photo} ${lobby}`);
  } else if (error.message?.includes('ECONNRESET')) {
    console.error(`[AI:${errorId}] Connection reset during ${context} ${photo}`);
  } else if (error.message?.includes('ENOENT') || error.message?.includes('not found')) {
    console.warn(`[AI:${errorId}] Resource not found during ${context} ${photo}`);
  } else {
    console.error(`[AI:${errorId}] ${context} failed ${photo} ${lobby}:`, error.message ?? error);
  }

  return null;
}

export function mimeTypeForFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return { '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] ?? 'image/jpeg';
}

export function normalizeString(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function findLobbyById(lobbies, lobbyId) {
  if (!lobbyId) return null;
  const normalizedId = normalizeString(lobbyId).toUpperCase();
  const exact = lobbies.get(normalizedId);
  if (exact) return exact;
  for (const [id, lobby] of lobbies.entries()) {
    if (normalizeString(id).toUpperCase() === normalizedId) return lobby;
  }
  return null;
}

export function generateMemorableLobbyId() {
  const maxLength = 8;
  const candidates = LOBBY_NAMES.filter(entry => entry.name.length <= maxLength);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { id: pick.name, metadata: pick.metadata };
}
