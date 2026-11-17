'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const EventEmitter = require('events');
const http = require('http');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../lib/map-enhancements');
const { HistoryStore } = require(root + '/../map-history-store.js');
const settings = require(root + '/settings.js');
const summary = require(root + '/summary.js');
const statusModule = require(root + '/status.js');
function fixture (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'roomba-preview-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.UTC(2026, 10, 10);
  const store = new HistoryStore(path.join(directory, 'data'), () => now);
  return { directory, store, advance (ms = 1000) { now += ms; }, now: () => now };
}
function state (nMssn = 1, cycle = 'clean', phase = 'run', extras = {}) {
  return { cleanMissionStatus: Object.assign({ nMssn, cycle, phase }, extras),
    pose: { theta: 90, point: { x: nMssn * 10, y: 20 } },
    batPct: 70 };
}
function complete (f, number) {
  f.advance(); f.store.ingest(state(number));
  f.advance(); f.store.ingest(state(number, 'none', 'charge')); f.store.flush();
  return f.store.current.meta.id;
}
test('settings persist zero/negative offsets, validate types/ranges and survive recreation', t => {
  const f = fixture(t);
  const service = new settings.Settings(f.directory);
  const value = Object.assign({}, settings.defaults, { offsetX: 0, offsetY: -128, autoFit: false, sizeW: 1200 });
  service.save(value);
  assert.deepEqual(new settings.Settings(f.directory).get(), value);
  for (const change of [{ offsetX: '0' }, { autoFit: 'false' }, { sizeW: 1 }, { pointIntervalMs: 60001 }, { sizeW: 800.5 }]) {
    assert.throws(() => service.save(Object.assign({}, value, change)), { status: 400 });
    assert.deepEqual(service.get(), value, 'failed validation does not replace persisted settings');
  }
});
test('summaries preserve reported maxima and do not claim actual start or successful completion', t => {
  const f = fixture(t); summary.attach(f.store);
  f.store.ingest(state(1, 'clean', 'run', { mssnM: 12, sqft: 100 }));
  f.advance(120000);
  f.store.ingest(state(1, 'clean', 'charge', { mssnM: 12, sqft: 100 }));
  assert.equal(f.store.get().summary.condition, 'recharging');
  f.advance(); f.store.ingest(state(1, 'clean', 'stop', { mssnM: 13, sqft: 110 }));
  assert.equal(f.store.get().summary.condition, 'paused');
  f.advance(); f.store.ingest(state(1, 'clean', 'stop', { error: 17 }));
  assert.equal(f.store.get().summary.condition, 'error');
  f.advance(); f.store.ingest(state(1, 'none', 'charge', { mssnM: 0, sqft: 0 })); f.store.flush();
  const restored = new HistoryStore(f.store.directory, f.now); summary.attach(restored);
  const result = restored.get().summary;
  assert.equal(result.condition, 'ended'); assert.equal(result.reportedMinutes, 13);
  assert.ok(Math.abs(result.reportedAreaM2 - 110 * 0.09290304) < 1e-9);
  assert.equal(result.observedFrom, f.store.current.meta.createdAt);
  assert.equal(restored.list()[0].summary.reportedMinutes, 13);
  const old = summary.summarize({ createdAt: result.observedFrom, updatedAt: result.observedFrom, lastState: {} }, false);
  assert.equal(old.reportedMinutes, null); assert.equal(old.batteryLast, null);
});
test('recorder status distinguishes transport, state, coordinate and actual successful writes', t => {
  const f = fixture(t); const status = statusModule.attach(f.store); const client = new EventEmitter();
  status.attach(client);
  assert.equal(status.snapshot().lastWriteAt, null);
  client.emit('connect'); assert.equal(status.snapshot().transport, 'connected');
  assert.equal(status.snapshot().lastSeen, null, 'connect alone is not a state sample');
  f.store.ingest(state());
  const first = status.snapshot();
  assert.ok(first.lastCoordinateAt); assert.ok(first.lastWriteAt);
  f.advance(); f.store.ingest(state());
  assert.notEqual(status.snapshot().lastSeen, first.lastSeen);
  assert.equal(status.snapshot().lastCoordinateAt, first.lastCoordinateAt, 'duplicate coordinates are not new writes');
  client.emit('close'); assert.equal(status.snapshot().transport, 'disconnected');
  f.store.error = 'History write failed: ENOSPC';
  assert.equal(f.store.get().recorderStatus.recordingError, f.store.error);
  const before = status.snapshot().lastWriteAt;
  assert.throws(() => f.store.atomicJSON(path.join(f.directory, 'missing', 'file.json'), {}));
  assert.equal(status.snapshot().lastWriteAt, before, 'failed write does not update last successful write');
});
