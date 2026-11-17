'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
function browser () {
  const elements = {};
  const requests = [];
  const lines = [];
  const texts = {};
  const timers = new Map();
  const listeners = {};
  let timerID = 0;
  let clock = 0;
  class Element {
    constructor (id = '') {
      this.id = id; this.children = []; this.events = {}; this.style = {}; this.value = ''; this.checked = false;
      this.disabled = false; this.attributes = {}; this.parentNode = { insertAdjacentElement () {} };
      this.width = this.height = 800;
    }
    get options () { return this.children; }
    appendChild (child) { this.children.push(child); child.parentNode = this; return child; }
    remove (index) { this.children.splice(index, 1); }
    addEventListener (name, fn) { this.events[name] = fn; }
    setAttribute (name, value) { this.attributes[name] = value; }
    getAttribute (name) { return this.attributes[name]; }
    removeAttribute (name) { delete this.attributes[name]; }
    insertAdjacentElement () {}
    getBoundingClientRect () { return { width: this.width, height: this.height, left: 0, top: 0 }; }
    set innerHTML (html) {
      for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const element = new Element(match[1]);
        element.checked = /\bchecked\b/.test(match[0]);
        if (['historyMission', 'extraCompare'].includes(element.id)) element.children = [Object.assign(new Element(), { value: element.id === 'historyMission' ? 'latest' : '' })];
        if (element.id === 'previewSpeed') element.value = '5';
        elements[match[1]] = element;
      }
    }
    getContext () { return new Proxy({}, { get: (_, method) => (...args) => { if (method === 'lineTo') lines.push(args); } }); }
    querySelectorAll () {
      const result = [];
      function walk (node) { if (node.attributes && node.attributes['data-history-id']) result.push(node); (node.children || []).forEach(walk); }
      Object.values(elements).forEach(walk); return Array.from(new Set(result));
    }
  }
  ['path_layer', 'robot_body_layer', 'text_layer', 'apiresponse', 'mapStatus', 'sizew', 'sizeh', 'offsetx', 'offsety', 'updateevery']
    .forEach(id => { elements[id] = new Element(id); });
  const $ = selector => ({
    text (value) { texts[selector] = value; if (elements[selector.slice(1)]) elements[selector.slice(1)].textContent = value; return this; },
    val (value) { const element = elements[selector.slice(1)]; if (value === undefined) return element.value; element.value = value; return this; },
    on (name, fn) { listeners[selector + ':' + name] = fn; },
    button () {},
    data () {}
  });
  $.ajax = options => {
    const done = [];
    const fail = [];
    const always = [];
    const request = { options,
      done (fn) { done.push(fn); return this; },
      fail (fn) { fail.push(fn); return this; },
      always (fn) { always.push(fn); return this; },
      resolve (data) { done.forEach(fn => fn(data)); always.forEach(fn => fn()); },
      reject (status = 503, error = 'test failure') { fail.forEach(fn => fn({ status, responseJSON: { error } }, 'error')); always.forEach(fn => fn()); },
      abort () { fail.forEach(fn => fn({ status: 0 }, 'abort')); always.forEach(fn => fn()); }
    };
    requests.push(request); return request;
  };
  const context = { $,
    console,
    performance: { now: () => clock },
    confirm: () => true,
    addEventListener (name, fn) { listeners['window:' + name] = fn; },
    document: { getElementById: id => elements[id], createElement: () => new Element(), createTextNode: value => ({ textContent: value }), querySelector: () => null },
    sizeX: 800,
    sizeY: 800,
    xOffset: 100,
    yOffset: 100,
    updateEvery: 800,
    setTimeout (fn) { timers.set(++timerID, fn); return timerID; },
    clearTimeout (id) { timers.delete(id); },
    setInterval (fn) { timers.set(++timerID, fn); return timerID; },
    clearInterval (id) { timers.delete(id); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(['map-history', 'map-replay', 'map-trajectory', 'map-coordinates', 'map-enhancements', 'map-dashboard', 'map-calibration'].map(name => fs.readFileSync(path.join(__dirname, '../public/js', name + '.js'), 'utf8')).join('\n'), context);
  return { context,
    elements,
    requests,
    lines,
    texts,
    listeners,
    timers,
    advance (ms) { clock += ms; },
    last (url) { return requests.filter(req => req.options.url === url).at(-1); },
    bootstrap (features) {
      context.onload(); requests[0].resolve({ features,
        settings: { sizeW: 1200, sizeH: 600, offsetX: 0, offsetY: -50, pointIntervalMs: 1500, autoFit: false },
        retention: { policy: { enabled: false, maxCount: 0, maxDays: 0 } } });
    }
  };
}
function data (id = 'm1-1000', start = 0, end = 4) {
  return { id,
    nMssn: 1,
    reset: start === 0,
    total: end,
    deletable: true,
    online: true,
    state: { batPct: 80, cleanMissionStatus: { sqft: 100 } },
    points: Array.from({ length: end - start }, (_, i) => ({ seq: start + i + 1,
      x: (start + i) * 10,
      y: (start + i) * 5,
      theta: 90,
      t: new Date(100000 + (start + i) * 1000).toISOString(),
      break: start + i === 2,
      phase: 'run' })),
    summary: { condition: 'ended', observedFrom: new Date(100000).toISOString(), reportedMinutes: 2, batteryLast: 80 },
    recorderStatus: { transport: 'connected', now: new Date(104000).toISOString(), lastSeen: new Date(103000).toISOString() } };
}

function calibrationPage (extra = {}) {
  const page = browser(); page.bootstrap(['replay', 'compare', 'calibration']);
  const pane = page.context.document.createElement('div'); page.context.previewCalibrationPane(pane);
  page.context.previewCalibrationPolicyPane(pane);
  ['layoutX', 'layoutY', 'layoutMapX', 'layoutMapY', 'layoutPositionMeta'].forEach(id => {
    page.elements[id] = page.context.document.createElement('div');
  });
  const value = Object.assign({}, page.context.RoombaCoordinates.defaults, { revision: null, source: 'raw', autoDone: false, protectedManual: false });
  const payload = Object.assign(data(), { calibration: value }, extra);
  page.last('/api/local/history/points').resolve(payload);
  return { page, payload, value };
}

test('opening an uncalibrated task suggests the displayed pose in the form without applying or saving it', () => {
  const { page, payload } = calibrationPage({ state: { pose: { point: { x: -114, y: 150 }, theta: 92 } } });
  const entry = page.context.mapCalibration.tasks['m1-1000'];
  assert.equal(page.elements.calibrationOriginX.value, -114); assert.equal(page.elements.calibrationOriginY.value, 150);
  assert.equal(entry.value.originX, 0); assert.equal(entry.dirty, false);
  assert.equal(page.elements.layoutMapX.textContent, 'X -114');
  assert.match(page.elements.calibrationStatus.textContent, /Auto-filled: /);
  assert.match(page.elements.calibrationStatus.textContent, /not applied/);
  page.context.latestState = { pose: { point: { x: 900, y: 800 }, theta: 90 } };
  page.context.previewCalibrationReceive(payload);
  assert.equal(page.elements.calibrationOriginX.value, -114, 'polling does not move an already suggested origin');
  assert.equal(page.last('/api/local/history/enhancements/calibration/m1-1000'), undefined);
  page.context.previewCalibrationSave('manual');
  const request = page.last('/api/local/history/enhancements/calibration/m1-1000');
  const body = JSON.parse(request.options.data);
  assert.equal(body.originX, -114); assert.equal(body.originY, 150);
  request.resolve(Object.assign({}, body, { revision: 'c'.repeat(32), source: 'manual' }));
  page.context.previewCalibrationReceive(payload, 0);
  assert.equal(entry.value.originX, -114); assert.equal(entry.suggestion, null);
});

test('saved calibrations including an explicit zero origin take precedence over automatic suggestions', () => {
  const saved = { originX: 0,
    originY: 0,
    offsetX: 42,
    offsetY: 0,
    rotation: 10,
    revision: 'd'.repeat(32),
    source: 'raw',
    autoDone: false,
    protectedManual: true };
  const { page } = calibrationPage({ calibration: saved, state: { pose: { point: { x: -114, y: 150 }, theta: 92 } } });
  assert.equal(page.elements.calibrationOriginX.value, 0);
  assert.equal(page.elements.calibrationOffsetX.value, 42);
  assert.equal(page.context.mapCalibration.tasks['m1-1000'].suggestion, null);
  assert.doesNotMatch(page.elements.calibrationStatus.textContent, /Auto-filled/);
});

test('suggestions wait for a valid position and do not overwrite edits', () => {
  const { page, payload } = calibrationPage({ points: [], total: 0 });
  const entry = page.context.mapCalibration.tasks['m1-1000'];
  assert.equal(entry.suggestion, null);
  page.context.latestState = { pose: { point: { x: 12, y: 34 }, theta: 90 } };
  page.context.previewCalibrationReceive(payload);
  assert.equal(page.elements.calibrationOriginX.value, 12);
  page.elements.calibrationOriginX.value = '-70'; page.context.previewCalibrationEdit();
  page.context.previewCalibrationReceive(payload); page.context.previewCalibrationFill();
  assert.equal(page.elements.calibrationOriginX.value, -70); assert.equal(entry.dirty, true);
});
test('calibration previews separate raw/map coordinates and only saved transforms survive a reload', () => {
  const { page, payload } = calibrationPage();
  page.elements.calibrationOriginX.value = '10'; page.elements.calibrationOriginY.value = '5';
  page.elements.calibrationOffsetX.value = '100'; page.elements.calibrationOffsetY.value = '-20';
  page.elements.calibrationRotation.value = '0'; page.context.previewCalibrationEdit();
  page.context.previewLayoutPosition({ x: 30, y: 15, theta: 90 }, null);
  assert.equal(page.elements.layoutX.textContent, 'X 30'); assert.equal(page.elements.layoutMapX.textContent, 'X 120');
  assert.equal(page.elements.layoutMapY.textContent, 'Y -10');
  page.context.previewCalibrationReceive(payload);
  assert.equal(page.context.previewCalibrationValue('m1-1000').offsetX, 100, 'polling preserves unsaved alignment');
  page.context.previewCalibrationSave('manual');
  const request = page.last('/api/local/history/enhancements/calibration/m1-1000');
  assert.equal(JSON.parse(request.options.data).originX, 10);
  const saved = Object.assign({}, JSON.parse(request.options.data), { revision: 'a'.repeat(32), source: 'manual' });
  request.resolve(saved); assert.equal(page.context.mapCalibration.tasks['m1-1000'].dirty, false);
  page.context.previewCalibrationReceive(payload, 0);
  assert.equal(page.context.previewCalibrationValue('m1-1000').offsetX, 100, 'pre-save poll cannot revert a successful save');
});
test('independent comparison calibration, direct dragging and saved revisions do not alter primary raw data', () => {
  const { page, value } = calibrationPage();
  const comparison = Object.assign(data('m2-2000'), { calibration: Object.assign({}, value, { originX: 10, offsetX: 200 }) });
  page.context.mapExtras.compare = { id: comparison.id, points: comparison.points };
  page.context.previewCalibrationReceive(comparison);
  assert.equal(page.context.previewComparisonPoints()[0].x, 190);
  assert.equal(page.context.points[0].x, 0);
  page.context.mapCalibration.dragMode = 'compare'; page.context.mapCalibration.target = 'compare';
  page.context.previewCalibrationFill(); page.context.renderMap();
  const drag = page.context.previewCalibrationDragBegin(); assert.equal(drag.id, 'm2-2000');
  const original = drag.entry.value.offsetX;
  page.context.previewCalibrationDragMove(drag, 20, 10);
  assert.ok(Math.abs(drag.entry.value.offsetX - original - 10 / drag.unitX) <= 0.005);
  assert.equal(page.context.previewCalibrationValue('m1-1000').offsetX, 0);
  assert.equal(page.context.mapExtras.compare.points[0].x, 0);
  assert.equal(drag.entry.dirty, true); assert.ok(page.context.mapCalibration.frozenBounds);
  page.context.previewCalibrationSave('manual'); const request = page.last('/api/local/history/enhancements/calibration/m2-2000');
  request.reject(409, 'revision conflict'); assert.equal(drag.entry.dirty, true);
  assert.match(page.elements.previewMessage.textContent, /revision conflict/);
});
test('one-click zero fills the displayed raw pose as a draft, then saves only when requested', () => {
  const { page, payload } = calibrationPage();
  payload.state.pose = { point: { x: -114, y: 150 }, theta: 92 };
  payload.calibrationStatus = { sample: null, policy: { enabled: false } };
  page.context.latestState = payload.state;
  const entry = page.context.mapCalibration.tasks['m1-1000'];
  Object.assign(entry.value, { offsetX: 500, offsetY: -100, rotation: 30 });
  page.context.previewCalibrationCurrent();
  assert.equal(page.elements.calibrationOriginX.value, -114);
  assert.equal(page.elements.calibrationOriginY.value, 150);
  assert.equal(entry.value.offsetX, 0); assert.equal(entry.value.offsetY, 0); assert.equal(entry.value.rotation, 30);
  assert.equal(page.elements.layoutMapX.textContent, 'X 0'); assert.equal(page.elements.layoutMapY.textContent, 'Y 0');
  assert.match(page.elements.calibrationStatus.textContent, /may be cached/);
  assert.match(page.elements.calibrationStatus.textContent, /Save calibration/);
  assert.equal(page.last('/api/local/history/enhancements/calibration/m1-1000'), undefined);
  page.context.previewCalibrationReceive(payload);
  assert.equal(entry.value.originX, -114, 'polling cannot overwrite the filled draft');
  page.context.previewCalibrationSave('manual');
  const request = page.last('/api/local/history/enhancements/calibration/m1-1000');
  const body = JSON.parse(request.options.data);
  assert.equal(body.originX, -114); assert.equal(body.originY, 150); assert.equal(body.action, 'manual');
  request.resolve(Object.assign({}, body, { revision: 'b'.repeat(32), source: 'manual' }));
  assert.equal(entry.dirty, false);
  page.context.enhancement.replay.seek(0.5); page.context.previewCalibrationCurrent();
  assert.equal(entry.value.originX, 10); assert.equal(entry.value.originY, 5);
  assert.equal(page.last('/api/local/history/enhancements/calibration/m1-1000'), request, 'playback also only creates a draft');
  assert.ok(!page.requests.some(req => /\/action\//.test(req.options.url)));
});

test('zeroing a comparison fills only its last recorded point and handles absent positions', () => {
  const { page, value } = calibrationPage();
  page.context.mapCalibration.target = 'compare'; page.context.previewCalibrationCurrent();
  assert.equal(page.context.mapCalibration.tasks['m1-1000'].dirty, false);
  const comparison = Object.assign(data('m2-2000'), { calibration: value });
  page.context.mapExtras.compare = { id: comparison.id, points: comparison.points };
  page.context.previewCalibrationReceive(comparison);
  page.context.previewCalibrationCurrent();
  assert.equal(page.context.mapCalibration.tasks[comparison.id].value.originX, 30);
  assert.equal(page.context.mapCalibration.tasks['m1-1000'].value.originX, 0);
  page.context.mapExtras.compare.points = [];
  page.context.previewCalibrationCurrent();
  assert.match(page.elements.previewMessage.textContent, /No position is available for calibration/);
});
test('bootstrap applies server settings before first render and saves zero/negative values to new endpoint', () => {
  const page = browser(); page.bootstrap(['settings', 'summary', 'status']);
  assert.equal(page.elements.path_layer.width, 1200); assert.equal(page.context.xOffset, 0);
  assert.equal(page.context.yOffset, -50); assert.equal(page.context.updateEvery, 1500);
  assert.equal(page.elements.historyAutoFit.checked, false);
  page.context.saveValues();
  const saved = page.last('/api/local/history/enhancements/settings');
  assert.equal(saved.options.type, 'POST');
  assert.equal(JSON.parse(saved.options.data).offsetX, 0);
  assert.equal(JSON.parse(saved.options.data).offsetY, -50);
  saved.reject(503, 'ENOSPC'); assert.match(page.elements.previewMessage.textContent, /ENOSPC/);
});
test('saving reads current field edits even before change fires and bounds canvas dimensions', () => {
  const page = browser(); page.bootstrap(['settings']);
  page.elements.sizew.value = '9000'; page.elements.sizeh.value = '4096';
  page.elements.offsetx.value = '0'; page.elements.offsety.value = '-120';
  page.elements.updateevery.value = '50';
  page.context.saveValues();
  const saved = JSON.parse(page.last('/api/local/history/enhancements/settings').options.data);
  assert.equal(saved.sizeW, 4096); assert.equal(saved.sizeH, 4096);
  assert.equal(saved.offsetX, 0); assert.equal(saved.offsetY, -120);
  assert.equal(saved.pointIntervalMs, 500);
  assert.equal(page.elements.path_layer.width, 4096);
});

test('large canvases fit a narrow viewport and zoom creates an internal scrollable stage', () => {
  const page = browser();
  const fit = page.context.previewFitSize(4096, 4096, 334, 414, 1);
  assert.equal(fit.width, 334); assert.equal(fit.height, 334);
  assert.equal(fit.stageWidth, 334); assert.equal(fit.stageHeight, 414);
  assert.equal(fit.left, 0); assert.equal(fit.top, 40);
  const zoomed = page.context.previewFitSize(4096, 4096, 334, 399, 2.25);
  assert.ok(zoomed.stageWidth > 334); assert.ok(zoomed.stageHeight > 399);
  assert.equal(zoomed.left, 0); assert.equal(zoomed.top, 0);
});

test('position/state cards follow recorded playback without inventing coordinates or live state', () => {
  const page = browser(); page.bootstrap(['replay']);
  for (const id of ['layoutX', 'layoutY', 'layoutPositionMeta', 'layoutState', 'layoutStateLabel', 'layoutStateMeta']) {
    page.elements[id] = { textContent: '' };
  }
  page.last('/api/local/history/points').resolve(data());
  assert.equal(page.elements.layoutX.textContent, 'X 30');
  page.elements.previewSeek.value = '500'; page.elements.previewSeek.events.input.call(page.elements.previewSeek);
  assert.equal(page.elements.layoutX.textContent, 'X 10');
  assert.equal(page.elements.layoutY.textContent, 'Y 5');
  assert.match(page.elements.layoutPositionMeta.textContent, /Playback/);
  assert.equal(page.elements.layoutStateLabel.textContent, 'Playback status');
  assert.equal(page.elements.layoutState.textContent, 'Cleaning');
  assert.doesNotMatch(page.elements.layoutStateMeta.textContent, /Waiting/);
  page.context.previewLayoutPosition(null, null);
  assert.equal(page.elements.layoutX.textContent, 'X —');
  page.context.selectedMission = 'm1-1000'; page.context.previewLayoutState({}, null, {});
  assert.equal(page.elements.layoutStateLabel.textContent, 'Mission status');
  assert.equal(page.elements.layoutState.textContent, 'No state available');
});

test('system dialog reads only the info endpoint, avoids overlapping requests and releases after errors', () => {
  const page = browser(); page.bootstrap(['status']);
  const dialog = { open: false, showModal () { this.open = true; } };
  page.elements.layoutSystemDialog = dialog;
  page.elements.layoutSystemStatus = { textContent: '' }; page.elements.layoutSystemData = { textContent: '' };
  page.context.previewTestSystem(); const request = page.last('/api/local/info/sys');
  assert.ok(request); assert.equal(request.options.type, undefined);
  const count = page.requests.length; page.context.previewTestSystem(); assert.equal(page.requests.length, count);
  request.resolve({ text: '<img onerror=bad>' });
  assert.equal(page.elements.layoutSystemData.textContent, '{\n  "text": "<img onerror=bad>"\n}');
  page.context.previewTestSystem(); page.last('/api/local/info/sys').reject(503, 'offline');
  assert.match(page.elements.layoutSystemStatus.textContent, /offline/);
  assert.equal(page.context.dashboard.systemRequest, null);
  assert.ok(!page.requests.some(request => /\/action\//.test(request.options.url)));
});

test('wheel and pointer gestures anchor zoom, pan, pinch, cancel and respect zoom bounds', () => {
  const page = browser(); page.bootstrap(['replay']);
  page.elements.layoutCompareLegend = {};
  const events = {};
  const stage = { style: {} };
  const viewport = { clientWidth: 400,
    clientHeight: 300,
    clientLeft: 0,
    clientTop: 0,
    scrollLeft: 0,
    scrollTop: 0,
    classList: { toggle () {} },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture () {},
    addEventListener (name, handler) { events[name] = handler; } };
  Object.assign(page.context.dashboard, { ready: true, viewport, stage });
  page.context.previewMapGestures(viewport);
  let prevented = false;
  events.wheel({ clientX: 200, clientY: 150, deltaY: -300, deltaMode: 0, preventDefault () { prevented = true; } });
  assert.ok(prevented); assert.ok(page.context.dashboard.zoom > 1);
  const oldScroll = viewport.scrollLeft;
  events.pointerdown({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 150 });
  events.pointermove({ pointerId: 1, clientX: 170, clientY: 120 });
  assert.equal(viewport.scrollLeft, oldScroll + 30);
  events.pointerup({ pointerId: 1 });
  events.pointerdown({ pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 150 });
  events.pointerdown({ pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 150 });
  const beforePinch = page.context.dashboard.zoom;
  events.pointermove({ pointerId: 3, clientX: 300, clientY: 150 });
  assert.equal(page.context.dashboard.zoom, beforePinch * 2);
  events.pointercancel({ pointerId: 3 });
  const afterCancel = viewport.scrollLeft;
  events.pointermove({ pointerId: 2, clientX: 80, clientY: 150 });
  assert.equal(viewport.scrollLeft, afterCancel + 20);
  events.lostpointercapture({ pointerId: 2 });
  page.context.previewMapZoom(100); assert.equal(page.context.dashboard.zoom, 6);
  page.context.previewMapZoom(0.01); assert.equal(page.context.dashboard.zoom, 1);
});

test('bootstrap failure retains basic history display and does not silently save settings to the container', () => {
  const page = browser(); page.context.onload(); page.requests[0].reject();
  assert.match(page.elements.previewMessage.textContent, /could not initialize/);
  const pointRequest = page.last('/api/local/history/points'); assert.ok(pointRequest);
  pointRequest.resolve(data()); assert.equal(page.context.points.length, 4);
  const before = page.requests.length; page.context.saveValues(); assert.equal(page.requests.length, before);
});
test('playback keeps live recording cursor, full-task bounds and segment breaks; switching tasks ignores stale data', () => {
  const page = browser(); page.bootstrap(['summary', 'status', 'replay']);
  page.last('/api/local/history/points').resolve(data());
  assert.match(page.elements.previewSummary.textContent, /Ended/);
  page.elements.previewSeek.value = '500'; page.elements.previewSeek.events.input.call(page.elements.previewSeek);
  assert.equal(page.context.previewFrame().points.length, 2);
  assert.equal(page.context.previewFrame().bounds.length, 4);
  assert.equal(page.texts['#batPct'], '—', 'do not fabricate historical battery');
  assert.equal(page.context.points.length, 4);
  page.context.startMissionLoop();
  const delta = page.last('/api/local/history/points'); assert.equal(delta.options.data.after, 4);
  delta.resolve(data('m1-1000', 4, 5));
  assert.equal(page.context.points.length, 5); assert.equal(page.context.previewFrame().points.length, 2);
  page.context.enhancement.replay.seek(1); const before = page.lines.length; page.context.renderMap();
  const count = page.lines.length - before;
  assert.equal(count, 4, 'five points, one trajectory break, plus robot heading = four line segments');
  page.context.startMissionLoop(); const stale = page.last('/api/local/history/points');
  page.elements.historyMission.value = 'm2-2000'; page.elements.historyMission.events.change.call(page.elements.historyMission);
  assert.equal(page.context.enhancement.replay.live, true);
  stale.resolve(data('m1-1000', 5, 6)); assert.equal(page.context.points.length, 0);
  page.last('/api/local/history/points').resolve(data('m2-2000', 0, 2));
  assert.equal(page.context.missionId, 'm2-2000'); assert.equal(page.context.enhancement.replay.points.length, 2);
});
test('batch cancellation has no apply request; failures preserve displayed points and release UI', () => {
  const page = browser(); page.bootstrap(['retention']);
  page.last('/api/local/history/points').resolve(data());
  page.context.confirm = () => false;
  page.context.previewCleanup({ ids: ['m1-1000'] });
  page.last('/api/local/history/enhancements/retention/plan').resolve({ token: 'x', targets: [{ id: 'm1-1000', nMssn: 1, createdAt: new Date().toISOString() }] });
  assert.equal(page.last('/api/local/history/enhancements/retention/apply'), undefined);
  assert.equal(page.context.deleting, false); assert.equal(page.context.points.length, 4);
  page.context.confirm = () => true;
  page.context.previewCleanup({ ids: ['m1-1000'] });
  page.last('/api/local/history/enhancements/retention/plan').reject(409, 'active task');
  assert.equal(page.context.deleting, false); assert.equal(page.elements.historyMission.disabled, false);
  assert.equal(page.context.points.length, 4); assert.match(page.elements.previewMessage.textContent, /active task/);
});
test('search filters title/notes and dates while preserving the manually selected task', () => {
  const page = browser(); page.bootstrap(['library']);
  const missions = [
    { id: 'm1-1000', nMssn: 1, createdAt: '2026-11-15T10:00:00+08:00', completedAt: 'ended', count: 10, annotation: { title: 'Living room', note: 'Sofa' } },
    { id: 'm2-2000', nMssn: 2, createdAt: '2026-11-16T10:00:00+08:00', completedAt: null, count: 20, annotation: { title: 'Kitchen', note: 'Table legs' } }
  ];
  page.context.previewMissionList(missions, page.elements.historyMission, 'm2-2000');
  page.elements.extraSearch.value = 'Sofa'; page.elements.extraSearch.events.input();
  assert.equal(page.elements.historyMission.options.length, 2);
  assert.equal(page.elements.historyMission.options[1].value, 'm1-1000');
  page.context.selectedMission = 'm2-2000'; page.elements.extraSearch.events.input();
  assert.equal(page.elements.historyMission.options.length, 3, 'keep selected task outside filter');
  assert.match(page.elements.historyMission.options[2].textContent, /outside current filter/);
  page.elements.extraResetFilter.events.click();
  page.context.selectedMission = 'latest'; page.elements.extraFilterStatus.value = 'active';
  page.elements.extraFilterStatus.events.change(); assert.equal(page.elements.historyMission.options[1].value, 'm2-2000');
  page.elements.extraFilterStatus.value = ''; page.elements.extraTo.value = '2026-11-15'; page.elements.extraTo.events.change();
  assert.equal(page.elements.historyMission.options.length, 2); assert.equal(page.elements.historyMission.options[1].value, 'm1-1000');
});
test('note edits survive poll and task switch, and stale responses cannot undo a successful save', () => {
  const page = browser(); page.bootstrap(['library', 'export', 'metrics']);
  const original = data(); original.annotation = { title: 'old', note: '', revision: null };
  page.last('/api/local/history/points').resolve(original);
  assert.match(page.elements.extraJSON.href, /mission=m1-1000&format=json/);
  assert.match(page.elements.extraMetrics.textContent, /coordinate units/);
  page.elements.extraTitle.value = '<b>Manual Notes</b>'; page.elements.extraTitle.events.input();
  page.context.startMissionLoop(); const stale = page.last('/api/local/history/points');
  page.elements.extraSaveNote.events.click();
  const save = page.last('/api/local/history/enhancements/notes/m1-1000');
  assert.equal(JSON.parse(save.options.data).title, '<b>Manual Notes</b>');
  save.resolve({ title: '<b>Manual Notes</b>', note: '', revision: 'new-revision' });
  stale.resolve(data('m1-1000', 4, 4));
  assert.equal(page.elements.extraTitle.value, '<b>Manual Notes</b>');
  assert.equal(page.context.mapExtras.revision, 'new-revision');
  page.elements.extraNote.value = 'draft'; page.elements.extraNote.events.input();
  page.elements.historyMission.value = 'm2-2000'; page.elements.historyMission.events.change.call(page.elements.historyMission);
  page.last('/api/local/history/points').resolve(data('m2-2000'));
  assert.equal(page.elements.extraNote.value, '');
  page.elements.historyMission.value = 'm1-1000'; page.elements.historyMission.events.change.call(page.elements.historyMission);
  page.last('/api/local/history/points').resolve(original);
  assert.equal(page.elements.extraNote.value, 'draft'); assert.equal(page.context.mapExtras.dirty, true);
  assert.equal(page.context.mapExtras.revision, 'new-revision', 'draft keeps revision from before switch');
  page.context.previewForgetMissions(['m1-1000']); page.context.resetDisplayedMission();
  assert.equal(Object.keys(page.context.mapExtras.drafts).length, 0, 'deleted maps do not leave inaccessible drafts');
});
test('comparison draws separate snapshot without changing primary cursor and discards stale requests', () => {
  const page = browser(); page.bootstrap(['compare', 'replay']);
  page.last('/api/local/history/points').resolve(data());
  page.elements.extraCompare.value = 'm2-2000'; page.elements.extraCompare.events.change();
  const reference = page.last('/api/local/history/points');
  assert.equal(reference.options.data.mission, 'm2-2000');
  reference.resolve(data('m2-2000'));
  assert.equal(page.context.points.length, 4); assert.equal(page.context.missionId, 'm1-1000');
  assert.equal(page.context.previewComparisonPoints().length, 4);
  page.context.startMissionLoop(); assert.equal(page.last('/api/local/history/points').options.data.after, 4);
  page.elements.extraCompare.value = 'm3-3000'; page.elements.extraCompare.events.change();
  const old = page.last('/api/local/history/points');
  page.elements.historyMission.value = 'm4-4000'; page.elements.historyMission.events.change.call(page.elements.historyMission);
  old.resolve(data('m3-3000'));
  assert.equal(page.context.previewComparisonPoints().length, 0);
  assert.equal(page.context.points.length, 0);
});
