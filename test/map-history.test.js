'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const HistoryStore = require('../lib/map-history-store').HistoryStore;
const mapHistory = require('../lib/map-history');

function state (mission, x, phase = 'run', cycle = 'clean') {
  return {
    cleanMissionStatus: { nMssn: mission, phase, cycle },
    pose: { theta: 90, point: { x, y: x / 2 } },
    batPct: 80,
    password: 'DO_NOT_SAVE_PASSWORD',
    wlcfg: { password: 'DO_NOT_SAVE_WIFI' }
  };
}

function temporaryDirectory () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rest980-map-test-'));
}

test('records without a browser, replays deltas and keeps missions separate', () => {
  const directory = temporaryDirectory();
  let now = 1700000000000;
  const store = new HistoryStore(directory, () => now);
  function ingest (value, elapsed = 1000) {
    now += elapsed;
    store.ingest(value);
  }
  try {
    ingest(state(1, 0, 'charge', 'none'));
    assert.equal(store.list().length, 0);
    ingest(state(2, 0));
    ingest(state(2, 10));
    ingest(state(2, 20));
    const firstId = store.get().id;
    assert.equal(store.get().total, 3);
    assert.equal(store.get('latest', 3, firstId).points.length, 0);
    assert.equal(store.get('latest', 3, firstId).reset, false);
    ingest(state(2, 20));
    assert.equal(store.get().total, 3, 'deduplicate unchanged positions');
    ingest(state(2, 30));
    assert.equal(store.get('latest', 3, firstId).points[0].x, 30);
    assert.equal(store.get('latest', 3, 'another-mission').points.length, 4);
    ingest(state(2, 30, 'charge', 'none'));
    assert.ok(store.current.meta.completedAt);
    const firstTotal = store.get().total;
    ingest(state(3, 100));
    assert.notEqual(store.get().id, firstId);
    assert.equal(store.get('latest', firstTotal, firstId).reset, true);
    assert.equal(store.get().total, 1);
    assert.equal(store.get(firstId).total, firstTotal);
    assert.equal(store.list().length, 2);
    assert.throws(() => store.get('../../config/local'), /Invalid mission/);
    assert.throws(() => store.get('m999-1234'), /not found/);
    for (const name of fs.readdirSync(directory)) {
      assert.ok(!fs.readFileSync(path.join(directory, name), 'utf8').includes('DO_NOT_SAVE_'));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('recovers appended points after restart and never joins across missing data', () => {
  const directory = temporaryDirectory();
  let now = 1700000000000;
  let store = new HistoryStore(directory, () => now);
  function ingest (x, elapsed = 1000) {
    now += elapsed;
    store.ingest(state(10, x));
  }
  try {
    ingest(0);
    ingest(10);
    const id = store.get().id;
    // Metadata has not reached its periodic flush yet; the points must still survive.
    fs.appendFileSync(path.join(directory, id + '.jsonl'), '{"seq":3');
    store = new HistoryStore(directory, () => now);
    assert.equal(store.get().total, 2);
    assert.equal(store.get().state.pose.point.x, 10);
    assert.equal(store.get().online, false);
    ingest(20);
    assert.equal(store.get().points[2].break, true);
    store.markDisconnected();
    ingest(30);
    assert.equal(store.get().points[3].break, true);
    ingest(40, 31000);
    assert.equal(store.get().points[4].break, true);
    store.ingest(state(10, 50, 'charge'));
    ingest(60);
    assert.equal(store.get().points[6].break, true);
    store = new HistoryStore(directory, () => now);
    assert.equal(store.get().total, 7);
    assert.equal(store.get().points[6].x, 60);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('history is opt-in and requires a persistent firmware 2 local connection', () => {
  const settings = mapHistory.settingsFrom({ firmwareVersion: 2 }, {});
  assert.equal(mapHistory.isEnabled(settings), false);
  settings.directory = '/data/history';
  assert.equal(mapHistory.isEnabled(settings), true);
  for (const override of [{ firmwareVersion: 1 }, { keepAlive: false }, { enableLocal: false }]) {
    assert.equal(mapHistory.isEnabled(Object.assign({}, settings, override)), false);
  }
  assert.equal(mapHistory.settingsFrom({}, { FIRMWARE_VERSION: '2', KEEP_ALIVE: 'no' }).keepAlive, false);
});

test('recorder observes one existing client and flushes pending state on disconnect', () => {
  const directory = temporaryDirectory();
  const recorder = mapHistory.createRecorder({ directory, firmwareVersion: 2, keepAlive: true, enableLocal: true });
  const client = new EventEmitter();
  const routes = {};
  recorder.install({ post () {}, get: (url, handler) => { routes[url] = handler; }, delete: (url, handler) => { routes[url] = handler; } });
  function call (query = {}) {
    const response = { statusCode: 200, set () {}, status (code) { this.statusCode = code; return this; }, json (data) { this.body = data; } };
    routes['/local/history/points']({ query }, response);
    return response;
  }
  try {
    recorder.attach(client);
    recorder.attach(client);
    assert.equal(client.listenerCount('state'), 1);
    client.emit('state', state(11, 0));
    client.emit('close');
    assert.equal(call().body.total, 1);
    assert.equal(call().body.online, false);
    assert.equal(call({ after: 'bad' }).statusCode, 400);
    assert.equal(call({ mission: '../config' }).statusCode, 400);
    assert.equal(call({ mission: 'm999-1234' }).statusCode, 404);
    const pointFile = path.join(directory, call().body.id + '.jsonl');
    fs.unlinkSync(pointFile);
    fs.mkdirSync(pointFile);
    client.emit('state', state(11, 10));
    assert.doesNotThrow(() => client.emit('close'));
    assert.match(call().body.recordingError, /write failed/);
    fs.rmdirSync(pointFile);
  } finally {
    recorder.close();
    assert.equal(client.listenerCount('state'), 0);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a failed mission pointer update can be retried without losing the current mission', () => {
  const directory = temporaryDirectory();
  let now = 1700000000000;
  const store = new HistoryStore(directory, () => now);
  try {
    store.ingest(state(1, 0));
    const previous = store.get().id;
    const pointer = path.join(directory, 'current.json');
    fs.unlinkSync(pointer);
    fs.mkdirSync(pointer);
    now += 1000;
    assert.throws(() => store.ingest(state(2, 10)));
    assert.equal(store.get().id, previous);
    fs.rmdirSync(pointer);
    now += 1000;
    store.ingest(state(2, 20));
    assert.notEqual(store.get().id, previous);
    const restored = new HistoryStore(directory, () => now);
    assert.equal(restored.get().id, store.get().id);
    assert.equal(restored.get().total, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
