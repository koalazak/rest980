/* global $ sizeX sizeY xOffset yOffset updateEvery */
/* eslint-env browser */
/* eslint no-unused-vars: "off", no-global-assign: "off", no-native-reassign: "off" */
// Coordinates are recorded by the server, independently of this page.
window.onload = startApp;
var mapping = true;
var pathLayer, robotBodyLayer, textLayer;
var points = [];
var missionId = null;
var selectedMission = 'latest';
var latestState = {};
var hiddenThrough = 0;
var request = null;
var pollTimer = null;
var generation = 0;
var listAt = 0;
var listRequest = null;
var listGeneration = 0;
var deleting = false;
var canDelete = false;

function startApp () {
  pathLayer = document.getElementById('path_layer');
  robotBodyLayer = document.getElementById('robot_body_layer');
  textLayer = document.getElementById('text_layer');
  [pathLayer, robotBodyLayer, textLayer].forEach(function (canvas) {
    canvas.width = Number(sizeX) || 800;
    canvas.height = Number(sizeY) || 800;
  });
  $('#sizew').val(pathLayer.width);
  $('#sizeh').val(pathLayer.height);
  $('#offsetx').val(xOffset);
  $('#offsety').val(yOffset);
  $('#updateevery').val(updateEvery);
  var controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:8px 0';
  controls.innerHTML = '<label>Mission: <select id="historyMission"><option value="latest">Latest mission (live)</option></select></label>' +
    '<button type="button" class="btn btn-danger" id="historyDelete" disabled>Delete selected mission</button>' +
    '<label><input type="checkbox" id="historyAutoFit" checked> Fit to trajectory</label>' +
    '<span id="historyInfo">Loading recorded trajectory...</span>';
  document.getElementById('apiresponse').parentNode.insertAdjacentElement('afterend', controls);
  document.getElementById('historyMission').addEventListener('change', function () {
    selectedMission = this.value;
    missionId = null;
    points = [];
    latestState = {};
    hiddenThrough = 0;
    canDelete = false;
    updateDeleteButton();
    renderMap();
    restartLoop();
  });
  document.getElementById('historyDelete').addEventListener('click', deleteSelectedMission);
  document.getElementById('historyAutoFit').addEventListener('change', renderMap);
  var toggle = document.querySelector('button[onclick="toggleMapping();"]');
  if (toggle) toggle.textContent = 'Pause display';
  var clear = document.querySelector('button[onclick="clearMap();"]');
  if (clear) clear.textContent = 'Clear display';
  startMissionLoop();
}

function refreshMissionList () {
  listAt = Date.now();
  var token = ++listGeneration;
  if (listRequest) listRequest.abort();
  var pending = $.ajax({ url: '/api/local/history', dataType: 'json', cache: false, timeout: 10000 });
  listRequest = pending;
  pending
    .done(function (data) {
      if (token !== listGeneration || deleting) return;
      var select = document.getElementById('historyMission');
      if (!select || !Array.isArray(data.missions)) return;
      while (select.options.length > 1) select.remove(1);
      data.missions.forEach(function (mission) {
        var option = document.createElement('option');
        option.value = mission.id;
        option.textContent = 'Mission ' + (mission.nMssn == null ? '?' : mission.nMssn) + ' · ' +
          new Date(mission.createdAt).toLocaleString() + ' · ' + mission.count + ' points';
        select.appendChild(option);
      });
      select.value = selectedMission;
    })
    .always(function () {
      if (listRequest === pending) listRequest = null;
    });
}

function updateDeleteButton () {
  var button = document.getElementById('historyDelete');
  if (!button) return;
  button.disabled = deleting || !missionId || !canDelete;
  button.title = canDelete ? 'Delete the recorded map for this mission' : 'Finish the current mission or load a saved map first';
}

function resetDisplayedMission () {
  selectedMission = 'latest';
  missionId = null;
  points = [];
  latestState = {};
  hiddenThrough = 0;
  canDelete = false;
  listAt = 0;
  var select = document.getElementById('historyMission');
  if (select) select.value = 'latest';
  updateDeleteButton();
  updateState({}, null);
  renderMap();
}

function deleteSelectedMission () {
  if (deleting || !missionId || !canDelete) return;
  var id = missionId;
  var number = (latestState.cleanMissionStatus || {}).nMssn;
  if (!window.confirm('Delete mission ' + (number == null ? id : number) + ' map?\nThis permanently deletes its recorded trajectory.')) return;
  deleting = true;
  updateDeleteButton();
  var select = document.getElementById('historyMission');
  if (select) select.disabled = true;
  listGeneration++;
  if (listRequest) listRequest.abort();
  restartLoop();
  $.ajax({ url: '/api/local/history/' + encodeURIComponent(id), type: 'DELETE', dataType: 'json', timeout: 10000 })
    .done(function () {
      resetDisplayedMission();
      $('#mapStatus').text('Mission map deleted');
    })
    .fail(function (xhr) {
      if (xhr.status === 409) canDelete = false;
      $('#mapStatus').text(xhr.status === 409 ? 'Finish the current mission before deleting its map'
        : 'Deletion failed: ' + (xhr.responseJSON && xhr.responseJSON.error || 'Check the history service and retry'));
    })
    .always(function () {
      deleting = false;
      if (select) select.disabled = false;
      updateDeleteButton();
      refreshMissionList();
      restartLoop();
    });
}

function restartLoop () {
  generation++;
  clearTimeout(pollTimer);
  var previous = request;
  request = null;
  if (previous) previous.abort();
  if (mapping) startMissionLoop();
}

function startMissionLoop () {
  if (!mapping || request || deleting) return;
  if (Date.now() - listAt > 15000) refreshMissionList();
  var token = generation;
  var pending = $.ajax({
    url: '/api/local/history/points',
    dataType: 'json',
    cache: false,
    timeout: 10000,
    data: { mission: selectedMission, known: missionId || '', after: points.length }
  });
  request = pending;
  pending.done(function (data) {
    if (token !== generation || !mapping) return;
    if (data.id !== missionId || data.reset) {
      if (data.id !== missionId) {
        hiddenThrough = 0;
        listAt = 0;
      }
      points = [];
    }
    missionId = data.id;
    canDelete = Boolean(data.deletable);
    updateDeleteButton();
    if (Array.isArray(data.points)) points = points.concat(data.points);
    latestState = data.state || {};
    updateState(latestState, data.lastSeen || data.updatedAt);
    renderMap();
    $('#historyInfo').text((missionId ? 'Server saved ' + data.total + ' points. ' : 'Waiting for a cleaning mission. ') +
      'Recording continues with this page closed; server downtime cannot be recovered.');
    updateRecordingStatus(data);
  });
  pending.fail(function (xhr, status) {
    if (token !== generation || status === 'abort') return;
    if (xhr.status === 404 && selectedMission !== 'latest') {
      resetDisplayedMission();
      $('#mapStatus').text('Mission no longer exists; refreshing the list');
      return;
    }
    $('#mapStatus').text(xhr.status === 404
      ? 'History endpoint not found; check server configuration'
      : 'History request failed; retrying without clearing the display');
  });
  pending.always(function () {
    if (request === pending) request = null;
    if (token === generation && mapping) {
      pollTimer = setTimeout(startMissionLoop, Math.max(500, Number(updateEvery) || 800));
    }
  });
}

function updateRecordingStatus (data) {
  if (data.recordingError) $('#mapStatus').text(data.recordingError);
  else if (!data.online) $('#mapStatus').text('Robot disconnected; showing saved trajectory');
  else $('#mapStatus').text(selectedMission === 'latest' ? 'Displaying recorded trajectory' : 'Viewing a previous mission');
}

function text (id, value) {
  $('#' + id).text(value === undefined || value === null ? '—' : value);
}

function updateState (state, time) {
  var status = state.cleanMissionStatus || {};
  ['cycle', 'phase', 'flags', 'error', 'sqft', 'expireM', 'rechrgM', 'notReady', 'nMssn'].forEach(function (key) {
    text(key, status[key]);
  });
  text('mission', status.mssnM);
  text('batPct', state.batPct);
  text('bin', state.bin && state.bin.present);
  text('last', time ? new Date(time).toLocaleString() : null);
  text('theta', state.pose && state.pose.theta);
  text('x', state.pose && state.pose.point && state.pose.point.x);
  text('y', state.pose && state.pose.point && state.pose.point.y);
}

function validPosition (point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.theta);
}

function renderMap () {
  if (!pathLayer) return;
  var pathContext = pathLayer.getContext('2d');
  var robotContext = robotBodyLayer.getContext('2d');
  var labelContext = textLayer.getContext('2d');
  [pathContext, robotContext, labelContext].forEach(function (context) {
    context.clearRect(0, 0, pathLayer.width, pathLayer.height);
  });
  var visible = points.filter(function (point) { return point.seq > hiddenThrough && validPosition(point); });
  var pose = latestState.pose;
  var current = pose && pose.point ? { x: pose.point.x, y: pose.point.y, theta: pose.theta } : null;
  if (!validPosition(current)) current = visible[visible.length - 1];
  var bounds = visible.slice();
  if (current) bounds.push(current);
  if (!bounds.length) return;
  var fit = document.getElementById('historyAutoFit');
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;
  bounds.forEach(function (point) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  });
  var scale = Math.min(1, (pathLayer.width - 80) / Math.max(1, maxY - minY),
    (pathLayer.height - 80) / Math.max(1, maxX - minX));
  function screen (point) {
    if (fit && fit.checked) {
      return {
        x: pathLayer.width / 2 - (point.y - (minY + maxY) / 2) * scale,
        y: pathLayer.height / 2 - (point.x - (minX + maxX) / 2) * scale
      };
    }
    return { x: pathLayer.width - (point.y + Number(yOffset)), y: pathLayer.height - (point.x + Number(xOffset)) };
  }
  pathContext.beginPath();
  pathContext.lineWidth = 1.5;
  pathContext.strokeStyle = '#222';
  var previous;
  visible.forEach(function (point) {
    var position = screen(point);
    if (!previous || point.break) pathContext.moveTo(position.x, position.y);
    else pathContext.lineTo(position.x, position.y);
    previous = point;
  });
  pathContext.stroke();
  if (current) {
    var position = screen(current);
    var angle = (current.theta - 90) * Math.PI / 180;
    robotContext.beginPath();
    robotContext.arc(position.x, position.y, 14, 0, 2 * Math.PI);
    robotContext.fillStyle = '#159b25';
    robotContext.fill();
    robotContext.lineWidth = 2;
    robotContext.strokeStyle = '#064c10';
    robotContext.stroke();
    robotContext.beginPath();
    robotContext.moveTo(position.x, position.y);
    robotContext.lineTo(position.x + 14 * Math.cos(angle), position.y + 14 * Math.sin(angle));
    robotContext.stroke();
    labelContext.font = '12px sans-serif';
    labelContext.fillStyle = '#164d9a';
    labelContext.fillText((latestState.cleanMissionStatus || {}).phase || '', position.x + 17, position.y);
  }
}

function clearMap () {
  hiddenThrough = points.length ? points[points.length - 1].seq : 0;
  renderMap();
  $('#mapStatus').text('Display cleared; recorded history is retained and returns on reload');
}

function toggleMapping () {
  mapping = !mapping;
  var button = document.querySelector('button[onclick="toggleMapping();"]');
  if (button) button.textContent = mapping ? 'Pause display' : 'Resume display';
  restartLoop();
  if (!mapping) $('#mapStatus').text('Display paused; server recording continues');
}

function getValue (selector, current) {
  var value = parseInt($(selector).val(), 10);
  return Number.isFinite(value) ? value : current;
}

function downloadCanvas () {
  var canvas = document.createElement('canvas');
  canvas.width = pathLayer.width;
  canvas.height = pathLayer.height;
  var context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  [pathLayer, robotBodyLayer, textLayer].forEach(function (layer) { context.drawImage(layer, 0, 0); });
  var link = document.getElementById('download');
  link.href = canvas.toDataURL();
  link.download = (missionId || 'roomba') + '.png';
}

function saveValues () {
  $.post('/map/values', {
    offsetX: Number(xOffset),
    offsetY: Number(yOffset),
    sizeW: pathLayer.width,
    sizeH: pathLayer.height,
    pointIntervalMs: Number(updateEvery)
  }).fail(function () { $('#mapStatus').text('Canvas settings could not be saved; recorded history is unaffected'); });
}

$('.metrics').on('change', function () {
  var width = Math.max(200, Math.min(4096, getValue('#sizew', pathLayer.width)));
  var height = Math.max(200, Math.min(4096, getValue('#sizeh', pathLayer.height)));
  xOffset = getValue('#offsetx', xOffset);
  yOffset = getValue('#offsety', yOffset);
  [pathLayer, robotBodyLayer, textLayer].forEach(function (canvas) { canvas.width = width; canvas.height = height; });
  renderMap();
});

$('#updateevery').on('change', function () {
  updateEvery = Math.max(500, getValue('#updateevery', updateEvery));
});

$('.action').on('click', function () {
  var button = $(this);
  button.button('loading');
  $.ajax({ url: button.data('action'), dataType: 'json', timeout: 10000 })
    .done(function (data) { $('#apiresponse').text(JSON.stringify(data)); })
    .fail(function () { $('#apiresponse').text('Request failed; check the robot before retrying'); })
    .always(function () { button.button('reset'); });
});
