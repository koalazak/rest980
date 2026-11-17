'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const root = path.resolve(__dirname, '../lib/map-enhancements');
const { HistoryStore } = require(root + '/../map-history-store.js');
const { Calibrations } = require(root + '/calibration.js');
const coordinates = require(path.resolve(__dirname, '../public/js/map-coordinates.js'));
const exporter = require(root + '/export.js');
function fixture (t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'roomba-calibration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.UTC(2026, 10, 17);
  let merged = {};
  const store = new HistoryStore(path.join(directory, 'data'), () => now);
  const service = new Calibrations(store, directory);
  const client = new EventEmitter();
  service.attachStore(); service.attach(client);
  function emit (reported) { client.emit('update', { state: { reported } }); merged = Object.assign({}, merged, reported); store.ingest(merged); }
  function sample (nMssn = 1, x = 100, y = 200, phase = 'run') {
    emit({ cleanMissionStatus: { nMssn, cycle: phase === 'charge' ? 'none' : 'clean', phase },
      pose: { theta: 90, point: { x, y } } });
    return store.current.meta.id;
  }
  return { directory,
    store,
    service,
    client,
    emit,
    sample,
    advance (ms = 1000) { now += ms; },
    save (id, extra = {}) { return service.save(id, Object.assign({}, coordinates.defaults, { action: 'manual', revision: service.get(id).revision }, extra)); } };
}
test('rigid calibration maps an origin and placement without mutating robot samples or lengths', () => {
  const raw = { seq: 2, x: 13, y: 24, theta: 90, break: true };
  const value = { originX: 10, originY: 20, offsetX: 100, offsetY: -50, rotation: 90 };
  const point = coordinates.apply(raw, value);
  assert.ok(Math.abs(point.x - 96) < 1e-10); assert.ok(Math.abs(point.y + 47) < 1e-10);
  assert.equal(point.theta, 0); assert.equal(point.seq, 2); assert.equal(raw.x, 13);
  assert.deepEqual(coordinates.apply({ x: 10, y: 20, theta: 0 }, value), { x: 100, y: -50, theta: -90 });
  const end = coordinates.apply({ x: 16, y: 28, theta: 90 }, value);
  assert.ok(Math.abs(Math.hypot(end.x - point.x, end.y - point.y) - 5) < 1e-10);
});
test('task transforms persist independently, reject stale revisions and preserve raw JSONL', t => {
  const f = fixture(t);
  const first = f.sample(); f.advance(); const second = f.sample(2, -20, 30);
  const before = fs.readFileSync(f.store.file(first, '.jsonl'), 'utf8');
  const one = f.save(first, { originX: 100, originY: 200, offsetY: 400 });
  const two = f.save(second, { originX: -20, originY: 30, rotation: 30 });
  assert.equal(new Calibrations(f.store, f.directory).get(first).offsetY, 400);
  assert.equal(f.service.get(second).rotation, 30);
  assert.throws(() => f.service.save(first, Object.assign({}, one, { action: 'manual', revision: null })), { status: 409 });
  assert.throws(() => f.save(first, { originX: '100' }), { status: 400 });
  assert.throws(() => f.save(first, { rotation: 181 }), { status: 400 });
  assert.throws(() => f.service.get('../outside'), { status: 400 });
  assert.equal(f.service.get(second).revision, two.revision);
  assert.equal(fs.readFileSync(f.store.file(first, '.jsonl'), 'utf8'), before);
  assert.equal(f.store.get(first).calibration.revision, one.revision);
});
test('current-position calibration requires a fresh raw pose, matching task and sample token', t => {
  const f = fixture(t);
  const id = f.sample();
  const first = f.service.freshSample(id);
  assert.ok(first); f.advance(); f.emit({ batPct: 95 });
  assert.equal(f.service.freshSample(id).sampleId, first.sampleId, 'merged state does not fabricate a new pose');
  f.advance(15000);
  assert.equal(f.service.status(id).sample, null);
  assert.throws(() => f.service.save(id, { action: 'current', revision: null, sampleId: first.sampleId }), { status: 409 });
  f.advance(); f.emit({ pose: { theta: 92, point: { x: -114, y: 150 } } });
  const fresh = f.service.freshSample(id);
  assert.throws(() => f.service.save(id, { action: 'current', revision: null, sampleId: first.sampleId }), { status: 409 });
  const saved = f.service.save(id, { action: 'current', revision: null, sampleId: fresh.sampleId });
  assert.equal(saved.originX, -114); assert.equal(saved.originY, 150);
  assert.equal(saved.sampleAt, fresh.at); assert.equal(saved.protectedManual, true);
  f.client.emit('close'); assert.equal(f.service.status(id).sample, null);
  f.client.emit('connect'); f.emit({ batPct: 100 }); assert.equal(f.service.status(id).sample, null);
});
test('recorded-point calibration is explicit, resets placement and preserves rotation', t => {
  const f = fixture(t);
  const id = f.sample(); const previous = f.save(id, { offsetX: 77, offsetY: 88, rotation: 30 });
  const saved = f.service.save(id, { action: 'point', seq: 1, revision: previous.revision });
  assert.equal(saved.originX, 100); assert.equal(saved.originY, 200);
  assert.equal(saved.offsetX, 0); assert.equal(saved.offsetY, 0); assert.equal(saved.rotation, 30);
  assert.throws(() => f.service.save(id, { action: 'point', seq: 999, revision: saved.revision }), { status: 404 });
});
test('automatic dock calibration defaults off, ignores cached charge pose and calibrates once per task', t => {
  const f = fixture(t);
  const id = f.sample();
  assert.equal(f.service.policyStatus().enabled, false);
  f.service.setPolicy({ enabled: true }); f.advance();
  f.emit({ cleanMissionStatus: { nMssn: 1, cycle: 'none', phase: 'charge' } });
  assert.equal(f.service.get(id).revision, null, 'old running pose cannot become a dock sample');
  f.advance(); f.emit({ pose: { theta: 92, point: { x: -114, y: 150 } } });
  const docked = f.service.get(id);
  assert.equal(docked.source, 'dock'); assert.equal(docked.originX, -114); assert.equal(docked.autoDone, true);
  f.advance(); f.sample(1, -115, 151, 'charge');
  assert.equal(f.service.get(id).revision, docked.revision, 'each task is calibrated once');
  assert.equal(new Calibrations(f.store, f.directory).get(id).autoDone, true);
  f.advance(); const next = f.sample(2, 10, 20); f.advance(); f.sample(2, 12, 24, 'charge');
  assert.equal(f.service.get(next).originX, 12); assert.equal(f.service.get(next).autoDone, true);
});
test('automatic dock calibration rejects old phase context, unknown mission and manual overrides', t => {
  const f = fixture(t);
  const id = f.sample(); f.service.setPolicy({ enabled: true });
  f.advance(); f.emit({ cleanMissionStatus: { nMssn: 1, cycle: 'none', phase: 'charge' } });
  f.advance(6000); f.emit({ pose: { theta: 90, point: { x: 5, y: 6 } } });
  assert.equal(f.service.get(id).revision, null, 'old charge context is insufficient');
  const manual = f.save(id, { originX: 99 });
  f.advance(); f.sample(1, 15, 16, 'charge'); assert.equal(f.service.get(id).revision, manual.revision);
  f.advance(); f.emit({ cleanMissionStatus: { nMssn: 2, cycle: 'clean' }, pose: { theta: 90, point: { x: 1, y: 2 } } });
  assert.equal(f.service.get(f.store.current.meta.id).revision, null, 'charge context cannot leak across tasks');
});
test('reset restores the robot frame and remains protected from automatic recalibration', t => {
  const f = fixture(t);
  const id = f.sample();
  const saved = f.save(id, { originX: 100, rotation: 45 });
  const reset = f.service.save(id, { action: 'reset', revision: saved.revision });
  for (const [key, value] of Object.entries(coordinates.defaults)) assert.equal(reset[key], value);
  assert.equal(reset.protectedManual, true);
  f.service.setPolicy({ enabled: true }); f.advance(); f.sample(1, 20, 30, 'charge');
  assert.equal(f.service.get(id).revision, reset.revision);
});
test('automatic calibration ignores the initial charging shadow and requires a charge transition after enabling', t => {
  const f = fixture(t);
  const id = f.sample(); f.service.setPolicy({ enabled: true });
  f.client.emit('close'); f.client.emit('connect'); f.advance();
  f.sample(1, 100, 200, 'charge');
  assert.equal(f.service.get(id).revision, null, 'initial full shadow must not calibrate a possibly cached pose');
  f.advance(); f.emit({ pose: { theta: 90, point: { x: 101, y: 201 } } });
  assert.equal(f.service.get(id).revision, null, 'remaining in charge after a reconnect is insufficient');
  f.advance(); f.sample(1, 102, 202, 'run'); f.advance(); f.sample(1, 103, 203, 'charge');
  assert.equal(f.service.get(id).source, 'dock');
});
test('damaged calibration does not hide maps, auto cannot overwrite it, and deletion removes metadata', t => {
  const f = fixture(t);
  const id = f.sample(); f.save(id);
  fs.writeFileSync(f.service.file(id), '{broken');
  assert.ok(f.store.get(id).calibration.error); assert.equal(f.store.get(id).points.length, 1);
  f.service.setPolicy({ enabled: true }); f.advance(); f.sample(1, 20, 30, 'charge');
  assert.match(f.service.policyStatus().error, /failed/);
  f.store.remove(id); assert.equal(fs.existsSync(f.service.file(id)), false);
  fs.writeFileSync(f.service.policyFile, '{broken');
  const restarted = new Calibrations(f.store, f.directory);
  assert.equal(restarted.policyStatus().enabled, false); assert.match(restarted.policyStatus().error, /disabled/);
});
test('calibrated exports preserve original points and include the saved transform and map coordinates', t => {
  const f = fixture(t);
  const id = f.sample();
  const value = f.save(id, { originX: 100, originY: 200, offsetX: 50 });
  const data = exporter.snapshot(f.store.findMission(id), null, value);
  assert.equal(data.version, 2); assert.equal(data.points[0].x, 100); assert.equal(data.mapPoints[0].x, 50);
  assert.equal(data.mapPoints[0].y, 0); assert.equal(data.calibration.revision, value.revision);
  assert.match(exporter.csv(data), /map_x,map_y,map_theta/);
  assert.ok(!JSON.stringify(data).includes('password'));
});

test('calibration listeners are released and the client can be attached again', t => {
  const f = fixture(t);
  const client = new EventEmitter();
  const detach = f.service.attach(client);
  assert.equal(client.listenerCount('update'), 1);
  detach();
  for (const event of ['connect', 'close', 'error', 'update']) assert.equal(client.listenerCount(event), 0);
  f.service.attach(client)();
  assert.equal(client.listenerCount('update'), 0);
});
