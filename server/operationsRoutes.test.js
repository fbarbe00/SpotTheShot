import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import express from 'express';
import { createOperationsRouter } from './operationsRoutes.js';

test('admin overview is authenticated and excludes player identity data', async t => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'test-admin-secret';
  const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spot-operations-'));
  const players = new Map([['player', { id: 'player', nickname: 'Private Name', sessionToken: 'private', socketId: 'socket' }]]);
  const gm = { lobbies: new Map([['LOBBY', {
    id: 'LOBBY', state: 'waiting', settings: { gameType: 'spot' }, players,
    photos: [], roundIndex: -1, createdAt: Date.now(),
  }]]) };
  const app = express();
  app.use('/api', createOperationsRouter({
    gm,
    gameStats: { totalGamesPlayed: 2, updatedAt: new Date().toISOString(), games: [{ settings: { gameType: 'spot' } }, { settings: { gameType: 'date' } }] },
    uploadsDir,
  }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(uploadsDir, { recursive: true, force: true });
    if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previousToken;
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${base}/api/admin/overview`)).status, 401);
  const response = await fetch(`${base}/api/admin/overview`, { headers: { Authorization: 'Bearer test-admin-secret' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.statistics.modeCounts, { spot: 1, date: 1 });
  assert.equal(body.lobbies[0].players, 1);
  assert.equal(JSON.stringify(body).includes('Private Name'), false);
  assert.equal(JSON.stringify(body).includes('private'), false);
});
