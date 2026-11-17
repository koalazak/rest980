'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicJSON } = require('./settings.js');
const disabled = { enabled: false, maxCount: 0, maxDays: 0 };
function bad (message, status = 400) { return Object.assign(new Error(message), { status }); }
function validatePolicy (value) {
  if (!value || typeof value.enabled !== 'boolean') throw bad('enabled must be a boolean');
  const result = { enabled: value.enabled };
  for (const key of ['maxCount', 'maxDays']) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 10000) {
      throw bad(key + ' must be an integer in 0..10000');
    }
    result[key] = value[key];
  }
  if (result.enabled && !result.maxCount && !result.maxDays) throw bad('Choose at least one positive limit');
  return result;
}
class Retention {
  constructor (store, directory, flush, now = Date.now) {
    this.store = store;
    this.filename = path.join(directory, 'retention.json');
    this.flush = flush;
    this.now = now;
    this.plans = new Map();
    this.lastRun = null;
    this.lastError = null;
    this.lastDeleted = 0;
    this.policy = Object.assign({}, disabled);
    try {
      if (fs.existsSync(this.filename)) this.policy = validatePolicy(JSON.parse(fs.readFileSync(this.filename, 'utf8')));
    } catch (error) { this.lastError = 'Retention policy not loaded; automatic cleanup disabled: ' + error.message; }
  }
  status () { return { policy: this.policy, lastRun: this.lastRun, lastError: this.lastError, lastDeleted: this.lastDeleted }; }
  candidates (policy) {
    const missions = this.store.list();
    const threshold = this.now() - policy.maxDays * 86400000;
    return missions.filter((mission, index) => {
      const exceeded = policy.maxCount > 0 && index >= policy.maxCount;
      const old = policy.maxDays > 0 && Date.parse(mission.updatedAt || mission.createdAt) < threshold;
      if (!exceeded && !old) return false;
      try { return Boolean(this.store.validateDeletion(mission.id)); } catch (_) { return false; }
    }).slice(0, 200).map(mission => mission.id);
  }
  preview (body) {
    this.flush();
    let policy = null;
    let ids;
    if (Object.prototype.hasOwnProperty.call(body, 'policy')) {
      policy = validatePolicy(body.policy);
      ids = policy.enabled ? this.candidates(policy) : [];
    } else {
      if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 200 ||
          body.ids.some(id => typeof id !== 'string')) throw bad('Select between 1 and 200 explicit mission IDs');
      ids = Array.from(new Set(body.ids));
      ids.forEach(id => this.store.validateDeletion(id));
      ids = ids.filter(id => !this.store.isDeleted(id));
    }
    for (const [token, plan] of this.plans) if (plan.expires <= this.now()) this.plans.delete(token);
    if (this.plans.size >= 100) throw bad('Too many pending previews; try again later', 429);
    const token = crypto.randomBytes(24).toString('hex');
    const expires = this.now() + 300000;
    this.plans.set(token, { ids, policy, expires });
    const targets = ids.map(id => {
      const meta = this.store.findMission(id).meta;
      return { id, nMssn: meta.nMssn, createdAt: meta.createdAt, count: meta.count };
    });
    return { token, expiresAt: new Date(expires).toISOString(), targets, policy, maxPerRun: 200 };
  }
  execute (ids) {
    this.flush();
    // Validate the entire fixed snapshot again before deleting anything.
    ids.forEach(id => this.store.validateDeletion(id));
    const deleted = [];
    const failed = [];
    for (const id of ids) {
      try { this.store.remove(id); deleted.push(id); } catch (error) { failed.push({ id, error: error.message }); break; }
    }
    this.lastRun = new Date(this.now()).toISOString();
    this.lastDeleted = deleted.length;
    this.lastError = failed.length ? failed[0].error : null;
    return { deleted, failed, unprocessed: ids.slice(deleted.length + failed.length) };
  }
  apply (token) {
    const plan = this.plans.get(token);
    if (!plan || plan.expires <= this.now()) throw bad('Preview expired; generate a new preview', 409);
    this.plans.delete(token);
    const result = this.execute(plan.ids);
    if (!result.failed.length && plan.policy) {
      atomicJSON(this.filename, plan.policy);
      this.policy = plan.policy;
    }
    return Object.assign(result, { policy: this.policy });
  }
  autoRun () {
    if (!this.policy.enabled) return;
    try { this.flush(); this.execute(this.candidates(this.policy)); } catch (error) { this.lastError = error.message; }
  }
  schedule () {
    // No filesystem cleanup until a user explicitly enables a persisted policy.
    const startup = setTimeout(() => this.autoRun(), 60000);
    const periodic = setInterval(() => this.autoRun(), 3600000);
    startup.unref(); periodic.unref();
    return () => { clearTimeout(startup); clearInterval(periodic); };
  }
}
module.exports = { Retention, disabled, validatePolicy };
