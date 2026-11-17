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
  vm.runInContext(['map-history', 'map-replay', 'map-trajectory', 'map-enhancements'].map(name => fs.readFileSync(path.join(__dirname, '../public/js', name + '.js'), 'utf8')).join('\n'), context);
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
