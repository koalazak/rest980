'use strict';

const path = require('path');
const HistoryStore = require('./map-history-store').HistoryStore;

function settingsFrom (config, env) {
  return {
    directory: env.MAP_HISTORY_DIRECTORY || config.mapHistoryDirectory || '',
    firmwareVersion: parseInt(env.FIRMWARE_VERSION || config.firmwareVersion || 1, 10),
    keepAlive: (env.KEEP_ALIVE || config.keepAlive || 'yes') === 'yes',
    enableLocal: (env.ENABLE_LOCAL || config.enableLocal || 'yes') === 'yes'
  };
}

function isEnabled (options) {
  return Boolean(options.directory && options.firmwareVersion === 2 && options.keepAlive && options.enableLocal);
}

function createRecorder (options) {
  const enabled = isEnabled(options);
  const clients = new Map();
  let store;
  let initializationError;
  if (enabled) {
    try {
      store = new HistoryStore(path.resolve(options.directory));
    } catch (error) {
      initializationError = error;
      console.error('[map-history] initialization failed:', error.message);
    }
  }

  function install (router) {
    function handler (fn) {
      return function (req, res) {
        res.set('Cache-Control', 'no-store');
        try {
          if (!enabled) {
            throw new Error('Map history requires mapHistoryDirectory, firmwareVersion=2, keepAlive=yes and enableLocal=yes.');
          }
          if (!store) throw initializationError;
          res.json(fn(req));
        } catch (error) {
          res.status(error.status || 503).json({ error: error.message });
        }
      };
    }
    router.get('/local/history', handler(() => ({
      missions: store.list(),
      currentId: store.current && store.current.meta.id,
      online: store.online,
      lastSeen: store.lastSeen,
      recordingError: store.error
    })));
    router.get('/local/history/points', handler(req => {
      const after = req.query.after === undefined ? 0 : Number(req.query.after);
      if (!Number.isSafeInteger(after) || after < 0) {
        throw Object.assign(new Error('Invalid cursor'), { status: 400 });
      }
      return store.get(req.query.mission || 'latest', after, req.query.known || '');
    }));
  }

  function attach (client) {
    if (!store || !client || clients.has(client)) return;
    let pending;
    let timer;
    let lastErrorLog = 0;
    function save () {
      timer = null;
      if (!pending) return;
      try {
        store.ingest(pending);
      } catch (error) {
        store.error = 'History write failed: ' + error.message;
        if (Date.now() - lastErrorLog > 30000) {
          console.error('[map-history]', store.error);
          lastErrorLog = Date.now();
        }
      }
      pending = null;
    }
    function onState (state) {
      pending = state;
      if (!timer) timer = setTimeout(save, 250);
    }
    function onClose () {
      if (timer) clearTimeout(timer);
      save();
      store.markDisconnected();
    }
    function onError () {
      store.markDisconnected();
    }
    client.on('state', onState);
    client.on('close', onClose);
    client.on('error', onError);
    clients.set(client, function detach () {
      onClose();
      client.removeListener('state', onState);
      client.removeListener('close', onClose);
      client.removeListener('error', onError);
    });
    console.log('[map-history] recording enabled:', path.resolve(options.directory));
  }

  function close () {
    clients.forEach(detach => detach());
    clients.clear();
    try {
      if (store) store.flush();
    } catch (error) {
      console.error('[map-history] flush failed:', error.message);
    }
    process.removeListener('exit', close);
  }
  if (store) process.once('exit', close);
  return { enabled, install, attach, close };
}

module.exports = { createRecorder, settingsFrom, isEnabled };
