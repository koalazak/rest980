'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicJSON } = require('./settings.js');
const validId = id => typeof id === 'string' && /^m(?:\d+|unknown)-\d+(?:-\d+)?$/.test(id);
function fail (message, status = 400) { return Object.assign(new Error(message), { status }); }
function validateText (body) {
  if (!body || typeof body.title !== 'string' || typeof body.note !== 'string') throw fail('title and note must be strings');
  if (body.title.length > 120 || body.note.length > 4000) throw fail('Title limit: 120 characters; note limit: 4000 characters');
  // Reject control bytes in saved text.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(body.title) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.note)) throw fail('Unsupported control characters');
  return { title: body.title.trim(), note: body.note.trim() };
}
class Notes {
  constructor (store, directory) { this.store = store; this.directory = path.join(directory, 'notes'); }
  file (id) {
    if (!validId(id)) throw fail('Use an explicit mission ID');
    return path.join(this.directory, id + '.json');
  }
  get (id) {
    const filename = this.file(id);
    if (!fs.existsSync(filename)) return { title: '', note: '', revision: null };
    const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const text = validateText(raw);
    if (typeof raw.revision !== 'string' || !/^[0-9a-f]{32}$/.test(raw.revision)) throw fail('Invalid saved note revision', 503);
    return Object.assign(text, { revision: raw.revision, updatedAt: raw.updatedAt });
  }
  safeGet (id) {
    try { return this.get(id); } catch (error) { return { title: '', note: '', revision: null, error: 'Unable to load note: ' + error.message }; }
  }
  save (id, body) {
    this.file(id);
    this.store.findMission(id); // Deleted maps cannot acquire new notes.
    const text = validateText(body);
    const current = this.get(id);
    if (!Object.prototype.hasOwnProperty.call(body, 'revision')) throw fail('Missing revision; reload the task first');
    if (body.revision !== current.revision) throw fail('Notes changed in another page. Reload this task before saving.', 409);
    const saved = Object.assign(text, { revision: crypto.randomBytes(16).toString('hex'), updatedAt: new Date().toISOString() });
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o750 });
    atomicJSON(this.file(id), saved);
    return saved;
  }
  attach (decorate = true) {
    const notes = this;
    if (decorate) {
      const get = this.store.get;
      this.store.get = function (...args) {
        const data = get.apply(this, args);
        data.annotation = data.id ? notes.safeGet(data.id) : null;
        return data;
      };
      const list = this.store.list;
      this.store.list = function () { return list.call(this).map(item => Object.assign(item, { annotation: notes.safeGet(item.id) })); };
    }
    const remove = this.store.remove;
    this.store.remove = function (id) {
      const result = remove.call(this, id);
      for (const suffix of ['', '.tmp']) {
        const filename = notes.file(id) + suffix;
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      }
      return result;
    };
  }
}
module.exports = { Notes, validId };
