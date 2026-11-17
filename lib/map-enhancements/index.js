'use strict';
const fs = require('fs');
const path = require('path');
const settingsModule = require('./settings');
const features = ['settings', 'summary', 'status', 'retention'];
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
      const retention = new (require('./retention').Retention)(store, directory, flush);
      router.get('/local/history/enhancements', handler(() => ({ version: 2,
        features,
        settings: settings.get(),
        retention: retention.status() })));
      router.get('/local/history/enhancements/settings', handler(() => settings.get()));
      router.post('/local/history/enhancements/settings', handler(req => settings.save(req.body)));
      router.get('/local/history/enhancements/retention', handler(() => retention.status()));
      router.post('/local/history/enhancements/retention/plan', handler(req => retention.preview(req.body || {})));
      router.post('/local/history/enhancements/retention/apply', handler(req => retention.apply((req.body || {}).token)));
      stopCleanup = retention.schedule();
    }
  };
}
module.exports = { create };
