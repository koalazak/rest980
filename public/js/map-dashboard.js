/* global $:true clearMap:true enhancement:true pathLayer:true previewCalibratedPoint:true previewCalibrationControls:true previewCalibrationDragBegin:true previewCalibrationDragMove:true previewCalibrationDragTools:true previewCalibrationPane:true previewCalibrationPolicyPane:true previewCalibrationResetView:true previewComparisonPoints:true previewElement:true previewError:true previewHas:true previewLoadHistory:true previewMapLayout:true previewMessage:true previewStatus:true previewText:true renderMap:true request:true robotBodyLayer:true saveValues:true selectedMission:true text:true textLayer:true toggleMapping:true validPosition:true */
/* eslint-env browser */
/* eslint no-unused-vars: "off", no-global-assign: "off", no-native-reassign: "off" */

var dashboard = { ready: false, zoom: 1, viewport: null, stage: null, resize: null };
function layoutNode (tag, className, html) {
  var node = document.createElement(tag); node.className = className || '';
  if (html) node.innerHTML = html;
  return node;
}
function layoutMove (parent, id) { var node = previewElement(id); if (node) parent.appendChild(node); return node; }
function layoutField (parent, label, id) {
  var node = previewElement(id); if (!node) return;
  var wrapper = layoutNode('label', 'dash-field');
  var caption = layoutNode('span'); caption.textContent = label; wrapper.appendChild(caption);
  node.style.cssText = ''; wrapper.appendChild(node); parent.appendChild(wrapper);
}
function layoutSection (parent, title) {
  var section = layoutNode('section', 'dash-section');
  var heading = layoutNode('h3'); heading.textContent = title; section.appendChild(heading); parent.appendChild(section); return section;
}
function layoutButton (parent, text, handler, className, aria) {
  var button = layoutNode('button', className); button.type = 'button'; button.textContent = text;
  if (aria) button.setAttribute('aria-label', aria);
  button.addEventListener('click', handler); parent.appendChild(button); return button;
}
function previewDashboardInit () {
  if (!document.body || !document.head || dashboard.ready) return;
  var originalBox = pathLayer.parentNode;
  var originalRoot = originalBox.parentNode;
  if (!originalRoot || originalRoot === document.body) return;

  if (!document.querySelector('meta[name="viewport"]')) {
    var meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1'; document.head.appendChild(meta);
  }
  var app = layoutNode('main', 'roomba-app'); app.id = 'roombaApp';
  app.innerHTML = '<header class="dash-header"><div class="dash-brand"><div class="dash-logo" aria-hidden="true">' +
    '<svg width="29" height="29" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="2"/><path d="M7 13h18" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="20" r="3" stroke="currentColor" stroke-width="2"/><path d="M12 9h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>' +
    '<div><div class="dash-eyebrow">HOME / CLEANING</div><h1>Roomba 980</h1></div></div>' +
    '<div class="dash-connection" id="layoutConnection"><span class="dash-dot"></span><span id="layoutConnectionText">Waiting for connection</span></div></header>' +
    '<div class="dash-toolbar"><div class="dash-task-select" id="layoutTask"><label for="historyMission">Selected mission</label></div><div class="dash-actions" id="layoutActions"></div></div>' +
    '<div id="layoutNotice"></div><div class="dash-grid"><div class="dash-main"><div class="dash-stats">' +
    '<div class="dash-stat"><div class="dash-stat-label">Cleaning time</div><div class="dash-stat-value"><span id="layoutDuration">—</span><small>min</small></div><div class="dash-stat-foot">Reported by robot</div></div>' +
    '<div class="dash-stat"><div class="dash-stat-label">Cleaning area</div><div class="dash-stat-value"><span id="layoutArea">—</span><small>m²</small></div><div class="dash-stat-foot">Reported by robot</div></div>' +
    '<div class="dash-stat"><div class="dash-stat-label">Last reported battery</div><div class="dash-stat-value"><span id="layoutBattery">—</span><small>%</small></div><div class="dash-stat-foot">Selected mission summary</div></div>' +
    '<div class="dash-stat"><div class="dash-stat-label">Saved coordinates</div><div class="dash-stat-value"><span id="layoutPoints">—</span><small>pts</small></div><div class="dash-stat-foot">Recorded on server</div></div>' +
    '<div class="dash-stat"><div class="dash-stat-label">Raw coordinates</div><div class="dash-stat-value dash-coordinates"><span id="layoutX">X —</span><span id="layoutY">Y —</span></div>' +
    '<div class="dash-stat-label dash-map-coordinate-label">Map coordinates</div><div class="dash-stat-value dash-coordinates"><span id="layoutMapX">X —</span><span id="layoutMapY">Y —</span></div>' +
    '<div class="dash-stat-foot" id="layoutPositionMeta">No position available</div></div>' +
    '<div class="dash-stat"><div class="dash-stat-label" id="layoutStateLabel">Current status</div><div class="dash-stat-value dash-state" id="layoutState">—</div><div class="dash-stat-foot" id="layoutStateMeta">Waiting for a state report</div></div></div>' +
    '<section class="dash-card"><div class="dash-card-head"><div class="dash-heading"><h2>Cleaning trajectory</h2><span class="dash-phase" id="layoutPhase">Waiting for a mission</span></div><div class="dash-map-tools" id="layoutMapTools"></div></div>' +
    '<div class="dash-map-viewport" id="layoutMapViewport" aria-label="Map viewport; zoom and pan to explore" tabindex="0"><div class="dash-map-stage" id="layoutMapStage"></div></div>' +
    '<div class="dash-legend"><span><i class="dash-line"></i>Selected mission</span><span id="layoutCompareLegend"><i class="dash-line dash-line-orange"></i>Comparison mission</span><span class="dash-map-status" id="layoutMapStatus"></span></div>' +
    '<div class="dash-playback" id="layoutPlayback"></div></section><div class="dash-record-hint" id="layoutHint"></div></div>' +
    '<aside class="dash-sidebar dash-card"><div class="dash-tabs" role="tablist" aria-label="Mission tools">' +
    '<button type="button" role="tab" id="layoutTabTask" aria-controls="layoutPaneTask" aria-selected="true">Mission</button>' +
    '<button type="button" role="tab" id="layoutTabHistory" aria-controls="layoutPaneHistory" aria-selected="false" tabindex="-1">History</button>' +
    '<button type="button" role="tab" id="layoutTabSettings" aria-controls="layoutPaneSettings" aria-selected="false" tabindex="-1">Settings</button></div>' +
    '<div class="dash-pane" id="layoutPaneTask" role="tabpanel" aria-labelledby="layoutTabTask"></div>' +
    '<div class="dash-pane" id="layoutPaneHistory" role="tabpanel" aria-labelledby="layoutTabHistory" hidden></div>' +
    '<div class="dash-pane" id="layoutPaneSettings" role="tabpanel" aria-labelledby="layoutTabSettings" hidden></div></aside></div>';
  document.body.appendChild(app);
  layoutMove(previewElement('layoutTask'), 'historyMission');
  var actions = previewElement('layoutActions');
  var actionLabels = { start: 'Clean', pause: 'Pause', resume: 'Resume', dock: 'Dock', stop: 'Stop' };
  Array.prototype.forEach.call(document.querySelectorAll('.action'), function (button) {
    var key = button.getAttribute('data-action').split('/').pop();
    if (!actionLabels[key]) return;
    button.textContent = actionLabels[key]; button.className = key === 'start' ? 'action dash-primary' : key === 'stop' ? 'action dash-danger' : 'action';
    actions.appendChild(button);
  });
  layoutButton(actions, 'Test', previewTestSystem, '', 'Test connection and read system information');
  layoutSystemDialog(app);
  var toast = layoutMove(previewElement('layoutNotice'), 'previewMessage'); if (toast) toast.className = 'dash-toast';
  var tools = previewElement('layoutMapTools');
  var auto = layoutNode('label', 'dash-switch'); layoutMove(auto, 'historyAutoFit'); auto.appendChild(document.createTextNode('Fit trajectory')); tools.appendChild(auto);
  layoutButton(tools, '−', function () { previewMapZoom(dashboard.zoom / 1.5); }, '', 'Zoom out');
  layoutButton(tools, 'Fit viewport', function () { previewCalibrationResetView(); dashboard.zoom = 1; renderMap(); }, '', 'Fit the complete canvas in the viewport');
  layoutButton(tools, '+', function () { previewMapZoom(dashboard.zoom * 1.5); }, '', 'Zoom in');
  previewCalibrationDragTools(tools);
  dashboard.viewport = previewElement('layoutMapViewport'); dashboard.stage = previewElement('layoutMapStage');
  previewMapGestures(dashboard.viewport);
  [pathLayer, robotBodyLayer, textLayer].forEach(function (canvas) { dashboard.stage.appendChild(canvas); });
  layoutMove(previewElement('layoutMapStatus'), 'mapStatus');
  previewElement('layoutHint').textContent = 'Scroll to zoom and drag to pan. On touchscreens, pinch to zoom and drag with one finger. Recording continues on the server with this page closed.';
  layoutPlayback(); layoutTaskPane(); layoutHistoryPane(); layoutSettingsPane();
  ['Task', 'History', 'Settings'].forEach(function (name, index, names) {
    var button = previewElement('layoutTab' + name);
    button.addEventListener('click', function () { layoutSelectTab(name); });
    button.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? names[(index + 1) % names.length] : event.key === 'ArrowLeft' ? names[(index + 2) % names.length] : null;
      if (next) { event.preventDefault(); layoutSelectTab(next); previewElement('layoutTab' + next).focus(); }
    });
  });
  originalRoot.style.display = 'none'; document.body.classList.add('roomba-dashboard'); dashboard.ready = true;
  if (typeof ResizeObserver === 'function') { dashboard.resize = new ResizeObserver(function () { previewMapLayout(); }); dashboard.resize.observe(dashboard.viewport); } else window.addEventListener('resize', previewMapLayout);
  previewMapLayout();
  if (enhancement.lastData) previewLayoutData(enhancement.lastData);
}
function layoutSelectTab (name) {
  ['Task', 'History', 'Settings'].forEach(function (tab) {
    var active = tab === name;
    var button = previewElement('layoutTab' + tab);
    button.setAttribute('aria-selected', active ? 'true' : 'false'); button.tabIndex = active ? 0 : -1;
    previewElement('layoutPane' + tab).hidden = !active;
  });
}
function layoutPlayback () {
  var parent = previewElement('layoutPlayback');
  if (!previewHas('replay')) { parent.hidden = true; return; }
  var row = layoutNode('div', 'dash-playback-row'); parent.appendChild(row);
  layoutMove(row, 'previewPlay'); var live = layoutMove(row, 'previewLive'); if (live) live.textContent = 'Full trajectory';
  var seek = layoutNode('div', 'dash-seek'); layoutMove(seek, 'previewSeek'); row.appendChild(seek);
  layoutMove(row, 'previewSpeed'); var meta = layoutNode('div', 'dash-playback-meta'); layoutMove(meta, 'previewReplayInfo'); parent.appendChild(meta);
}
function layoutTaskPane () {
  var pane = previewElement('layoutPaneTask');
  if (previewHas('library')) {
    var note = layoutSection(pane, 'Mission notes'); layoutField(note, 'Mission title', 'extraTitle'); layoutField(note, 'Notes', 'extraNote');
    var buttons = layoutNode('div', 'dash-button-row'); note.appendChild(buttons);
    var save = layoutMove(buttons, 'extraSaveNote'); if (save) { save.textContent = 'Save notes'; save.className = 'dash-primary'; }
    var reload = layoutMove(buttons, 'extraReloadNote'); if (reload) reload.textContent = 'Reload';
    var state = layoutMove(note, 'extraNoteStatus'); if (state) state.className = 'dash-note-status';
  }
  if (previewHas('compare')) {
    var compare = layoutSection(pane, 'Compare trajectories'); layoutField(compare, 'Overlay another mission', 'extraCompare');
    var refresh = layoutMove(compare, 'extraReloadCompare'); if (refresh) refresh.textContent = 'Refresh comparison';
    var status = layoutMove(compare, 'extraCompareStatus'); if (status) status.className = 'dash-small';
    var hint = layoutNode('p', 'dash-small'); hint.textContent = 'Dashed orange lines show the comparison snapshot. Adjust origins, placement and rotation independently to align missions.'; compare.appendChild(hint);
  }
  previewCalibrationPane(pane);
  var exports = layoutSection(pane, 'Export and display'); var links = layoutNode('div', 'dash-button-row'); exports.appendChild(links);
  ['download', 'extraJSON', 'extraCSV'].forEach(function (id) {
    var link = layoutMove(links, id); if (!link) return;
    link.textContent = id === 'download' ? 'Map image' : id === 'extraJSON' ? 'JSON' : 'CSV'; link.className = 'dash-link';
  });
  var display = layoutNode('div', 'dash-button-row'); display.style.marginTop = '10px'; exports.appendChild(display);
  ['clearMap', 'toggleMapping'].forEach(function (name) {
    var button = document.querySelector('button[onclick="' + name + '();"]'); if (button) { button.className = ''; display.appendChild(button); }
  });
  if (previewHas('metrics')) {
    var details = layoutNode('details', 'dash-side-details', '<summary>Trajectory statistics and notes</summary>'); exports.appendChild(details);
    var metrics = layoutMove(details, 'extraMetrics'); if (metrics) metrics.className = 'dash-small';
    var metricsHint = layoutNode('p', 'dash-small'); metricsHint.textContent = 'Lengths use uncalibrated robot coordinates, not cleaning coverage. Long intervals can also mean the robot was stationary or paused.'; details.appendChild(metricsHint);
  }
}
function layoutHistoryPane () {
  var pane = previewElement('layoutPaneHistory');
  if (previewHas('library')) {
    var search = layoutSection(pane, 'Find missions'); layoutField(search, 'Keywords', 'extraSearch'); layoutField(search, 'Mission status', 'extraFilterStatus');
    var dates = layoutNode('div', 'dash-pair'); search.appendChild(dates); layoutField(dates, 'From date', 'extraFrom'); layoutField(dates, 'To date', 'extraTo');
    layoutMove(search, 'extraResetFilter'); var count = layoutMove(search, 'extraFilterCount'); if (count) count.className = 'dash-small';
  }
  if (previewHas('retention')) {
    var section = layoutSection(pane, 'History'); var area = previewElement('previewRetention');
    var ids = ['previewLoadHistory', 'previewBatchDelete', 'previewHistoryList', 'previewRetentionEnabled', 'previewKeepCount', 'previewKeepDays', 'previewSaveRetention', 'previewRetentionStatus'];
    var keep = {}; ids.forEach(function (id) { keep[id] = previewElement(id); if (keep[id]) keep[id].remove(); });
    area.textContent = ''; section.appendChild(area);
    var row = layoutNode('div', 'dash-button-row'); area.appendChild(row);
    if (keep.previewLoadHistory) { keep.previewLoadHistory.textContent = 'Refresh list'; row.appendChild(keep.previewLoadHistory); }
    if (keep.previewBatchDelete) { keep.previewBatchDelete.textContent = 'Delete selected...'; keep.previewBatchDelete.className = 'dash-danger'; row.appendChild(keep.previewBatchDelete); }
    if (keep.previewHistoryList) { keep.previewHistoryList.className = 'dash-history-list'; area.appendChild(keep.previewHistoryList); }
    var policy = layoutNode('details', 'dash-side-details', '<summary>Automatic cleanup policy</summary>'); area.appendChild(policy);
    var label = layoutNode('label', 'dash-switch'); if (keep.previewRetentionEnabled) label.appendChild(keep.previewRetentionEnabled);
    label.appendChild(document.createTextNode('Enable automatic cleanup')); policy.appendChild(label);
    var fields = layoutNode('div', 'dash-pair'); fields.style.marginTop = '14px'; policy.appendChild(fields);
    if (keep.previewKeepCount) fields.appendChild(keep.previewKeepCount); if (keep.previewKeepDays) fields.appendChild(keep.previewKeepDays);
    layoutField(fields, 'Keep latest (missions)', 'previewKeepCount'); layoutField(fields, 'Maximum age (days)', 'previewKeepDays');
    if (keep.previewSaveRetention) { keep.previewSaveRetention.textContent = 'Preview and save policy'; policy.appendChild(keep.previewSaveRetention); }
    if (keep.previewRetentionStatus) { keep.previewRetentionStatus.className = 'dash-small'; policy.appendChild(keep.previewRetentionStatus); }
    var hint = layoutNode('p', 'dash-small'); hint.textContent = 'Zero disables a limit. Preview and confirm before deleting. Active and recharging missions are protected. Deletion is permanent.'; policy.appendChild(hint);
  }
  var danger = layoutSection(pane, 'Selected mission'); var remove = layoutMove(danger, 'historyDelete'); if (remove) { remove.className = 'dash-danger'; remove.textContent = 'Delete selected mission…'; }
}
function layoutSettingsPane () {
  var pane = previewElement('layoutPaneSettings'); previewCalibrationPolicyPane(pane); var section = layoutSection(pane, 'Canvas and refresh');
  var sizes = layoutNode('div', 'dash-pair'); section.appendChild(sizes); layoutField(sizes, 'Canvas width', 'sizew'); layoutField(sizes, 'Canvas height', 'sizeh');
  var offsets = layoutNode('div', 'dash-pair'); section.appendChild(offsets); layoutField(offsets, 'X offset', 'offsetx'); layoutField(offsets, 'Y offset', 'offsety');
  layoutField(section, 'Refresh interval (ms)', 'updateevery');
  var save = document.querySelector('button[onclick="saveValues();"]'); if (save) { save.textContent = 'Save display settings'; save.className = 'dash-primary'; section.appendChild(save); }
  var status = layoutSection(pane, 'Recorder status'); var rec = layoutMove(status, 'previewStatus'); if (rec) rec.className = 'dash-small';
  var info = layoutMove(status, 'historyInfo'); if (info) info.className = 'dash-small';
  var details = layoutNode('details', 'dash-side-details', '<summary>Details and diagnostics</summary>'); status.appendChild(details);
  var summary = layoutMove(details, 'previewSummary'); if (summary) summary.className = 'dash-small';
  var last = previewElement('last'); if (last && last.parentNode) { var raw = last.parentNode; raw.style.cssText = ''; raw.className = 'dash-raw'; details.appendChild(raw); }
  var test = document.querySelector('.action[data-action="/api/local/info/sys"]'); if (test) { test.textContent = 'Read device information'; test.className = 'action'; details.appendChild(test); }
  var response = layoutNode('div', 'dash-raw'); layoutMove(response, 'apiresponse'); details.appendChild(response);
}
function previewFitSize (width, height, availableWidth, availableHeight, zoom) {
  var fit = Math.min(Math.max(1, availableWidth) / width, Math.max(1, availableHeight) / height);
  var drawnWidth = Math.max(1, Math.round(width * fit * zoom));
  var drawnHeight = Math.max(1, Math.round(height * fit * zoom));
  return { width: drawnWidth,
    height: drawnHeight,
    stageWidth: Math.max(availableWidth, drawnWidth),
    stageHeight: Math.max(availableHeight, drawnHeight),
    left: Math.max(0, Math.round((availableWidth - drawnWidth) / 2)),
    top: Math.max(0, Math.round((availableHeight - drawnHeight) / 2)) };
}
function previewDashboardMapLayout () {
  if (!dashboard.ready || !dashboard.viewport || !dashboard.stage) return false;
  var viewport = dashboard.viewport;
  var box = previewFitSize(pathLayer.width, pathLayer.height, viewport.clientWidth, viewport.clientHeight, dashboard.zoom);
  dashboard.stage.style.width = box.stageWidth + 'px'; dashboard.stage.style.height = box.stageHeight + 'px';
  [pathLayer, robotBodyLayer, textLayer].forEach(function (canvas) {
    canvas.style.width = box.width + 'px'; canvas.style.height = box.height + 'px'; canvas.style.left = box.left + 'px'; canvas.style.top = box.top + 'px';
  });
  previewElement('layoutCompareLegend').hidden = !previewComparisonPoints().length;
  if (dashboard.zoom === 1) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
  return true;
}
function previewLayoutData (data) {
  if (!dashboard.ready) return;
  var summary = data.summary || {};
  var state = data.state || {};
  var mission = state.cleanMissionStatus || {};
  function number (value, decimals) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '—'; }
  previewText('layoutDuration', number(summary.reportedMinutes == null ? mission.mssnM : summary.reportedMinutes, 0));
  previewText('layoutArea', number(summary.reportedAreaM2 == null ? (typeof mission.sqft === 'number' ? mission.sqft * 0.09290304 : null) : summary.reportedAreaM2, 1));
  previewText('layoutBattery', number(summary.batteryLast == null ? state.batPct : summary.batteryLast, 0));
  previewText('layoutPoints', data.total == null ? '—' : data.total.toLocaleString());
  var phase = { ended: 'Ended', active: 'Mission active', paused: 'Paused', recharging: 'Recharging during mission', error: 'Robot reports an error' };
  previewText('layoutPhase', data.id ? phase[summary.condition] || mission.phase || 'Recorded' : 'Waiting for a mission');
  previewElement('layoutCompareLegend').hidden = !previewComparisonPoints().length;
  previewLayoutConnection(data.recorderStatus || { transport: data.online ? 'connected' : 'unknown' });
}
function previewLayoutConnection (status) {
  if (!dashboard.ready || !status) return;
  var connection = previewElement('layoutConnection');
  connection.setAttribute('data-state', status.transport === 'connected' ? 'online' : status.transport === 'disconnected' ? 'offline' : 'unknown');
  previewText('layoutConnectionText', status.recordingError ? 'Recording write error' : status.transport === 'connected' ? 'Robot connected' : status.transport === 'disconnected' ? 'Robot disconnected' : 'Waiting for robot state');
}
function previewLayoutPosition (position, frame) {
  var valid = validPosition(position);
  function coordinate (value) { return Number(value.toFixed(2)).toLocaleString(); }
  previewText('layoutX', 'X ' + (valid ? coordinate(position.x) : '—'));
  previewText('layoutY', 'Y ' + (valid ? coordinate(position.y) : '—'));
  var mapped = valid ? previewCalibratedPoint(position) : null;
  previewText('layoutMapX', 'X ' + (mapped ? coordinate(mapped.x) : '—'));
  previewText('layoutMapY', 'Y ' + (mapped ? coordinate(mapped.y) : '—'));
  previewText('layoutPositionMeta', valid ? (frame ? 'Playback position' : selectedMission === 'latest' ? 'Last reported position' : 'Last mission position') +
    ' · raw heading ' + coordinate(position.theta) + ' degrees / map heading ' + coordinate(mapped.theta) + '°' : 'No position available');
  previewCalibrationControls();
}
function previewMapAnchor (x, y) {
  var viewport = dashboard.viewport;
  var box = previewFitSize(pathLayer.width, pathLayer.height, viewport.clientWidth, viewport.clientHeight, dashboard.zoom);
  return { x: (viewport.scrollLeft + x - box.left) / box.width, y: (viewport.scrollTop + y - box.top) / box.height };
}
function previewMapZoom (zoom, x, y, anchor) {
  var viewport = dashboard.viewport;
  if (!viewport) return;
  x = x == null ? viewport.clientWidth / 2 : x; y = y == null ? viewport.clientHeight / 2 : y;
  anchor = anchor || previewMapAnchor(x, y);
  dashboard.zoom = Math.max(1, Math.min(6, zoom)); previewMapLayout();
  var box = previewFitSize(pathLayer.width, pathLayer.height, viewport.clientWidth, viewport.clientHeight, dashboard.zoom);
  viewport.scrollLeft = anchor.x * box.width + box.left - x;
  viewport.scrollTop = anchor.y * box.height + box.top - y;
}
function previewMapGestures (viewport) {
  var pointers = new Map();
  var gesture;
  function local (event) {
    var rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left - viewport.clientLeft, y: event.clientY - rect.top - viewport.clientTop };
  }
  function pair () {
    var list = Array.from(pointers.values());
    return { x: (list[0].x + list[1].x) / 2,
      y: (list[0].y + list[1].y) / 2,
      distance: Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) };
  }
  function begin () {
    if (pointers.size >= 2) {
      var center = pair(); gesture = { pinch: true, distance: Math.max(1, center.distance), zoom: dashboard.zoom, anchor: previewMapAnchor(center.x, center.y) };
    } else if (pointers.size) {
      var point = Array.from(pointers.values())[0];
      gesture = { x: point.x,
        y: point.y,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
        track: previewCalibrationDragBegin() };
    } else gesture = null;
    viewport.classList.toggle('is-dragging', pointers.size > 0);
  }
  viewport.addEventListener('wheel', function (event) {
    if (!event.deltaY) return;
    event.preventDefault(); var point = local(event);
    var pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    previewMapZoom(dashboard.zoom * Math.exp(-pixels * 0.002), point.x, point.y);
  }, { passive: false });
  viewport.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, local(event)); viewport.setPointerCapture(event.pointerId); begin();
  });
  viewport.addEventListener('pointermove', function (event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, local(event));
    if (gesture.pinch && pointers.size >= 2) {
      var center = pair(); previewMapZoom(gesture.zoom * center.distance / gesture.distance, center.x, center.y, gesture.anchor);
    } else if (gesture.track) {
      var cursor = local(event); previewCalibrationDragMove(gesture.track, cursor.x - gesture.x, cursor.y - gesture.y);
    } else {
      var point = local(event); viewport.scrollLeft = gesture.left - (point.x - gesture.x); viewport.scrollTop = gesture.top - (point.y - gesture.y);
    }
  });
  function end (event) { if (pointers.delete(event.pointerId)) begin(); }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { viewport.addEventListener(name, end); });
}
function previewLayoutState (state, frame, data) {
  var mission = state.cleanMissionStatus || {};
  var phases = { run: 'Cleaning',
    charge: 'Charging',
    recharge: 'Recharging',
    hmUsrDock: 'Returning to dock',
    hmMidMsn: 'Recharging during mission',
    hmPostMsn: 'Returning after mission',
    stop: 'Paused',
    pause: 'Paused',
    stuck: 'Stuck or faulted',
    ev: 'Emptying' };
  var error = typeof mission.error === 'number' && mission.error !== 0;
  var label = error ? 'Device error' : phases[mission.phase] || mission.phase || 'No state available';
  previewText('layoutStateLabel', frame ? 'Playback status' : selectedMission === 'latest' ? 'Current status' : 'Mission status');
  previewText('layoutState', label);
  var time = frame ? frame.time : selectedMission === 'latest' ? data.lastSeen || data.updatedAt : data.updatedAt;
  previewText('layoutStateMeta', (error ? 'Error code ' + mission.error + ' · ' : '') +
    (time != null && Number.isFinite(new Date(time).getTime()) ? new Date(time).toLocaleTimeString() : 'Waiting for a state report'));
}
function layoutSystemDialog (app) {
  var dialog = layoutNode('dialog', 'dash-system-dialog'); dialog.id = 'layoutSystemDialog';
  dialog.setAttribute('aria-labelledby', 'layoutSystemTitle');
  dialog.innerHTML = '<div class="dash-dialog-head"><div><h2 id="layoutSystemTitle">Connection test</h2><p>Reads system information only; no cleaning commands are sent.</p></div></div>' +
    '<div id="layoutSystemStatus" role="status"></div><pre id="layoutSystemData" tabindex="0"></pre><div class="dash-dialog-actions" id="layoutSystemActions"></div>';
  app.appendChild(dialog);
  layoutButton(previewElement('layoutSystemActions'), 'Close', function () { dialog.close(); }, 'dash-primary');
}
function previewTestSystem () {
  var dialog = previewElement('layoutSystemDialog');
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  if (dashboard.systemRequest) return;
  previewText('layoutSystemStatus', 'Reading system information...'); previewText('layoutSystemData', '');
  var request = $.ajax({ url: '/api/local/info/sys', dataType: 'json', cache: false, timeout: 15000 });
  dashboard.systemRequest = request;
  request.done(function (data) {
    previewText('layoutSystemStatus', 'Device responded at ' + new Date().toLocaleTimeString());
    previewText('layoutSystemData', JSON.stringify(data, null, 2));
  }).fail(function (xhr) {
    previewText('layoutSystemStatus', 'Request failed: ' + previewError(xhr));
    previewText('layoutSystemData', 'Check the robot LAN connection and server logs, then retry.');
  }).always(function () { if (dashboard.systemRequest === request) dashboard.systemRequest = null; });
}
