'use strict';

const fs = require('fs');
const path = require('path');

const validId = value => typeof value === 'string' && /^m(?:\d+|unknown)-\d+(?:-\d+)?$/.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
const validPosition = point => point && finite(point.x) && finite(point.y) && finite(point.theta);
const activeMission = status => typeof status.cycle === 'string' && status.cycle !== 'none' && status.cycle !== '';
const validCursor = (after, total) => Number.isSafeInteger(after) && after >= 0 && after <= total;

function startsSegment (point, previous, now, disconnected) {
  if (disconnected || !previous) return true;
  return now - Date.parse(previous.t) > 30000 || point.phase === 'charge' || previous.phase === 'charge';
}

function projectState (state) {
  const result = {};
  for (const key of ['cleanMissionStatus', 'pose', 'batPct', 'bin', 'name', 'softwareVer']) {
    if (state[key] !== undefined) result[key] = clone(state[key]);
  }
  return result;
}

class HistoryStore {
  constructor (directory, now = Date.now) {
    this.directory = directory;
    this.now = now;
    this.current = null;
    this.liveState = {};
    this.lastSeen = null;
    this.online = false;
    this.discontinuity = true;
    this.error = null;
    this.lastMetaWrite = 0;
    this.lastSignature = null;
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    this.recover();
  }

  file (id, extension) {
    if (!validId(id)) throw new Error('Invalid mission id');
    return path.join(this.directory, id + extension);
  }

  atomicJSON (filename, value) {
    const temporary = filename + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o640 });
    fs.renameSync(temporary, filename);
  }

  readPoints (id, repair = false) {
    const filename = this.file(id, '.jsonl');
    if (!fs.existsSync(filename)) return [];
    let text = fs.readFileSync(filename, 'utf8');
    if (repair && text && !text.endsWith('\n')) {
      text = text.slice(0, text.lastIndexOf('\n') + 1);
      fs.writeFileSync(filename, text);
    }
    const points = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const point = JSON.parse(line);
        if (validPosition(point)) {
          points.push(Object.assign(point, { seq: points.length + 1 }));
        }
      } catch (_) { /* Preserve other complete records if one record is damaged. */ }
    }
    return points;
  }

  recover () {
    const pointer = path.join(this.directory, 'current.json');
    if (!fs.existsSync(pointer)) return;
    try {
      const id = JSON.parse(fs.readFileSync(pointer, 'utf8')).id;
      const meta = JSON.parse(fs.readFileSync(this.file(id, '.json'), 'utf8'));
      const points = this.readPoints(id, true);
      meta.count = points.length;
      const last = points[points.length - 1];
      if (last) {
        meta.updatedAt = last.t;
        meta.lastState = meta.lastState || {};
        meta.lastState.pose = { theta: last.theta, point: { x: last.x, y: last.y } };
        meta.lastState.cleanMissionStatus = Object.assign({}, meta.lastState.cleanMissionStatus,
          { phase: last.phase, cycle: last.cycle });
      }
      this.current = { meta, points };
      this.liveState = meta.lastState || {};
      // Never join across a process restart: positions during downtime are unknown.
      this.discontinuity = true;
    } catch (error) {
      this.error = 'Unable to restore the latest mission: ' + error.message;
    }
  }

  markDisconnected () {
    this.online = false;
    this.discontinuity = true;
  }

  createMission (number, state, timestamp) {
    this.flush();
    const prefix = 'm' + (Number.isInteger(number) && number >= 0 ? number : 'unknown') + '-' + this.now();
    let id = prefix;
    let suffix = 0;
    while (fs.existsSync(this.file(id, '.json'))) id = prefix + '-' + (++suffix);
    const meta = {
      version: 1,
      id,
      nMssn: number,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      count: 0,
      lastState: state
    };
    this.atomicJSON(this.file(id, '.json'), meta);
    this.atomicJSON(path.join(this.directory, 'current.json'), { id });
    this.current = { meta, points: [] };
    this.lastSignature = null;
    this.discontinuity = true;
    this.lastMetaWrite = this.now();
  }

  ingest (rawState) {
    if (!rawState || !rawState.cleanMissionStatus) return;
    const state = projectState(rawState);
    const timestamp = new Date(this.now()).toISOString();
    this.liveState = state;
    this.lastSeen = timestamp;
    this.online = true;
    if (!this.selectMission(state, timestamp)) return;
    this.updateMission(state, timestamp);
    this.error = null;
  }

  selectMission (state, timestamp) {
    const status = state.cleanMissionStatus;
    const number = Number.isInteger(status.nMssn) ? status.nMssn : null;
    if (activeMission(status) && (!this.current || this.current.meta.nMssn !== number)) {
      this.createMission(number, state, timestamp);
    }
    // Idle before the first observed task is not a cleaning history.
    if (!this.current) return false;
    return number === null || this.current.meta.nMssn === number;
  }

  updateMission (state, timestamp) {
    const meta = this.current.meta;
    const status = state.cleanMissionStatus;
    const oldPhase = meta.lastState.cleanMissionStatus.phase;
    meta.lastState = state;
    meta.updatedAt = timestamp;
    // A mid-mission recharge may later resume with the same mission number.
    if (activeMission(status)) meta.completedAt = null;
    else if (!meta.completedAt) meta.completedAt = timestamp;
    this.recordPosition(state, timestamp);
    if (this.now() - this.lastMetaWrite >= 5000 || oldPhase !== status.phase) this.flush();
  }

  recordPosition (state, timestamp) {
    const pose = state.pose;
    if (!pose || !pose.point || !finite(pose.theta)) {
      this.discontinuity = true;
      return;
    }
    const point = {
      seq: this.current.points.length + 1,
      t: timestamp,
      x: pose.point.x,
      y: pose.point.y,
      theta: pose.theta,
      phase: state.cleanMissionStatus.phase || '',
      cycle: state.cleanMissionStatus.cycle || ''
    };
    if (!validPosition(point)) {
      this.discontinuity = true;
      return;
    }
    const signature = JSON.stringify([point.x, point.y, point.theta, point.phase, point.cycle]);
    if (signature === this.lastSignature) return;
    const previous = this.current.points[this.current.points.length - 1];
    point.break = startsSegment(point, previous, this.now(), this.discontinuity);
    fs.appendFileSync(this.file(this.current.meta.id, '.jsonl'), JSON.stringify(point) + '\n', { mode: 0o640 });
    this.current.points.push(point);
    this.current.meta.count = this.current.points.length;
    this.lastSignature = signature;
    this.discontinuity = false;
  }

  flush () {
    if (!this.current) return;
    this.atomicJSON(this.file(this.current.meta.id, '.json'), this.current.meta);
    this.lastMetaWrite = this.now();
  }

  list () {
    const missions = [];
    for (const filename of fs.readdirSync(this.directory)) {
      const id = filename.endsWith('.json') ? filename.slice(0, -5) : '';
      if (!validId(id)) continue;
      try {
        const meta = this.current && this.current.meta.id === id ? this.current.meta
          : JSON.parse(fs.readFileSync(this.file(id, '.json'), 'utf8'));
        missions.push({
          id,
          nMssn: meta.nMssn,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          completedAt: meta.completedAt,
          count: meta.count
        });
      } catch (_) { /* A damaged metadata file must not disable the controls. */ }
    }
    return missions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findMission (requested) {
    const id = requested === 'latest' ? this.current && this.current.meta.id : requested;
    if (!id) return null;
    if (!validId(id)) throw Object.assign(new Error('Invalid mission id'), { status: 400 });
    const isCurrent = this.current && this.current.meta.id === id;
    if (!isCurrent && !fs.existsSync(this.file(id, '.json'))) {
      throw Object.assign(new Error('Mission not found'), { status: 404 });
    }
    return isCurrent ? this.current : {
      meta: JSON.parse(fs.readFileSync(this.file(id, '.json'), 'utf8')), points: this.readPoints(id)
    };
  }

  get (requested = 'latest', after = 0, known = '') {
    const record = this.findMission(requested);
    const connection = { online: this.online, lastSeen: this.lastSeen, recordingError: this.error };
    if (!record) return Object.assign({ id: null, total: 0, points: [], state: this.liveState }, connection);
    const id = record.meta.id;
    const start = known === id && validCursor(after, record.points.length) ? after : 0;
    return Object.assign({
      id,
      nMssn: record.meta.nMssn,
      total: record.points.length,
      points: record.points.slice(start),
      reset: start === 0,
      state: record === this.current ? this.liveState : record.meta.lastState,
      updatedAt: record.meta.updatedAt
    }, connection);
  }
}

module.exports = { HistoryStore, projectState, validId };
