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

test('guess retries are acknowledged without overwriting the first guess', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  gm.joinLobby({ lobbyId: created.lobby.id, nickname: 'Guest', socketId: 'guest-socket' });
  const lobby = created.lobby;
  lobby.players.get(created.playerId).socketId = 'host-socket';
  lobby.state = 'in_round';
  lobby.roundIndex = 0;
  lobby.roundOrder = ['photo'];
  lobby.roundStartAt = Date.now() - 100;
  lobby.photos.push({ id: 'photo', url: '/uploads/photo.jpg', uploaderId: 'someone-else', lat: 5, lon: 6 });

  const first = gm.submitGuess(lobby.id, created.playerId, { lat: 1, lon: 2 });
  const retry = gm.submitGuess(lobby.id, created.playerId, { lat: 8, lon: 9 });

  assert.deepEqual(first, { accepted: true, duplicate: false });
  assert.deepEqual(retry, { accepted: true, duplicate: true });
  assert.equal(lobby.guesses.get(created.playerId).lat, 1);
  assert.equal(lobby.guesses.get(created.playerId).lon, 2);
});

test('finished lobby serialization includes complete round history', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  created.lobby.state = 'finished';
  created.lobby.roundHistory = [{ roundIndex: 0, photo: { id: 'photo' }, results: [] }];

  const serialized = gm.serializeLobby(created.lobby, created.playerId);
  assert.equal(serialized.roundHistory.length, 1);
  assert.equal(serialized.roundHistory[0].photo.id, 'photo');
});

test('waiting lobby withholds other players photo URLs and metadata', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  const joined = gm.joinLobby({ lobbyId: created.lobby.id, nickname: 'Guest', socketId: null });
  created.lobby.photos.push({
    id: 'secret-photo',
    url: '/uploads/secret.jpg',
    uploaderId: created.playerId,
    lat: 10,
    lon: 20,
    title: 'Secret title',
    hint: 'Secret hint',
    captureDate: '2025-01-01',
  });

  const guestView = gm.serializeLobby(created.lobby, joined.playerId);
  assert.equal(guestView.photos[0].url, '');
  assert.equal(guestView.photos[0].lat, null);
  assert.equal(guestView.photos[0].title, undefined);

  const hostView = gm.serializeLobby(created.lobby, created.playerId);
  assert.equal(hostView.photos[0].url, '/uploads/secret.jpg');
  assert.equal(hostView.photos[0].lat, 10);
  assert.equal(hostView.photos[0].title, 'Secret title');
});

test('new players and photo mutations are rejected after game start', async () => {
  const gm = createManager();
  const created = await gm.createLobby({ nickname: 'Host', settings: { enableAIGuessing: false }, constraints });
  created.lobby.state = 'in_round';

  assert.throws(
    () => gm.joinLobby({ lobbyId: created.lobby.id, nickname: 'Late', socketId: null }),
    /already started/,
  );
  assert.throws(
    () => gm.upsertPhoto(created.lobby.id, {
      id: 'late-photo', url: '/uploads/late.jpg', uploaderId: created.playerId, lat: 1, lon: 2,
    }),
    /locked/,
  );
  assert.throws(
    () => gm.setReady(created.lobby.id, created.playerId, true),
    /locked/,
  );
  created.lobby.photos.push({
    id: 'existing-photo', url: '/uploads/does-not-exist.jpg', uploaderId: created.playerId, lat: 1, lon: 2,
  });
  await gm.deletePhoto(created.lobby.id, created.playerId, 'existing-photo');
  assert.equal(created.lobby.photos.length, 1);
});

test('configured round duration is used when creation settings omit it', async () => {
  const io = {
    sockets: { sockets: new Map() },
    to: () => ({ emit: () => {} }),
  };
  const gm = new GameManager(io, { roundDurationSec: 22 });
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false },
    constraints,
  });
  assert.equal(created.lobby.settings.roundDurationSec, 22);
});
