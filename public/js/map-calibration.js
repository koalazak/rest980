/* global $:true RoombaCoordinates:true enhancement:true latestState:true layoutNode:true layoutSection:true layoutSelectTab:true mapExtras:true missionId:true pathLayer:true points:true previewElement:true previewError:true previewFrame:true previewHas:true previewJSON:true previewMessage:true previewText:true renderMap:true selectedMission:true validPosition:true */
/* eslint-env browser */
/* eslint no-unused-vars: "off", no-global-assign: "off", no-native-reassign: "off" */
/* global RoombaCoordinates */
var mapCalibration = { tasks: {}, epoch: 0, target: 'main', frozenBounds: null, lastBounds: [], projection: null, dragMode: 'view' };
function previewCalibrationEnabled () { return previewHas('calibration'); }
function previewCalibrationEntry (id) {
  if (!id) return null;
  if (!mapCalibration.tasks[id]) mapCalibration.tasks[id] = { saved: null, value: Object.assign({}, RoombaCoordinates.defaults), dirty: false, saving: false, version: 0 };
  return mapCalibration.tasks[id];
}
function previewCalibrationReceive (data, epoch) {
  if (!previewCalibrationEnabled() || !data || !data.id) return;
  var entry = previewCalibrationEntry(data.id);
  var value = data.calibration;
  if (value && (epoch === undefined || epoch === mapCalibration.epoch) && !entry.dirty && !entry.saving) {
    var changed = !entry.saved || entry.saved.revision !== value.revision;
    entry.saved = value; entry.value = Object.assign({}, value);
    if (changed) entry.suggestion = null;
    if (data.id === previewCalibrationTargetId() && (changed || (!entry.suggestion && !entry.formTouched))) previewCalibrationFill();
  }
  if (data.calibrationStatus) previewCalibrationPolicyStatus(data.calibrationStatus.policy);
  previewCalibrationControls();
}
function previewCalibrationValue (id) {
  var entry = previewCalibrationEnabled() && previewCalibrationEntry(id);
  return entry ? entry.value : RoombaCoordinates.defaults;
}
function previewCalibratedPoint (point) { return RoombaCoordinates.apply(point, previewCalibrationValue(missionId)); }
function previewCalibrationTargetId () { return mapCalibration.target === 'compare' ? mapExtras.compare && mapExtras.compare.id : missionId; }
function previewCalibrationBounds (bounds) {
  if (previewCalibrationEnabled() && bounds.length) {
    [missionId, mapExtras.compare && mapExtras.compare.id].filter(Boolean).forEach(function (id) {
      var c = previewCalibrationValue(id); bounds.push({ x: c.offsetX, y: c.offsetY, theta: 0 });
    });
  }
  if (mapCalibration.frozenBounds) return mapCalibration.frozenBounds;
  mapCalibration.lastBounds = bounds.slice(); return bounds;
}
function previewCalibrationProjection (screen) {
  var zero = screen({ x: 0, y: 0 });
  var x = screen({ x: 1, y: 0 });
  var y = screen({ x: 0, y: 1 });
  mapCalibration.projection = { x: x.y - zero.y, y: y.x - zero.x };
}
function previewDrawOrigins (context, screen) {
  if (!previewCalibrationEnabled()) return;
  [[missionId, '#087f73', 'Mission origin'], [mapExtras.compare && mapExtras.compare.id, '#db6b00', 'Comparison origin']].forEach(function (item) {
    if (!item[0]) return;
    var c = previewCalibrationValue(item[0]);
    var p = screen({ x: c.offsetX, y: c.offsetY });
    context.save(); context.strokeStyle = item[1]; context.fillStyle = item[1]; context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(p.x - 7, p.y); context.lineTo(p.x + 7, p.y);
    context.moveTo(p.x, p.y - 7); context.lineTo(p.x, p.y + 7); context.stroke();
    context.font = '11px sans-serif'; context.fillText(item[2], p.x + 10, p.y - 10); context.restore();
  });
}
function previewCalibrationPane (pane) {
  if (!previewCalibrationEnabled()) return;
  var section = layoutSection(pane, 'Coordinate calibration and alignment');
  section.innerHTML += '<label class="dash-field">Trajectory to adjust<select id="calibrationTarget"><option value="main">Selected mission (black)</option><option value="compare">Comparison mission (orange)</option></select></label>' +
    '<div class="dash-button-row"><button type="button" id="calibrationCurrent">Use current position as origin</button><button type="button" id="calibrationSave" class="dash-primary">Save calibration</button></div>' +
    '<div id="calibrationStatus" class="dash-small" role="status"></div>' +
    '<p class="dash-small">Origin uses raw robot coordinates. Placement positions that origin on the comparison map. Changes are previews until saved.</p>' +
    '<div class="dash-pair"><label class="dash-field">Raw origin X<input type="number" step="any" id="calibrationOriginX"></label><label class="dash-field">Raw origin Y<input type="number" step="any" id="calibrationOriginY"></label></div>' +
    '<div class="dash-pair"><label class="dash-field">Map placement X<input type="number" step="any" id="calibrationOffsetX"></label><label class="dash-field">Map placement Y<input type="number" step="any" id="calibrationOffsetY"></label></div>' +
    '<label class="dash-field">Map rotation (-180 to 180 degrees)<input type="number" min="-180" max="180" step="any" id="calibrationRotation"></label>' +
    '<div class="dash-button-row"><button type="button" id="calibrationReload">Reload</button><button type="button" id="calibrationReset">Restore raw coordinates</button></div>';
  previewElement('calibrationTarget').addEventListener('change', function () { mapCalibration.target = this.value; previewCalibrationFill(); });
  Object.keys(RoombaCoordinates.defaults).forEach(function (key) {
    var input = previewElement('calibration' + key[0].toUpperCase() + key.slice(1));
    input.addEventListener('input', previewCalibrationEdit);
  });
  previewElement('calibrationSave').addEventListener('click', function () { previewCalibrationSave('manual'); });
  previewElement('calibrationCurrent').addEventListener('click', previewCalibrationCurrent);
  previewElement('calibrationReload').addEventListener('click', previewCalibrationReload);
  previewElement('calibrationReset').addEventListener('click', function () {
    if (window.confirm('Restore raw coordinates with zero placement and rotation for this mission? Original samples are preserved.')) previewCalibrationSave('reset');
  });
  window.addEventListener('beforeunload', function (event) {
    if (Object.keys(mapCalibration.tasks).some(function (id) { return mapCalibration.tasks[id].dirty; })) { event.preventDefault(); event.returnValue = ''; }
  });
  previewCalibrationFill();
}
function previewCalibrationPolicyPane (pane) {
  if (!previewCalibrationEnabled()) return;
  var section = layoutSection(pane, 'Automatic dock calibration');
  section.innerHTML += '<label class="dash-switch"><input type="checkbox" id="calibrationAutoDock">Calibrate once per mission when docking to charge</label>' +
    '<p class="dash-small">Off by default. Requires a new charging transition and newly reported pose. Cached positions cannot trigger it. Runs once per mission and preserves manual calibration. Robot localization is unchanged.</p>' +
    '<div id="calibrationPolicyStatus" class="dash-small" role="status"></div>';
  var input = previewElement('calibrationAutoDock');
  input.checked = Boolean(enhancement.initialCalibrationPolicy && enhancement.initialCalibrationPolicy.enabled);
  input.addEventListener('change', function () {
    var value = input.checked; input.disabled = true;
    previewJSON('calibration-policy', { enabled: value }).done(function (data) { previewCalibrationPolicyStatus(data); })
      .fail(function (xhr) { input.checked = !value; previewMessage('Could not save automatic calibration policy: ' + previewError(xhr)); })
      .always(function () { input.disabled = false; });
  });
  previewCalibrationPolicyStatus(enhancement.initialCalibrationPolicy);
}
function previewCalibrationPolicyStatus (policy) {
  if (!policy) return;
  var input = previewElement('calibrationAutoDock'); if (input && !input.disabled) input.checked = policy.enabled;
  previewText('calibrationPolicyStatus', policy.error || (policy.enabled ? 'Enabled: waiting for a newly reported charging pose; firmware support varies.' : 'Automatic calibration is disabled.'));
}
function previewCalibrationOrigin () {
  var frame = previewFrame();
  var reference = mapCalibration.target === 'compare';
  var point = reference ? mapExtras.compare && mapExtras.compare.points.slice(-1)[0] : frame ? frame.current : null;
  var label = reference ? 'comparison endpoint' : frame ? 'Playback position' : selectedMission === 'latest' ? 'last reported position (may be cached; not necessarily the dock)' : 'Last mission position';
  if (!reference && !frame) {
    var pose = latestState && latestState.pose;
    point = pose && pose.point ? { x: pose.point.x, y: pose.point.y, theta: pose.theta } : null;
    if (!validPosition(point)) point = points[points.length - 1];
  }
  return validPosition(point) ? { point: point, label: label } : null;
}
function previewCalibrationFill () {
  var entry = previewCalibrationEntry(previewCalibrationTargetId());
  // Suggest only for tasks that have never been calibrated. Do not move the map
  // or mark a draft dirty just because the user opened the page.
  if (entry && entry.saved && !entry.saved.error && entry.saved.revision === null && !entry.dirty && !entry.formTouched && !entry.suggestion) {
    var origin = previewCalibrationOrigin();
    if (origin) {
      entry.suggestion = Object.assign({}, entry.value, { originX: origin.point.x, originY: origin.point.y, offsetX: 0, offsetY: 0 });
      entry.suggestionLabel = origin.label;
    }
  }
  var value = entry && (entry.suggestion || entry.value);
  Object.keys(RoombaCoordinates.defaults).forEach(function (key) {
    var input = previewElement('calibration' + key[0].toUpperCase() + key.slice(1));
    if (input) input.value = value ? value[key] : '';
  });
  previewCalibrationControls();
}
function previewCalibrationControls () {
  var button = previewElement('calibrationSave'); if (!button) return;
  var id = previewCalibrationTargetId();
  var entry = previewCalibrationEntry(id);
  var valid = entry && entry.saved && !entry.saved.error;
  ['calibrationSave', 'calibrationReset', 'calibrationCurrent'].forEach(function (name) { previewElement(name).disabled = !valid || entry.saving; });
  Object.keys(RoombaCoordinates.defaults).forEach(function (key) {
    previewElement('calibration' + key[0].toUpperCase() + key.slice(1)).disabled = !valid || entry.saving;
  });
  previewElement('calibrationReload').disabled = !id || Boolean(entry && entry.saving);
  var frame = previewFrame();
  var ended = mapCalibration.target === 'compare' || selectedMission !== 'latest';
  previewElement('calibrationCurrent').textContent = ended ? 'Use mission endpoint as origin' : frame ? 'Use playback position as origin' : 'Use current position as origin';
  previewText('calibrationStatus', !id ? 'Load the target mission first.' : !valid ? entry && entry.saved && entry.saved.error || 'Waiting for calibration data...'
    : (entry.saving ? 'Saving...' : entry.dirty ? (entry.originHint ? entry.originHint + ' ' : '') + 'Preview only. Click Save calibration above.' : entry.suggestion
      ? 'Auto-filled: ' + entry.suggestionLabel + '. Form suggestion only, not applied. Click Save calibration to apply.'
      : 'Saved · ' + (entry.saved.source === 'dock' ? 'Dock calibration' : entry.saved.source === 'manual' ? 'Manual calibration' : 'Using raw coordinates')) +
    (entry.saved.autoDone ? ' · Dock calibration completed for this mission' : '') + (entry.saved.protectedManual ? ' · Protected from automatic calibration' : ''));
}
function previewCalibrationEdit () {
  var entry = previewCalibrationEntry(previewCalibrationTargetId()); if (!entry || entry.saving) return;
  entry.formTouched = true; entry.suggestion = null;
  var value = {};
  var valid = true;
  Object.keys(RoombaCoordinates.defaults).forEach(function (key) {
    var input = previewElement('calibration' + key[0].toUpperCase() + key.slice(1));
    var number = Number(input.value);
    if (String(input.value).trim() === '' || !Number.isFinite(number) || Math.abs(number) > (key === 'rotation' ? 180 : 1000000)) valid = false;
    value[key] = number;
  });
  if (!valid) { previewText('calibrationStatus', 'Enter valid numbers; coordinate range is +/-1,000,000.'); return false; }
  entry.value = value; entry.originHint = null; entry.dirty = true; entry.version++; previewCalibrationControls(); renderMap(); return true;
}
function previewCalibrationSave (action, extra) {
  var id = previewCalibrationTargetId();
  var entry = previewCalibrationEntry(id);
  if (!entry || !entry.saved || entry.saved.error || entry.saving) return;
  if (action === 'manual' && !previewCalibrationEdit()) return;
  var body = Object.assign({}, entry.value, extra || {}, { action: action, revision: entry.saved.revision });
  var version = entry.version;
  entry.saving = true; previewCalibrationControls();
  previewJSON('calibration/' + encodeURIComponent(id), body).done(function (value) {
    mapCalibration.epoch++; entry.saved = value;
    if (entry.version === version) { entry.value = Object.assign({}, value); entry.dirty = false; entry.suggestion = null; }
    previewMessage('Calibration saved to the server. Original coordinates are preserved.');
    if (id === previewCalibrationTargetId()) previewCalibrationFill(); renderMap();
  }).fail(function (xhr) { previewMessage('Could not save calibration; preview retained: ' + previewError(xhr)); })
    .always(function () { entry.saving = false; previewCalibrationControls(); });
}
function previewCalibrationCurrent () {
  var entry = previewCalibrationEntry(previewCalibrationTargetId());
  if (!entry || !entry.saved || entry.saved.error || entry.saving) return;
  var origin = previewCalibrationOrigin();
  if (!origin) { previewMessage('No position is available for calibration.'); return; }
  var point = origin.point;
  entry.value = Object.assign({}, entry.value, { originX: point.x, originY: point.y, offsetX: 0, offsetY: 0 });
  entry.suggestion = null; entry.formTouched = true;
  entry.originHint = 'Filled: ' + origin.label + ': X ' + point.x + ' / Y ' + point.y + '。';
  entry.dirty = true; entry.version++; mapCalibration.frozenBounds = null;
  previewCalibrationFill(); renderMap();
}
function previewCalibrationReload () {
  var id = previewCalibrationTargetId();
  var entry = previewCalibrationEntry(id); if (!entry || entry.saving) return;
  if (entry.dirty && !window.confirm('Discard the unsaved calibration preview and reload this trajectory?')) return;
  var version = entry.version; entry.saving = true; previewCalibrationControls();
  $.ajax({ url: '/api/local/history/enhancements/calibration/' + encodeURIComponent(id), dataType: 'json', cache: false, timeout: 10000 })
    .done(function (value) {
      if (entry.version !== version) return;
      mapCalibration.epoch++; entry.saved = value; entry.value = Object.assign({}, value); entry.dirty = false;
      entry.suggestion = null; entry.formTouched = true;
      if (id === previewCalibrationTargetId()) previewCalibrationFill(); renderMap();
    }).fail(function (xhr) { previewMessage('Could not reload calibration: ' + previewError(xhr)); })
    .always(function () { entry.saving = false; previewCalibrationControls(); });
}
function previewCalibrationDragTools (tools) {
  if (!previewCalibrationEnabled()) return;
  var select = layoutNode('select', 'dash-drag-mode'); select.id = 'calibrationDragMode'; select.setAttribute('aria-label', 'Map drag mode');
  select.innerHTML = '<option value="view">Pan viewport</option><option value="main">Move selected trajectory</option><option value="compare">Move comparison trajectory</option>';
  tools.appendChild(select);
  select.addEventListener('change', function () {
    mapCalibration.dragMode = this.value; mapCalibration.frozenBounds = null;
    if (this.value !== 'view') { mapCalibration.target = this.value; previewElement('calibrationTarget').value = this.value; layoutSelectTab('Task'); previewCalibrationFill(); }
    renderMap();
  });
}
function previewCalibrationDragBegin () {
  if (!previewCalibrationEnabled() || mapCalibration.dragMode === 'view') return null;
  var id = mapCalibration.dragMode === 'compare' ? mapExtras.compare && mapExtras.compare.id : missionId;
  var entry = previewCalibrationEntry(id);
  if (!entry || !entry.saved || entry.saved.error || entry.saving || !mapCalibration.projection) return { blocked: true };
  mapCalibration.frozenBounds = mapCalibration.lastBounds.slice();
  var rect = pathLayer.getBoundingClientRect();
  var ratio = rect.width / pathLayer.width;
  return { id: id,
    entry: entry,
    offsetX: entry.value.offsetX,
    offsetY: entry.value.offsetY,
    unitX: mapCalibration.projection.x * ratio,
    unitY: mapCalibration.projection.y * ratio };
}
function previewCalibrationDragMove (drag, dx, dy) {
  if (!drag || drag.blocked || !drag.unitX || !drag.unitY || drag.entry.saving) return;
  var x = drag.offsetX + dy / drag.unitX;
  var y = drag.offsetY + dx / drag.unitY;
  if (Math.abs(x) > 1000000 || Math.abs(y) > 1000000) return;
  drag.entry.value.offsetX = Number(x.toFixed(2)); drag.entry.value.offsetY = Number(y.toFixed(2)); drag.entry.dirty = true; drag.entry.version++;
  drag.entry.suggestion = null; drag.entry.formTouched = true;
  if (drag.id === previewCalibrationTargetId()) previewCalibrationFill(); renderMap();
}
function previewCalibrationResetView () { mapCalibration.frozenBounds = null; }
function previewCalibrationForget (ids) { ids.forEach(function (id) { delete mapCalibration.tasks[id]; }); previewCalibrationResetView(); }
