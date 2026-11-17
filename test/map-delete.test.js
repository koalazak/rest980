'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const HistoryStore = require('../lib/map-history-store').HistoryStore;

function fixture () {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rest980-delete-test-'));
  let clock = 1700000000000;
  const store = new HistoryStore(directory, () => clock);
  return {
    directory,
    store,
    ingest (number, phase = 'run', cycle = 'clean') {
      clock += 1000;
      store.ingest({
        cleanMissionStatus: { nMssn: number, phase, cycle },
        pose: { theta: 90, point: { x: number * 10, y: number * 5 } }
      });
      return store.get().id;
    },
    close () { fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

test('deletion removes only its task, protects active/recharging tasks and survives restart', () => {
  const context = fixture();
  const store = context.store;
  try {
    const first = context.ingest(1);
    const second = context.ingest(2);
    assert.equal(store.get().deletable, false);
    assert.equal(store.get(first).deletable, true);
    assert.throws(() => store.remove(second), error => error.status === 409);
    context.ingest(2, 'charge');
    assert.throws(() => store.remove(second), error => error.status === 409);
    store.remove(first);
    assert.equal(store.get().id, second);
    assert.equal(store.get().total, 2);
    assert.equal(fs.existsSync(store.file(first, '.json')), false);
    assert.equal(fs.existsSync(store.file(first, '.jsonl')), false);
    assert.equal(fs.existsSync(store.file(second, '.jsonl')), true);
    context.ingest(2, 'charge', 'none');
    assert.equal(store.get().deletable, true);
    store.remove(second);
    assert.equal(store.get().id, null);
    assert.equal(store.list().length, 0);
    store.flush();
    const restarted = new HistoryStore(context.directory);
    assert.equal(restarted.get().id, null);
    assert.equal(restarted.list().length, 0);
    context.ingest(2, 'charge', 'none');
    assert.equal(store.get().id, null, 'idle updates must not recreate a deleted map');
    context.ingest(3);
    assert.equal(store.get().nMssn, 3);
    assert.equal(store.get().total, 1);
    assert.equal(store.remove(second).deleted, second, 'an exact-ID retry is idempotent');
    for (const id of ['latest', '../config/local', '/etc/passwd']) {
      assert.throws(() => store.remove(id), error => error.status === 400);
    }
    assert.throws(() => store.remove('m99-1234'), error => error.status === 404);
  } finally {
    context.close();
  }
});

test('deleting the most recent completed task selects the previous map with its own pose', () => {
  const context = fixture();
  const store = context.store;
  try {
    const first = context.ingest(1);
    context.ingest(1, 'charge', 'none');
    const second = context.ingest(2);
    context.ingest(2, 'charge', 'none');
    assert.equal(store.remove(second).currentId, first);
    assert.equal(store.get().id, first);
    assert.equal(store.get().state.pose.point.x, 10, 'do not mix in the deleted mission pose');
    const restarted = new HistoryStore(context.directory);
    assert.equal(restarted.get().id, first);
    assert.equal(restarted.list().length, 1);
    assert.equal(restarted.get().deletable, true);
    assert.throws(() => restarted.get(second), error => error.status === 404);
  } finally {
    context.close();
  }
});

test('older recordings without a completion event remain deletable after becoming latest', () => {
  const context = fixture();
  const store = context.store;
  try {
    const first = context.ingest(1);
    const second = context.ingest(2);
    context.ingest(2, 'charge', 'none');
    const legacy = JSON.parse(fs.readFileSync(store.file(first, '.json'), 'utf8'));
    legacy.completedAt = null;
    fs.writeFileSync(store.file(first, '.json'), JSON.stringify(legacy));
    store.remove(second);
    const restarted = new HistoryStore(context.directory);
    assert.equal(restarted.get().id, first);
    assert.equal(restarted.get().deletable, true);
    restarted.remove(first);
    assert.equal(restarted.get().id, null);
  } finally {
    context.close();
  }
});

test('an interrupted deletion stays hidden after restart and can finish cleanup on retry', () => {
  const context = fixture();
  const store = context.store;
  try {
    const first = context.ingest(1);
    context.ingest(1, 'charge', 'none');
    const second = context.ingest(2);
    context.ingest(2, 'charge', 'none');
    const blockingDirectory = path.join(context.directory, 'current.json.tmp');
    fs.mkdirSync(blockingDirectory);
    assert.throws(() => store.remove(second));
    assert.equal(fs.existsSync(store.file(second, '.jsonl')), true);
    assert.equal(store.list().some(mission => mission.id === second), false);
    const restarted = new HistoryStore(context.directory);
    assert.equal(restarted.get().id, first);
    assert.throws(() => restarted.get(second), error => error.status === 404);
    fs.rmdirSync(blockingDirectory);
    restarted.remove(second);
    assert.equal(fs.existsSync(store.file(second, '.jsonl')), false);
    assert.equal(fs.existsSync(store.file(second, '.json')), false);
    assert.equal(fs.existsSync(store.file(first, '.jsonl')), true);
  } finally {
    context.close();
  }
});
