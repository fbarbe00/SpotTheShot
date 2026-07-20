import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from './game.js';

function createManager() {
  const sockets = new Map();
  return new GameManager({
    sockets: { sockets },
    to: () => ({ emit: () => {} }),
  });
}

const constraints = {
  maxPlayersPerLobby: 10,
  maxPhotosPerPlayer: 10,
  allowAllMaps: true,
  allowAIGuessing: false,
  allowAutoNaming: false,
  allowVisionCommentary: false,
};

test('player session token is private and required to reconnect', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  const serialized = gm.serializeLobby(created.lobby, created.playerId);

  assert.ok(created.sessionToken);
  assert.equal(serialized.players[0].sessionToken, undefined);
  assert.throws(
    () => gm.reconnectPlayer({ lobbyId: created.lobby.id, playerId: created.playerId, sessionToken: 'wrong', socketId: 's1' }),
    /Session not found/,
  );
});

test('in-round state only exposes the viewer own guess and no AI prediction', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  const joined = gm.joinLobby({ lobbyId: created.lobby.id, nickname: 'Guest', socketId: null });
  const lobby = created.lobby;
  lobby.state = 'in_round';
  lobby.guesses.set(created.playerId, { lat: 1, lon: 2, timeTakenMs: 100 });
  lobby.guesses.set(joined.playerId, { lat: 3, lon: 4, timeTakenMs: 200 });
  lobby.photos.push({ id: 'photo', url: '/uploads/photo.jpg', uploaderId: created.playerId, lat: 5, lon: 6 });
  gm.predictions.set('photo', { lat: 7, lon: 8, timestamp: Date.now() });

  const hostView = gm.serializeLobby(lobby, created.playerId);
  assert.deepEqual(Object.keys(hostView.currentGuesses), [created.playerId]);
  assert.equal(hostView.photos[0].predictionLat, undefined);
  assert.equal(hostView.photos[0].lat, null);
});
