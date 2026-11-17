'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicJSON } = require('./settings.js');
const { validId } = require('./library.js');
const coordinates = require('../../public/js/map-coordinates');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const finite = n => typeof n === 'number' && Number.isFinite(n);
function fail (message, status = 400) { return Object.assign(new Error(message), { status }); }
function validate (body) {
  if (!body || typeof body !== 'object') throw fail('Missing coordinate transform');
  const result = {};
  for (const key of Object.keys(coordinates.defaults)) {
    const limit = key === 'rotation' ? 180 : 1000000;
    if (!finite(body[key]) || Math.abs(body[key]) > limit) throw fail('Invalid ' + key + ' (range ' + -limit + '..' + limit + ')');
    result[key] = body[key];
  }
  return result;
}
class Calibrations {
  constructor (store, directory) {
    this.store = store; this.directory = path.join(directory, 'calibrations');
    this.policyFile = path.join(directory, 'calibration-policy.json');
    this.lastSample = null; this.candidate = null; this.lastError = null;
    this.autoAfter = store.now(); this.clients = new WeakSet();
    this.policy = { enabled: false };
    if (fs.existsSync(this.policyFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.policyFile, 'utf8'));
        if (typeof saved.enabled !== 'boolean') throw new Error('Invalid policy');
        this.policy = { enabled: saved.enabled };
      } catch (error) { this.lastError = 'Automatic calibration disabled: ' + error.message; }
    }
  }
  file (id) {
    if (!validId(id)) throw fail('Use an explicit mission ID');
    return path.join(this.directory, id + '.json');
  }
  get (id) {
    const filename = this.file(id);
    if (!fs.existsSync(filename)) return Object.assign({}, coordinates.defaults, { revision: null, source: 'raw', autoDone: false, protectedManual: false });
    const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (typeof saved.revision !== 'string' || !/^[0-9a-f]{32}$/.test(saved.revision) ||
        typeof saved.autoDone !== 'boolean' || typeof saved.protectedManual !== 'boolean') throw fail('Invalid saved calibration', 503);
    return Object.assign(validate(saved), { revision: saved.revision,
      source: saved.source,
      autoDone: saved.autoDone,
      protectedManual: saved.protectedManual,
      updatedAt: saved.updatedAt,
      sampleAt: saved.sampleAt || null });
  }
  safeGet (id) {
    try { return this.get(id); } catch (error) { return Object.assign({}, coordinates.defaults, { revision: null, error: 'Unable to read calibration: ' + error.message }); }
  }
  write (id, value, previous, source, sampleAt) {
    this.file(id); this.store.findMission(id);
    const saved = Object.assign(validate(value), { revision: crypto.randomBytes(16).toString('hex'),
      source,
      autoDone: source === 'dock' || previous.autoDone === true,
      protectedManual: source !== 'dock',
      updatedAt: new Date(this.store.now()).toISOString(),
      sampleAt: sampleAt || null });
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o750 });
    atomicJSON(this.file(id), saved); return saved;
  }
  save (id, body) {
    this.file(id); const record = this.store.findMission(id); const previous = this.get(id);
    if (!body || !own(body, 'revision') || body.revision !== previous.revision) throw fail('Calibration changed. Reload it before saving.', 409);
    let value;
    let sampleAt;
    if (body.action === 'current') {
      const sample = this.freshSample(id);
      if (!sample || body.sampleId !== sample.sampleId) throw fail('No matching fresh position. Wait for a new robot pose and retry.', 409);
      value = Object.assign({}, previous, { originX: sample.x, originY: sample.y, offsetX: 0, offsetY: 0 }); sampleAt = sample.at;
    } else if (body.action === 'point') {
      if (!Number.isInteger(body.seq)) throw fail('Select a recorded point');
      const point = record.points.find(p => p.seq === body.seq);
      if (!point) throw fail('Recorded point not found', 404);
      value = Object.assign({}, previous, { originX: point.x, originY: point.y, offsetX: 0, offsetY: 0 }); sampleAt = point.t;
    } else if (body.action === 'reset') value = coordinates.defaults;
    else if (body.action === 'manual') value = validate(body);
    else throw fail('Unknown calibration action');
    return this.write(id, value, previous, body.action === 'reset' ? 'raw' : 'manual', sampleAt);
  }
  setPolicy (body) {
    if (!body || typeof body.enabled !== 'boolean') throw fail('enabled must be a boolean');
    const saved = { enabled: body.enabled }; atomicJSON(this.policyFile, saved);
    this.policy = saved; this.autoAfter = this.store.now(); this.lastError = null;
    return this.policyStatus();
  }
  policyStatus () { return { enabled: this.policy.enabled, error: this.lastError }; }
  freshSample (id) {
    const sample = this.lastSample;
    const age = sample ? this.store.now() - sample.time : Infinity;
    return sample && sample.missionId === id && this.store.online && age >= 0 && age <= 15000 ? sample : null;
  }
  status (id) {
    const sample = this.freshSample(id);
    return { sample: sample ? { x: sample.x, y: sample.y, theta: sample.theta, at: sample.at, sampleId: sample.sampleId } : null,
      policy: this.policyStatus(),
      freshnessSeconds: 15 };
  }
  attachStore () {
    const service = this;
    const ingest = this.store.ingest;
    const get = this.store.get;
    const remove = this.store.remove;
    this.store.ingest = function (state) {
      const result = ingest.call(this, state);
      service.afterIngest(state); return result;
    };
    this.store.get = function (...args) {
      const data = get.apply(this, args);
      data.calibration = data.id ? service.safeGet(data.id) : null;
      data.calibrationStatus = service.status(data.id); return data;
    };
    this.store.remove = function (id) {
      const result = remove.call(this, id);
      for (const suffix of ['', '.tmp']) {
        const filename = service.file(id) + suffix;
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      }
      if (service.lastSample && service.lastSample.missionId === id) service.lastSample = null;
      return result;
    };
  }
  afterIngest (state) {
    const sample = this.candidate;
    const record = this.store.current;
    const status = state && state.cleanMissionStatus;
    const pose = state && state.pose;
    if (!sample || !record || !status || !pose || !pose.point || sample.nMssn !== record.meta.nMssn ||
        status.nMssn !== record.meta.nMssn || sample.x !== pose.point.x || sample.y !== pose.point.y || sample.theta !== pose.theta) return;
    this.lastSample = Object.assign({}, sample, { missionId: record.meta.id });
    if (!this.policy.enabled || sample.time <= this.autoAfter || sample.phase !== 'charge' || status.phase !== 'charge' ||
        sample.chargeStart === null || sample.chargeStart < this.autoAfter || sample.time < sample.chargeStart ||
        sample.time - sample.phaseAt > 5000 || this.store.now() - sample.time > 15000) return;
    try {
      const previous = this.get(record.meta.id);
      if (previous.autoDone || previous.protectedManual) return;
      this.write(record.meta.id, Object.assign({}, previous, { originX: sample.x, originY: sample.y, offsetX: 0, offsetY: 0 }), previous, 'dock', sample.at);
      this.lastError = null;
    } catch (error) { this.lastError = 'Automatic calibration failed: ' + error.message; }
  }
  attach (client) {
    if (this.clients.has(client)) return; this.clients.add(client);
    let status = {};
    let phaseAt = -Infinity;
    let chargeStart = null;
    const clear = () => { status = {}; phaseAt = -Infinity; chargeStart = null; this.candidate = null; this.lastSample = null; };
    client.on('connect', clear); client.on('close', clear); client.on('error', clear);
    const onUpdate = message => {
      const reported = message && message.state && message.state.reported;
      if (!reported || typeof reported !== 'object') return;
      const now = this.store.now();
      if (reported.cleanMissionStatus && typeof reported.cleanMissionStatus === 'object') {
        if (own(reported.cleanMissionStatus, 'nMssn') && reported.cleanMissionStatus.nMssn !== status.nMssn) {
          status = {}; phaseAt = -Infinity; chargeStart = null;
        }
        if (own(reported.cleanMissionStatus, 'phase')) {
          const phase = reported.cleanMissionStatus.phase;
          if (phase === 'charge' && typeof status.phase === 'string' && status.phase !== 'charge') chargeStart = now;
          else if (phase !== 'charge') chargeStart = null;
          phaseAt = now;
        }
        status = Object.assign({}, status, reported.cleanMissionStatus);
      }
      if (!own(reported, 'pose')) return;
      const pose = reported.pose;
      this.candidate = null; this.lastSample = null;
      if (!pose || !pose.point || ![pose.theta, pose.point.x, pose.point.y].every(finite)) return;
      this.candidate = { x: pose.point.x,
        y: pose.point.y,
        theta: pose.theta,
        nMssn: status.nMssn,
        phase: status.phase,
        phaseAt,
        chargeStart,
        time: now,
        at: new Date(now).toISOString(),
        sampleId: crypto.randomBytes(12).toString('hex') };
    };
    client.on('update', onUpdate);
    return () => {
      client.removeListener('connect', clear); client.removeListener('close', clear); client.removeListener('error', clear);
      client.removeListener('update', onUpdate); this.clients.delete(client); clear();
    };
  }
}
module.exports = { Calibrations, validate };
