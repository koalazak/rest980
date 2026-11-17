'use strict';
const fs = require('fs');
const path = require('path');
const defaults = { sizeW: 800, sizeH: 800, offsetX: 0, offsetY: 0, pointIntervalMs: 800, autoFit: true };
const ranges = { sizeW: [200, 4096],
  sizeH: [200, 4096],
  offsetX: [-1000000, 1000000],
  offsetY: [-1000000, 1000000],
  pointIntervalMs: [500, 60000] };
function validate (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Settings must be an object');
  const result = {};
  for (const [key, limits] of Object.entries(ranges)) {
    const number = value[key];
    if (!Number.isInteger(number) || number < limits[0] || number > limits[1]) {
      throw new Error(key + ' must be an integer in ' + limits.join('..'));
    }
    result[key] = number;
  }
  if (typeof value.autoFit !== 'boolean') throw new Error('autoFit must be a boolean');
  result.autoFit = value.autoFit;
  return result;
}
function atomicJSON (filename, value) {
  fs.writeFileSync(filename + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o640 });
  fs.renameSync(filename + '.tmp', filename);
}
class Settings {
  constructor (directory) { this.filename = path.join(directory, 'settings.json'); }
  get () { return validate(JSON.parse(fs.readFileSync(this.filename, 'utf8'))); }
  save (body) {
    let value;
    try { value = validate(body); } catch (error) { error.status = 400; throw error; }
    atomicJSON(this.filename, value);
    return value;
  }
}
module.exports = { defaults, validate, atomicJSON, Settings };
