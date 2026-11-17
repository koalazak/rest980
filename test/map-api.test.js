'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const http = require('http');
const createRequire = require('module').createRequire;
const EventEmitter = require('events');
const mapHistory = require('../lib/map-history');

function load (relative, overrides) {
  const filename = path.resolve(__dirname, '..', relative);
  const fallback = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    __dirname: path.dirname(filename),
    process: { env: {}, version: process.version },
    console,
    require: name => Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : fallback(name)
  }, { filename });
  return module.exports;
}

function request (server, url, authorized = true, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const headers = authorized ? { Authorization: 'Basic ' + Buffer.from('test:map-test').toString('base64') } : {};
    headers['Content-Type'] = 'application/json';
    const outgoing = http.request({ host: '127.0.0.1', port: server.address().port, path: url, headers, method }, response => {
      let body = '';
      response.on('data', data => { body += data; });
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
    }).on('error', reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('history shares existing authentication and connection; action and map routes still work', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rest980-map-api-'));
  let client;
  let recorder;
  let connections = 0;
  let missionId;
  const config = {
    blid: 'test-robot',
    password: 'test-password',
    robotIP: '192.0.2.1',
    firmwareVersion: 2,
    keepAlive: 'yes',
    enableLocal: 'yes',
    enableCloud: 'no',
    mapHistoryDirectory: directory,
    basicAuthUser: 'test',
    basicAuthPass: 'map-test'
  };
  const api = load('routes/api.js', {
    config,
    dorita980: { Local: function () {
      connections++;
      client = new EventEmitter();
      client.start = () => Promise.resolve({ ok: null });
      return client;
    } },
    '../lib/map-history': Object.assign({}, mapHistory, {
      createRecorder (options) { recorder = mapHistory.createRecorder(options); return recorder; }
    })
  });
  const map = load('routes/map.js', { config });
  const app = load('app.js', { config, './routes/api': api, './routes/map': map });
  const server = http.createServer(app);
  function cleanup () {
    recorder.close();
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    .then(() => {
      assert.equal(connections, 1);
      assert.equal(client.listenerCount('state'), 1);
      client.emit('state', { cleanMissionStatus: { nMssn: 1, cycle: 'clean', phase: 'run' }, pose: { theta: 0, point: { x: 10, y: 20 } } });
      client.emit('close');
      return request(server, '/api/local/history', false);
    })
    .then(response => {
      assert.equal(response.status, 401);
      return request(server, '/api/local/history/points');
    })
    .then(async response => {
      assert.equal(response.status, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(JSON.parse(response.body).total, 1);
      missionId = JSON.parse(response.body).id;
      const info = await request(server, '/api/local/history/enhancements');
      assert.equal(info.status, 200); assert.ok(JSON.parse(info.body).features.includes('settings'));
      assert.ok(!info.body.includes('test-password'));
      const settings = JSON.parse(info.body).settings;
      assert.equal((await request(server, '/api/local/history/enhancements/settings', true, 'POST', Object.assign({}, settings, { offsetX: 0, offsetY: -25 }))).status, 200);
      assert.equal((await request(server, '/api/local/history/enhancements/settings', true, 'POST', { sizeW: 0 })).status, 400);
      for (const [url, method] of [['', 'GET'], ['/settings', 'POST'], ['/retention/plan', 'POST'], ['/retention/apply', 'POST']]) {
        assert.equal((await request(server, '/api/local/history/enhancements' + url, false, method, method === 'POST' ? {} : undefined)).status, 401);
      }
      assert.equal(client.listenerCount('state'), 1);

      assert.ok(!response.body.includes('test-password'));
      return request(server, '/api/local/history/points?after=invalid');
    })
    .then(response => {
      assert.equal(response.status, 400);
      return request(server, '/api/local/action/start');
    })
    .then(response => {
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { ok: null });
      return request(server, '/map');
    })
    .then(response => {
      assert.equal(response.status, 200);
      assert.match(response.body, /\/js\/map-history\.js/);
      assert.equal(connections, 1);
      return request(server, '/api/local/history/' + missionId, false, 'DELETE');
    })
    .then(response => {
      assert.equal(response.status, 401);
      return request(server, '/api/local/history/latest', true, 'DELETE');
    })
    .then(response => {
      assert.equal(response.status, 400, 'an alias cannot delete a task');
      return request(server, '/api/local/history/' + missionId, true, 'DELETE');
    })
    .then(response => {
      assert.equal(response.status, 409, 'an active task cannot be deleted');
      client.emit('state', { cleanMissionStatus: { nMssn: 1, cycle: 'none', phase: 'charge' }, pose: { theta: 0, point: { x: 10, y: 20 } } });
      return request(server, '/api/local/history/' + missionId, true, 'DELETE');
    })
    .then(response => {
      assert.equal(response.status, 200, 'flush pending completion state before deciding');
      assert.equal(JSON.parse(response.body).deleted, missionId);
      return request(server, '/api/local/history/points?mission=' + missionId);
    })
    .then(response => {
      assert.equal(response.status, 404);
      return request(server, '/api/local/history');
    })
    .then(response => {
      assert.deepEqual(JSON.parse(response.body).missions, []);
      assert.equal(connections, 1);
    })
    .then(cleanup, error => { cleanup(); throw error; });
});

test('firmware 1 and disabled history render the original map client', () => {
  const express = require('express');
  const config = { firmwareVersion: 1 };
  const app = express();
  app.set('views', path.resolve(__dirname, '../views'));
  app.set('view engine', 'ejs');
  app.use('/map', load('routes/map.js', { config }));
  const server = http.createServer(app);
  return new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    .then(() => request(server, '/map'))
    .then(response => {
      assert.equal(response.status, 200);
      assert.match(response.body, /var firmwareVersion = 1;/);
      assert.match(response.body, /\/js\/map\.js/);
      assert.ok(!response.body.includes('/js/map-history.js'));
    })
    .then(() => server.close(), error => { server.close(); throw error; });
});
