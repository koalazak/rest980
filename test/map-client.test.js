'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function browser (script, firmwareVersion = 2) {
  const requests = [];
  const lines = [];
  const text = {};
  const timers = new Map();
  let timerId = 0;
  function canvas () {
    return { width: 800,
      height: 800,
      getContext: () => new Proxy({}, {
        get: (_, method) => function () { if (method === 'lineTo') lines.push(Array.from(arguments)); }
      }) };
  }
  const elements = {
    historyAutoFit: { checked: true },
    path_layer: canvas(),
    robot_body_layer: canvas(),
    text_layer: canvas(),
    historyDelete: { disabled: true },
    historyMission: {
      value: 'latest',
      options: [{ value: 'latest' }],
      disabled: false,
      remove (index) { this.options.splice(index, 1); },
      appendChild (option) { this.options.push(option); }
    }
  };
  const jquery = selector => ({
    text (value) { text[selector] = value; return this; },
    html (value) { text[selector] = value; return this; },
    on () {},
    val () {}
  });
  jquery.ajax = options => {
    const done = [];
    const fail = [];
    const always = [];
    const request = {
      options,
      done (fn) { done.push(fn); return this; },
      fail (fn) { fail.push(fn); return this; },
      always (fn) { always.push(fn); return this; },
      resolve (data) { done.forEach(fn => fn(data)); always.forEach(fn => fn()); },
      reject (status = 503) { fail.forEach(fn => fn({ status }, 'error')); always.forEach(fn => fn()); },
      abort () { fail.forEach(fn => fn({ status: 0 }, 'abort')); always.forEach(fn => fn()); }
    };
    requests.push(request);
    return request;
  };
  const context = {
    window: { confirm: () => true },
    $: jquery,
    document: { getElementById: id => elements[id], querySelector: () => null, createElement: () => ({}) },
    sizeX: 800,
    sizeY: 800,
    xOffset: 0,
    yOffset: 0,
    updateEvery: 800,
    firmwareVersion,
    setTimeout (fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout (id) { timers.delete(id); }
  };
  vm.createContext(context);
  if (script === 'map-history.js') {
    context.window = context; context.confirm = () => true; context.performance = { now: () => 0 };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/map-replay.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/map-trajectory.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/map-enhancements.js'), 'utf8'), context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', script), 'utf8'), context);
  return { context,
    elements,
    requests,
    lines,
    text,
    timers,
    pointsRequests: () => requests.filter(request => request.options.url === '/api/local/history/points') };
}

test('live mapping selects the correct endpoint for both firmware protocols', () => {
  for (const firmware of [1, 2]) {
    const page = browser('map.js', firmware);
    page.context.startApp();
    assert.equal(page.requests[0].options.url, firmware === 2 ? '/api/local/info/state' : '/api/local/info/mission');
    page.context.startMissionLoop();
    assert.equal(page.requests.length, 1, 'one request in flight at a time');
    const position = { theta: 90, point: { x: 10, y: 20 } };
    const mission = { nMssn: 2, cycle: 'clean', phase: 'run' };
    const data = firmware === 2 ? { cleanMissionStatus: mission, pose: position, bin: { present: true } }
      : { ok: Object.assign({ pos: position }, mission) };
    page.requests[0].resolve(data);
    assert.equal(page.text['#x'], 10);
    assert.equal(page.timers.size, 1);
    if (firmware === 2) assert.equal(mission.pos, undefined, 'do not mutate cached mission state');
  }
});

test('live mapping retries failed requests and waits for missing coordinates', () => {
  const page = browser('map.js');
  page.context.startApp();
  page.requests[0].resolve({ cleanMissionStatus: { cycle: 'clean' } });
  assert.equal(page.text['#mapStatus'], 'waiting for robot position...');
  assert.equal(page.timers.size, 1);
  page.context.startMissionLoop();
  page.requests[1].reject();
  assert.match(page.text['#mapStatus'], /retrying/);
  assert.equal(page.timers.size, 1);
  page.context.toggleMapping();
  assert.equal(page.timers.size, 0);
});

function historyData (id, count, start = 0) {
  const points = [];
  for (let index = start; index < count; index++) {
    points.push({ seq: index + 1, x: index * 10, y: index * 5, theta: 90, break: index === 0 });
  }
  return { id, total: count, reset: start === 0, points, online: true, deletable: true, state: {} };
}

test('history restores on reopen, appends deltas and keeps the display after errors', () => {
  const page = browser('map-history.js');
  Object.assign(page.context, {
    pathLayer: page.elements.path_layer,
    robotBodyLayer: page.elements.robot_body_layer,
    textLayer: page.elements.text_layer,
    listAt: Date.now()
  });
  page.context.startMissionLoop();
  assert.equal(page.requests[0].options.data.after, 0);
  page.requests[0].resolve(historyData('m2-1234', 3));
  assert.equal(page.context.points.length, 3);
  assert.ok(page.lines.length > 0);
  page.context.startMissionLoop();
  assert.equal(page.pointsRequests()[1].options.data.known, 'm2-1234');
  assert.equal(page.pointsRequests()[1].options.data.after, 3);
  page.pointsRequests()[1].resolve(historyData('m2-1234', 4, 3));
  assert.equal(page.context.points.length, 4);
  page.context.startMissionLoop();
  page.pointsRequests()[2].reject();
  assert.equal(page.context.points.length, 4);
  page.context.clearMap();
  assert.equal(page.context.hiddenThrough, 4);
  const reopened = browser('map-history.js');
  reopened.context.listAt = Date.now();
  reopened.context.startMissionLoop();
  reopened.requests[0].resolve(historyData('m2-1234', 4));
  assert.equal(reopened.context.points.length, 4);
  assert.equal(reopened.context.hiddenThrough, 0);
});

test('history discards stale requests after switching missions and pauses only display', () => {
  const page = browser('map-history.js');
  page.context.listAt = Date.now();
  page.context.startMissionLoop();
  const old = page.requests[0];
  page.context.selectedMission = 'm3-5678';
  page.context.restartLoop();
  old.resolve(historyData('m2-1234', 10));
  assert.equal(page.context.points.length, 0);
  page.requests[1].resolve(historyData('m3-5678', 2));
  assert.equal(page.context.missionId, 'm3-5678');
  assert.equal(page.context.points.length, 2);
  const before = page.pointsRequests().length;
  page.context.toggleMapping();
  assert.equal(page.context.mapping, false);
  assert.equal(page.pointsRequests().length, before, 'pausing sends no robot commands');
  page.context.toggleMapping();
  assert.equal(page.context.mapping, true);
  assert.equal(page.pointsRequests()[before].options.data.after, 2);
});

test('deleting a mission clears the map and ignores stale list and point responses', () => {
  const page = browser('map-history.js');
  page.context.listAt = Date.now();
  page.context.startMissionLoop();
  page.pointsRequests()[0].resolve(historyData('m2-1234', 3));
  page.context.startMissionLoop();
  const oldList = page.requests.find(request => request.options.url === '/api/local/history');
  const oldPoints = page.pointsRequests()[1];
  page.context.deleteSelectedMission();
  const removal = page.requests.find(request => request.options.type === 'DELETE');
  assert.equal(removal.options.url, '/api/local/history/m2-1234');
  assert.equal(page.elements.historyMission.disabled, true);
  removal.resolve({ deleted: 'm2-1234', currentId: null });
  oldList.resolve({ missions: [{ id: 'm2-1234', nMssn: 2 }] });
  oldPoints.resolve(historyData('m2-1234', 4, 3));
  assert.equal(page.context.points.length, 0);
  assert.equal(page.context.selectedMission, 'latest');
  assert.equal(page.elements.historyMission.options.length, 1);
  assert.equal(page.elements.historyMission.disabled, false);
  assert.equal(page.elements.historyDelete.disabled, true);
});

test('cancelled, forbidden and failed deletions preserve the displayed map', () => {
  const page = browser('map-history.js');
  page.context.listAt = Date.now();
  page.context.startMissionLoop();
  page.pointsRequests()[0].resolve(historyData('m2-1234', 3));
  const before = page.requests.length;
  page.context.window.confirm = () => false;
  page.context.deleteSelectedMission();
  assert.equal(page.requests.length, before);
  assert.equal(page.context.points.length, 3);
  page.context.window.confirm = () => true;
  page.context.deleteSelectedMission();
  const removal = page.requests.find(request => request.options.type === 'DELETE');
  removal.reject(409);
  assert.equal(page.context.points.length, 3);
  assert.equal(page.context.missionId, 'm2-1234');
  assert.equal(page.elements.historyDelete.disabled, true);
  assert.match(page.text['#mapStatus'], /Finish the current mission/);
  page.pointsRequests()[page.pointsRequests().length - 1].resolve(historyData('m2-1234', 3, 3));
  page.context.deleteSelectedMission();
  page.requests.filter(request => request.options.type === 'DELETE')[1].reject(503);
  assert.equal(page.context.points.length, 3);
  assert.match(page.text['#mapStatus'], /Deletion failed/);
});

test('a mission removed in another browser returns to latest without stopping polling', () => {
  const page = browser('map-history.js');
  page.context.listAt = Date.now();
  page.context.selectedMission = 'm2-1234';
  page.context.startMissionLoop();
  page.pointsRequests()[0].reject(404);
  assert.equal(page.context.selectedMission, 'latest');
  assert.equal(page.context.missionId, null);
  assert.equal(page.timers.size, 1);
});
