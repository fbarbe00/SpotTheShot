import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from './game.js';
import { clampDateToRange, computeDateRoundScore, computeUploaderRoundScore, deriveDatePromptBounds, deriveDateTimelineBounds, normalizePhotoDate, todayUtcDate } from './scoring.js';

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
  assert.equal(guestView.photos[0].captureDate, undefined);
  assert.equal(guestView.photos[0].hasCaptureDate, true);
  assert.equal(guestView.photos[0].hasLocation, true);

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

test('DateTheShot derives padded bounds from uploaded photos and rejects future dates', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false, gameType: 'date' },
    constraints,
  });
  const { lobby, playerId } = created;
  assert.equal(lobby.settings.gameType, 'date');
  assert.equal(lobby.settings.dateTimelineStart, null);

  lobby.photos.push({ id: 'photo', url: '/uploads/photo.jpg', uploaderId: playerId });
  assert.throws(
    () => gm.updatePhotoDate(lobby.id, playerId, 'photo', '2999-01-01'),
    /future/,
  );
  assert.equal(gm.updatePhotoDate(lobby.id, playerId, 'photo', '2001-02-03'), '2001-02-03');
});

test('DateTheShot accepts calendar guesses and closer dates score more points', async () => {
  assert.equal(clampDateToRange('1890-01-01', '1900-01-01', '2020-12-31'), '1900-01-01');
  assert.equal(clampDateToRange('2030-01-01', '1900-01-01', '2020-12-31'), '2020-12-31');
  assert.equal(clampDateToRange('2000-06-15', '1900-01-01', '2020-12-31'), '2000-06-15');
  assert.equal(clampDateToRange('not-a-date', '1900-01-01', '2020-12-31'), null);
  const exact = computeDateRoundScore({
    guessDate: '2000-01-01', targetDate: '2000-01-01', isUploader: false, settings: {},
  });
  const nearby = computeDateRoundScore({
    guessDate: '2001-01-01', targetDate: '2000-01-01', isUploader: false, settings: {},
  });
  assert.equal(exact.total, 5000);
  assert.ok(nearby.total < exact.total);
  assert.equal(normalizePhotoDate('2020-02-30'), null);
  assert.equal(normalizePhotoDate('2020-02-20 extra text'), null);
  assert.ok(todayUtcDate() >= '2026-01-01');

  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false, gameType: 'date' },
    constraints,
  });
  const lobby = created.lobby;
  lobby.players.get(created.playerId).socketId = 'host-socket';
  lobby.photos.push({
    id: 'dated', url: '/uploads/dated.jpg', uploaderId: 'someone-else', captureDate: '1999-12-31',
  });
  gm.startGame(lobby.id);
  assert.deepEqual(
    gm.submitGuess(lobby.id, created.playerId, { date: '1900-01-01' }),
    { accepted: false, error: 'Guess date is outside the lobby timeline' },
  );
  const accepted = gm.submitGuess(lobby.id, created.playerId, { date: '2000-01-02' });
  assert.deepEqual(accepted, { accepted: true, duplicate: false });
  assert.equal(lobby.guesses.get(created.playerId).date, '2000-01-02');
  clearTimeout(lobby.timers.roundEnd);
  await gm.endRound(lobby.id);
  assert.equal(lobby.lastRoundResults.results[0].basePoints, lobby.lastRoundResults.results[0].points);
  assert.equal(lobby.lastRoundResults.results[0].distanceDays, 2);
  clearTimeout(lobby.timers.resultsEnd);
  clearInterval(lobby.timers.ticker);
});

test('DateTheShot never exposes the answer during an active round', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false, gameType: 'date' },
    constraints,
  });
  const lobby = created.lobby;
  lobby.players.get(created.playerId).socketId = 'host-socket';
  lobby.photos.push({
    id: 'dated', url: '/uploads/dated.jpg', uploaderId: created.playerId, captureDate: '1984-04-01',
  });
  gm.startGame(lobby.id);

  const view = gm.serializeLobby(lobby, created.playerId);
  assert.equal(view.currentRoundPhoto.captureDate, undefined);
  assert.equal(view.photos[0].captureDate, undefined);
  clearTimeout(lobby.timers.roundEnd);
  clearInterval(lobby.timers.ticker);
});

test('DateTheShot hides future answers while showing results', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false, gameType: 'date' },
    constraints,
  });
  const lobby = created.lobby;
  lobby.state = 'showing_results';
  lobby.photos.push(
    { id: 'current', url: '/uploads/current.jpg', uploaderId: created.playerId, captureDate: '1984-04-01' },
    { id: 'future-round', url: '/uploads/future.jpg', uploaderId: created.playerId, captureDate: '2002-09-08' },
  );
  lobby.lastRoundResults = {
    photo: { id: 'current', captureDate: '1984-04-01' },
    results: [],
  };

  const view = gm.serializeLobby(lobby, created.playerId);
  assert.equal(view.photos[0].captureDate, undefined);
  assert.equal(view.photos[1].captureDate, undefined);
  assert.equal(view.lastRoundResults.photo.captureDate, '1984-04-01');
});

test('DateTheShot bounds add 1-3 years around the photo collection and cap at today', () => {
  const earliestPadding = deriveDateTimelineBounds(['2000-05-10', '2025-05-10'], () => 0);
  assert.equal(earliestPadding.start, '1999-05-10');
  assert.equal(earliestPadding.end, '2026-05-10');
  const widestPadding = deriveDateTimelineBounds(['2000-05-10', todayUtcDate()], () => 0.999);
  assert.equal(widestPadding.start, '1997-05-10');
  assert.equal(widestPadding.end, todayUtcDate());
  assert.deepEqual(
    deriveDateTimelineBounds(['2000-05-10', '2010-05-10'], () => 0.999),
    { start: '1997-05-10', end: '2013-05-10' },
  );
});

test('DateTheShot AI prompt bounds use uploaded photo dates plus ten years', () => {
  assert.deepEqual(
    deriveDatePromptBounds(['2005-06-15', '2018-02-20'], '2026-07-29'),
    { start: '1995-06-15', end: '2026-07-29' },
  );
  assert.deepEqual(
    deriveDatePromptBounds(['1980-01-02', '1990-03-04'], '2026-07-29'),
    { start: '1970-01-02', end: '2000-03-04' },
  );
  assert.equal(deriveDatePromptBounds([], '2026-07-29'), null);

  const gm = createManager();
  assert.deepEqual(
    gm._datePromptBounds({
      settings: { dateTimelineStart: '1990-01-01', dateTimelineEnd: '2020-12-31' },
      photos: [{ captureDate: '2005-06-15' }],
    }),
    { start: '1990-01-01', end: '2020-12-31', source: 'lobby timeline' },
  );
});

test('DateTheShot reuses and clamps a completed lobby prefetch after final bounds are chosen', async () => {
  const gm = createManager();
  const photo = { id: 'prefetched-date', captureDate: '2005-06-15' };
  gm.datePredictions.set(photo.id, {
    date: '1985-04-03',
    earliestDate: '1970-01-01',
    latestDate: '2030-01-01',
    timestamp: Date.now(),
  });

  const prediction = await gm.ensureDatePrediction(photo, {
    earliestDate: '1990-01-01',
    latestDate: '2020-12-31',
  });

  assert.equal(prediction.date, '1990-01-01');
  assert.equal(prediction.earliestDate, '1990-01-01');
  assert.equal(prediction.latestDate, '2020-12-31');
});

test('DateTheShot waits for a tracked AI guess before building visible round results', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    socketId: 'host-socket',
    settings: { enableAIGuessing: false, gameType: 'date' },
    constraints,
  });
  const lobby = created.lobby;
  lobby.photos.push({
    id: 'dated-ai-photo',
    url: '/uploads/dated-ai.jpg',
    uploaderId: created.playerId,
    captureDate: '2001-02-03',
  });
  gm.startGame(lobby.id);
  const aiPlayerId = `ai-${lobby.id}`;
  lobby.players.set(aiPlayerId, {
    id: aiPlayerId,
    nickname: 'AI',
    score: 0,
    ready: true,
    color: '#888888',
    icon: '🤖',
    socketId: null,
    isAI: true,
    team: null,
    wins: 0,
  });
  lobby.settings.enableAIGuessing = true;

  const promise = new Promise(resolve => {
    setImmediate(() => {
      gm.submitGuess(lobby.id, aiPlayerId, { date: lobby.settings.dateTimelineStart });
      resolve();
    });
  });
  lobby.aiGuessTask = { roundToken: lobby.roundToken, promise };

  clearTimeout(lobby.timers.roundEnd);
  await gm.endRound(lobby.id);

  assert.equal(lobby.lastRoundResults.results.some(result => result.playerId === aiPlayerId), true);
  assert.equal(lobby.lastRoundResults.results.find(result => result.playerId === aiPlayerId)?.guessedDate,
    lobby.settings.dateTimelineStart);
  clearTimeout(lobby.timers.resultsEnd);
  clearInterval(lobby.timers.ticker);
});

test('WhoTookTheShot validates player votes, scores categorical answers, and hides ownership', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    socketId: 'host-socket',
    settings: { enableAIGuessing: false, gameType: 'uploader' },
    constraints,
  });
  const guest = gm.joinLobby({ lobbyId: created.lobby.id, nickname: 'Guest', socketId: 'guest-socket' });
  const lobby = created.lobby;
  lobby.photos.push({ id: 'secret-photo', url: '/uploads/secret.jpg', uploaderId: created.playerId });
  gm.startGame(lobby.id);

  assert.notEqual(lobby.currentRoundPhoto.id, 'secret-photo');
  assert.equal(lobby.currentRoundPhoto.uploaderId, undefined);
  assert.equal(gm.serializeLobby(lobby, guest.playerId).photos[0].uploaderId, undefined);
  assert.deepEqual(
    gm.submitGuess(lobby.id, guest.playerId, { uploaderId: 'not-a-player' }),
    { accepted: false, error: 'Invalid player vote' },
  );
  assert.deepEqual(
    gm.submitGuess(lobby.id, guest.playerId, { uploaderId: created.playerId }),
    { accepted: true, duplicate: false },
  );
  assert.equal(computeUploaderRoundScore({
    guessedUploaderId: created.playerId,
    targetUploaderId: created.playerId,
    isUploader: false,
    settings: {},
  }).total, 5000);
  assert.equal(computeUploaderRoundScore({
    guessedUploaderId: guest.playerId,
    targetUploaderId: created.playerId,
    isUploader: false,
    settings: {},
  }).total, 0);
  clearTimeout(lobby.timers.roundEnd);
  clearInterval(lobby.timers.ticker);
});

test('switching modes applies only the newly selected photo requirements', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    socketId: 'host-socket',
    settings: { enableAIGuessing: false, gameType: 'spot' },
    constraints,
  });
  const lobby = created.lobby;
  lobby.photos.push({ id: 'bare', url: '/uploads/bare.jpg', uploaderId: created.playerId });
  lobby.players.get(created.playerId).ready = true;

  gm.updateSettings(lobby.id, { ...lobby.settings, gameType: 'uploader' });
  assert.equal(lobby.players.get(created.playerId).ready, false);
  assert.equal(lobby.settings.dateTimelineStart, null);
  assert.doesNotThrow(() => gm.startGame(lobby.id));
  clearTimeout(lobby.timers.roundEnd);
  clearInterval(lobby.timers.ticker);

  lobby.state = 'waiting';
  lobby.roundIndex = -1;
  lobby.currentRoundPhoto = null;
  lobby.guesses = new Map();
  gm.updateSettings(lobby.id, { ...lobby.settings, gameType: 'date' });
  assert.equal(lobby.settings.dateTimelineStart, null);
  assert.throws(() => gm.startGame(lobby.id), /valid capture date/);
  gm.updatePhotoDate(lobby.id, created.playerId, 'bare', '2020-01-02');
  assert.doesNotThrow(() => gm.startGame(lobby.id));
  clearTimeout(lobby.timers.roundEnd);
  clearInterval(lobby.timers.ticker);

  lobby.state = 'waiting';
  lobby.roundIndex = -1;
  lobby.currentRoundPhoto = null;
  lobby.guesses = new Map();
  gm.updateSettings(lobby.id, { ...lobby.settings, gameType: 'spot' });
  assert.throws(() => gm.startGame(lobby.id), /location data/);
});

test('date and mode edits invalidate AI output generated for stale settings', async () => {
  const gm = createManager();
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: false, gameType: 'spot', showImageDate: true },
    constraints,
  });
  const photo = {
    id: 'photo', url: '/uploads/photo.jpg', uploaderId: created.playerId,
    captureDate: '2000-01-01', title: 'Generated title', hint: 'regional hint',
  };
  created.lobby.photos.push(photo);
  gm.visionCommentaries.set(photo.id, { commentary: 'Old location joke', timestamp: Date.now() });
  gm.imageTitles.set(photo.id, { title: photo.title, hint: photo.hint, timestamp: Date.now() });

  gm.updateSettings(created.lobby.id, { gameType: 'date', showImageDate: true });
  assert.equal(created.lobby.settings.showImageDate, false);
  assert.equal(gm.visionCommentaries.has(photo.id), false);
  assert.equal(gm.imageTitles.has(photo.id), false);
  assert.equal(photo.title, '');
  assert.equal(photo.hint, '');

  gm.visionCommentaries.set(photo.id, { commentary: 'Old date joke', timestamp: Date.now() });
  gm.datePredictions.set(photo.id, {
    date: '1999-01-01',
    earliestDate: '1990-01-01',
    latestDate: '2010-01-01',
    timestamp: Date.now(),
  });
  gm._datePredictionAttempted.add(photo.id);
  gm.updatePhotoDate(created.lobby.id, created.playerId, photo.id, '2001-02-03');
  assert.equal(gm.visionCommentaries.has(photo.id), false);
  assert.equal(gm.datePredictions.has(photo.id), false);
  assert.equal(gm._datePredictionAttempted.has(photo.id), false);
});

test('DateTheShot photo prefetch never invokes GeoCLIP location work', async () => {
  const gm = createManager();
  const aiConstraints = { ...constraints, allowAIGuessing: true };
  const created = await gm.createLobby({
    nickname: 'Host',
    settings: { enableAIGuessing: true, gameType: 'date' },
    constraints: aiConstraints,
  });
  let locationPrefetches = 0;
  gm.prefetchAIPrediction = async () => ({ date: '2000-01-01' });
  gm.prefetchLocation = async () => { locationPrefetches += 1; };

  gm.upsertPhoto(created.lobby.id, {
    id: 'dated-photo',
    url: '/uploads/dated.jpg',
    uploaderId: created.playerId,
    captureDate: '2000-01-01',
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(locationPrefetches, 0);
});

test('replaced AI work is not cleared when an older request finishes', async () => {
  const gm = createManager();
  const cache = new Map();
  const inflight = new Map();
  let finishOld;
  let finishNew;
  const oldWork = gm._dedupedAsync(cache, inflight, 'photo', () =>
    new Promise(resolve => { finishOld = resolve; })
  );
  inflight.delete('photo');
  const newWork = gm._dedupedAsync(cache, inflight, 'photo', () =>
    new Promise(resolve => { finishNew = resolve; })
  );

  finishOld('old');
  assert.equal(await oldWork, 'old');
  assert.equal(inflight.has('photo'), true);
  finishNew('new');
  assert.equal(await newWork, 'new');
  assert.equal(inflight.has('photo'), false);
});
