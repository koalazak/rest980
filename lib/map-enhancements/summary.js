'use strict';
const fs = require('fs');
const finiteNonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function collect (meta, state) {
  const status = state.cleanMissionStatus || {};
  const stats = meta.stats || (meta.stats = {});
  // The robot can reset these counters when becoming idle. Retain reported maxima.
  for (const key of ['mssnM', 'sqft']) {
    if (finiteNonnegative(status[key])) stats[key] = Math.max(stats[key] || 0, status[key]);
  }
  if (finiteNonnegative(state.batPct) && state.batPct <= 100) stats.batteryLast = state.batPct;
}
function summarize (meta, isCurrent) {
  const state = meta.lastState || {};
  const status = state.cleanMissionStatus || {};
  const stats = Object.assign({}, meta.stats);
  for (const key of ['mssnM', 'sqft']) {
    if (finiteNonnegative(status[key])) stats[key] = Math.max(stats[key] || 0, status[key]);
  }
  const active = !meta.completedAt && isCurrent;
  let condition = 'ended';
  if (active) {
    condition = typeof status.error === 'number' && status.error !== 0 ? 'error'
      : status.phase === 'charge' || status.phase === 'recharge' ? 'recharging'
        : status.phase === 'stop' || status.phase === 'pause' ? 'paused' : 'active';
  }
  const start = Date.parse(meta.createdAt);
  const end = Date.parse(meta.completedAt || meta.updatedAt);
  return { condition,
    phase: status.phase || '',
    cycle: status.cycle || '',
    error: status.error === undefined ? null : status.error,
    observedFrom: meta.createdAt,
    observedTo: meta.completedAt || meta.updatedAt,
    observedMinutes: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 60000) : null,
    reportedMinutes: finiteNonnegative(stats.mssnM) ? stats.mssnM : null,
    reportedAreaM2: finiteNonnegative(stats.sqft) ? stats.sqft * 0.09290304 : null,
    batteryLast: stats.batteryLast === undefined ? (finiteNonnegative(state.batPct) ? state.batPct : null) : stats.batteryLast };
}
function attach (store) {
  const update = store.updateMission;
  store.updateMission = function (state, timestamp) {
    collect(this.current.meta, state);
    return update.call(this, state, timestamp);
  };
  const list = store.list;
  store.list = function () {
    return list.call(this).map(item => {
      const isCurrent = Boolean(this.current && this.current.meta.id === item.id);
      const meta = isCurrent ? this.current.meta : JSON.parse(fs.readFileSync(this.file(item.id, '.json'), 'utf8'));
      return Object.assign(item, { summary: summarize(meta, isCurrent) });
    });
  };
  const get = store.get;
  store.get = function (...args) {
    const data = get.apply(this, args);
    const record = data.id && this.findMission(data.id);
    data.summary = record ? summarize(record.meta, record === this.current) : null;
    return data;
  };
}
module.exports = { collect, summarize, attach };
