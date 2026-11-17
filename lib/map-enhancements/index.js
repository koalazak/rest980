'use strict';
const fs = require('fs');
const path = require('path');
const settingsModule = require('./settings');
const features = ['settings', 'summary', 'status'];
function create (store, directory) {
  require('./summary').attach(store);
  const status = require('./status').attach(store);
  const settings = new settingsModule.Settings(directory);
  if (!fs.existsSync(settings.filename)) {
    let seed = settingsModule.defaults;
    try {
      seed = settingsModule.validate(Object.assign({}, seed, JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/mapvalues.json'), 'utf8'))));
    } catch (_) { /* Invalid legacy preferences fall back to validated defaults. */ }
    settings.save(seed);
  }
  let stopCleanup;

  return {
    attach (client) { return status.attach(client); },
    close () { if (stopCleanup) stopCleanup(); },
    install (router, handler, flush) {
      router.get('/local/history/enhancements', handler(() => ({ version: 2,
        features,
        settings: settings.get(),
        retention: null })));
      router.get('/local/history/enhancements/settings', handler(() => settings.get()));
      router.post('/local/history/enhancements/settings', handler(req => settings.save(req.body)));
    }
  };
}
module.exports = { create };
