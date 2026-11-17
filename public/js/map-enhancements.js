/* global $:true RoombaReplay:true RoombaTrajectory:true canDelete:true clearMap:true deleteSelectedMission:true deleting:true downloadCanvas:true generation:true getValue:true hiddenThrough:true latestState:true listAt:true listGeneration:true listRequest:true mapping:true missionId:true pathLayer:true points:true pollTimer:true refreshMissionList:true renderMap:true request:true resetDisplayedMission:true restartLoop:true robotBodyLayer:true saveLegacyValues:true saveValues:true selectedMission:true sizeX:true sizeY:true startApp:true startMissionLoop:true text:true textLayer:true toggleMapping:true updateDeleteButton:true updateEvery:true updateRecordingStatus:true updateState:true validPosition:true xOffset:true yOffset:true */
/* eslint-env browser */
/* eslint no-unused-vars: "off", no-global-assign: "off", no-native-reassign: "off" */
/* global $ sizeX sizeY xOffset yOffset updateEvery RoombaReplay */
var enhancement = { features: [], replay: null, lastData: null, timer: null, statusTimer: null };
function previewHas (name) { return enhancement.features.indexOf(name) !== -1; }
function previewElement (id) { return document.getElementById(id); }
function previewText (id, value) { var element = previewElement(id); if (element) element.textContent = value; }
function previewMessage (message) { previewText('previewMessage', message); }
function previewJSON (url, body) {
  return $.ajax({ url: '/api/local/history/enhancements/' + url,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify(body),
    dataType: 'json',
    timeout: 15000 });
}
function previewError (xhr) { return xhr.responseJSON && xhr.responseJSON.error || 'Request failed; check server logs'; }
function previewStartApp () {
  $.ajax({ url: '/api/local/history/enhancements', dataType: 'json', cache: false, timeout: 10000 })
    .done(function (data) {
      enhancement.features = data.features || [];
      enhancement.initialSettings = data.settings;
      enhancement.initialRetention = data.retention;
      if (data.settings && previewHas('settings')) {
        sizeX = data.settings.sizeW; sizeY = data.settings.sizeH;
        xOffset = data.settings.offsetX; yOffset = data.settings.offsetY;
        updateEvery = data.settings.pointIntervalMs;
      }
    })
    .fail(function () { enhancement.bootstrapFailed = true; })
    .always(function () { startApp(); previewInit(); });
}
function previewInit () {
  var panel = document.createElement('div');
  panel.style.cssText = 'margin:10px 0;padding:10px;border:1px solid #ccc;max-width:1000px';
  panel.innerHTML = '<div id="previewMessage" role="status"></div>' +
    '<div id="previewSummary"></div><div id="previewStatus"></div>' +
    '<div id="previewReplay"></div><div id="previewExtras"></div><div id="previewRetention"></div>';
  previewElement('historyInfo').parentNode.insertAdjacentElement('afterend', panel);
  // The original floating sidebar overlaps absolute canvases on narrow screens.
  var lastState = previewElement('last');
  if (lastState && lastState.parentNode) {
    var detail = document.createElement('details');
    detail.innerHTML = '<summary>Robot details (available recorded values during playback)</summary>';
    lastState.parentNode.style.cssText = 'float:none;margin:6px 0';
    detail.appendChild(lastState.parentNode); panel.appendChild(detail);
  }
  if (enhancement.bootstrapFailed) previewMessage('Enhancements could not initialize; the basic map remains available. Check server logs and reload.');
  if (previewHas('settings') && enhancement.initialSettings) {
    previewElement('historyAutoFit').checked = enhancement.initialSettings.autoFit;
    previewElement('historyAutoFit').addEventListener('change', function () {
      previewMessage('Trajectory fit changed; use Save display settings to persist it.');
    });
  }
  if (previewHas('replay')) {
    enhancement.replay = new RoombaReplay();
    previewElement('previewReplay').innerHTML = '<button type="button" id="previewPlay">Play trajectory</button> ' +
      '<button type="button" id="previewLive">Full / live view</button> ' +
      '<select id="previewSpeed" aria-label="Playback speed"><option value="1">1×</option><option value="5" selected>5×</option>' +
      '<option value="20">20×</option><option value="60">60×</option></select> ' +
      '<input id="previewSeek" aria-label="Playback position" type="range" min="0" max="1000" value="1000" style="width:260px;display:inline-block"> ' +
      '<span id="previewReplayInfo"></span><div>Playback reproduces recorded positions and phases. Battery and area are mission summaries, not historical samples.</div>';
    previewElement('previewPlay').addEventListener('click', function () {
      var replay = enhancement.replay;
      if (replay.playing) replay.pause(); else replay.play();
      previewRenderReplay();
    });
    previewElement('previewLive').addEventListener('click', function () {
      enhancement.replay.goLive(); previewRenderReplay();
    });
    previewElement('previewSpeed').addEventListener('change', function () {
      enhancement.replay.speed = Number(this.value); enhancement.replay.lastTick = null;
    });
    previewElement('previewSeek').addEventListener('input', function () {
      enhancement.replay.pause(); enhancement.replay.seek(Number(this.value) / 1000); previewRenderReplay();
    });
    enhancement.timer = setInterval(function () {
      if (enhancement.replay.tick(performance.now())) previewRenderReplay();
      else previewReplayControls();
    }, 100);
  }
  if (previewHas('retention')) previewRetentionInit();
  previewExtrasInit();
  enhancement.statusTimer = setInterval(function () {
    if (enhancement.lastData) previewStatus(enhancement.lastData.recorderStatus);
  }, 1000);
  try { previewDashboardInit(); } catch (error) { console.error('[roomba-layout]', error); previewMessage('The dashboard could not initialize. Reload the page and check server logs.'); }
  renderMap();
}
function previewSaveValues () {
  // Read the fields again on save, including edits that have not emitted change yet.
  var width = Math.max(200, Math.min(4096, getValue('#sizew', pathLayer.width)));
  var height = Math.max(200, Math.min(4096, getValue('#sizeh', pathLayer.height)));
  xOffset = getValue('#offsetx', xOffset); yOffset = getValue('#offsety', yOffset);
  updateEvery = Math.max(500, getValue('#updateevery', updateEvery));
  [pathLayer, robotBodyLayer, textLayer].forEach(function (canvas) { canvas.width = width; canvas.height = height; });
  renderMap();
  if (!previewHas('settings')) {
    if (enhancement.bootstrapFailed) {
      previewMessage('Enhancements are unavailable; settings were not saved. Check the server and reload.'); return;
    }
    saveLegacyValues(); return;
  }
  previewJSON('settings', { offsetX: Number(xOffset),
    offsetY: Number(yOffset),
    sizeW: pathLayer.width,
    sizeH: pathLayer.height,
    pointIntervalMs: Number(updateEvery),
    autoFit: previewElement('historyAutoFit').checked })
    .done(function () { previewMessage('Display settings saved on the server and retained across reloads and container recreation when storage is mounted.'); })
    .fail(function (xhr) { previewMessage('Settings could not be saved: ' + previewError(xhr)); });
}
function previewReset () {
  previewExtrasReset();
  if (enhancement.replay) { enhancement.replay.id = null; enhancement.replay.setPoints(null, []); enhancement.replay.goLive(); }
  enhancement.lastData = null;
  previewText('previewSummary', ''); previewText('previewStatus', ''); previewReplayControls();
  previewLayoutState({}, null, {});
}
function previewUpdate (data, annotationEpoch) {
  enhancement.lastData = data;
  if (enhancement.replay) enhancement.replay.setPoints(data.id, points);
  if (previewHas('summary') && data.summary) {
    var summary = data.summary;
    var labels = { ended: 'Ended', active: 'Mission active', recharging: 'Recharging during mission', paused: 'Paused', error: 'Robot reports an error' };
    var number = function (value, decimals) { return value == null ? '—' : Number(value).toFixed(decimals); };
    previewText('previewSummary', (labels[summary.condition] || summary.condition) +
      ' · first observed: ' + new Date(summary.observedFrom).toLocaleString() +
      ' · observed span ' + number(summary.observedMinutes, 1) + ' minutes (includes pauses and recharge)' +
      ' · robot reports cleaning ' + number(summary.reportedMinutes, 0) + ' min / ' + number(summary.reportedAreaM2, 1) +
      ' m² · last reported battery ' + number(summary.batteryLast, 0) + '% · error code ' + (summary.error == null ? '—' : summary.error));
  } else previewText('previewSummary', '');
  previewStatus(data.recorderStatus); previewReplayControls();
  previewExtrasUpdate(data, annotationEpoch);
  previewLayoutData(data);
}
function previewStatus (status) {
  previewLayoutConnection(status);
  if (!previewHas('status') || !status) return;
  // Derive ages from the server clock plus elapsed client time, avoiding client clock skew.
  if (enhancement.statusStamp !== status) {
    enhancement.statusStamp = status; enhancement.receivedAt = performance.now();
  }
  var now = Date.parse(status.now) + performance.now() - enhancement.receivedAt;
  function age (value) { return value ? Math.max(0, Math.floor((now - Date.parse(value)) / 1000)) + ' seconds ago' : 'not recorded in this process'; }
  var label = { connected: 'Connected', disconnected: 'Disconnected', unknown: 'connection unknown' };
  previewText('previewStatus', 'Recorder: ' + (label[status.transport] || 'Unknown') +
    ' · latest state ' + age(status.lastSeen) + ' · latest coordinate ' + age(status.lastCoordinateAt) +
    ' · latest successful write ' + age(status.lastWriteAt) +
    (status.lastSeen && now - Date.parse(status.lastSeen) > 60000 ? ' · no recent state update (may be normal while stationary)' : '') +
    (status.recordingError ? ' · write error: ' + status.recordingError : ''));
}
function previewFrame () { return enhancement.replay && !enhancement.replay.live ? enhancement.replay.frame() : null; }
function previewDisplayState (data) {
  var frame = previewFrame();
  previewLayoutState(frame ? { cleanMissionStatus: frame.current || {} } : latestState, frame, data);
  if (!frame) { updateState(latestState, selectedMission === 'latest' ? data.lastSeen || data.updatedAt : data.updatedAt); return; }
  var point = frame.current;
  // Battery and area have no per-point samples: leave them blank during playback.
  updateState(point ? { pose: { theta: point.theta, point: { x: point.x, y: point.y } },
    cleanMissionStatus: { phase: point.phase, cycle: point.cycle, nMssn: data.nMssn } } : {}, point && point.t);
}
function previewReplayControls () {
  var replay = enhancement.replay;
  if (!replay || !previewElement('previewPlay')) return;
  var frame = replay.frame();
  previewElement('previewPlay').disabled = !replay.points.length;
  previewElement('previewSeek').disabled = !replay.points.length;
  previewText('previewPlay', replay.playing ? 'Pause playback' : 'Play trajectory');
  previewElement('previewSeek').value = Math.round(frame.fraction * 1000);
  previewText('previewReplayInfo', (replay.live ? 'Full / live' : 'Playback') + ' · ' + frame.count + '/' + replay.points.length +
    ' points' + (frame.time ? ' · ' + new Date(frame.time).toLocaleString() : ''));
}
function previewRenderReplay () {
  previewReplayControls();
  if (enhancement.lastData) previewDisplayState(enhancement.lastData);
  renderMap();
}
function previewRetentionInit () {
  var area = previewElement('previewRetention');
  area.innerHTML = '<details><summary>History management (permanent deletion; automatic cleanup off by default)</summary>' +
    '<div><button type="button" id="previewLoadHistory">Refresh mission list</button> ' +
    '<button type="button" id="previewBatchDelete">Preview and delete selected missions</button></div>' +
    '<div id="previewHistoryList" style="max-height:180px;overflow:auto"></div>' +
    '<label><input type="checkbox" id="previewRetentionEnabled"> Enable automatic cleanup (checked hourly)</label> ' +
    '<label>Keep latest <input type="number" min="0" max="10000" id="previewKeepCount" style="width:70px"> times</label> ' +
    '<label>Delete if last observation is older than <input type="number" min="0" max="10000" id="previewKeepDays" style="width:70px"> days</label> ' +
    '<button type="button" id="previewSaveRetention">Preview and save policy</button>' +
    '<div>Zero disables a limit; either exceeded limit qualifies. Active and recharging missions are protected. Each run deletes at most 200 missions.</div>' +
    '<div id="previewRetentionStatus"></div></details>';
  previewRetentionValues(enhancement.initialRetention);
  previewElement('previewLoadHistory').addEventListener('click', previewLoadHistory);
  previewElement('previewBatchDelete').addEventListener('click', function () {
    var ids = Array.prototype.filter.call(area.querySelectorAll('input[data-history-id]'), function (input) { return input.checked; })
      .map(function (input) { return input.getAttribute('data-history-id'); });
    if (!ids.length) { previewMessage('Select missions to delete first.'); return; }
    previewCleanup({ ids: ids });
  });
  previewElement('previewSaveRetention').addEventListener('click', function () {
    previewCleanup({ policy: { enabled: previewElement('previewRetentionEnabled').checked,
      maxCount: Number(previewElement('previewKeepCount').value),
      maxDays: Number(previewElement('previewKeepDays').value) } });
  });
  previewLoadHistory();
}
function previewRetentionValues (data) {
  if (!data) return;
  previewElement('previewRetentionEnabled').checked = data.policy.enabled;
  previewElement('previewKeepCount').value = data.policy.maxCount;
  previewElement('previewKeepDays').value = data.policy.maxDays;
  previewText('previewRetentionStatus', 'Saved policy: automatic cleanup ' + (data.policy.enabled ? 'enabled' : 'disabled') +
    (data.lastRun ? ' · last cleanup ' + new Date(data.lastRun).toLocaleString() + ', deleted ' + data.lastDeleted + ' timesMission' : '') +
    (data.lastError ? ' · error: ' + data.lastError : ''));
}
function previewLoadHistory () {
  var target = previewElement('previewHistoryList');
  $.ajax({ url: '/api/local/history', dataType: 'json', cache: false, timeout: 10000 })
    .done(function (data) {
      target.textContent = '';
      data.missions.forEach(function (mission) {
        var label = document.createElement('label'); label.style.display = 'block';
        var input = document.createElement('input'); input.type = 'checkbox';
        input.setAttribute('data-history-id', mission.id);
        input.disabled = mission.id === data.currentId && !mission.completedAt;
        label.appendChild(input);
        label.appendChild(document.createTextNode(' Mission ' + (mission.nMssn == null ? '?' : mission.nMssn) + ' · ' +
          new Date(mission.createdAt).toLocaleString() + ' · ' + mission.count + ' points' + (input.disabled ? ' (protected)' : '')));
        target.appendChild(label);
      });
    }).fail(function (xhr) { previewMessage(previewError(xhr)); });
  $.ajax({ url: '/api/local/history/enhancements/retention', dataType: 'json', cache: false, timeout: 10000 })
    .done(previewRetentionValues).fail(function (xhr) { previewMessage(previewError(xhr)); });
}
function previewCleanup (body) {
  if (deleting) return;
  deleting = true; updateDeleteButton();
  previewElement('historyMission').disabled = true;
  listGeneration++; if (listRequest) listRequest.abort(); restartLoop();
  function finish () {
    deleting = false; previewElement('historyMission').disabled = false;
    updateDeleteButton(); refreshMissionList(); restartLoop(); previewLoadHistory();
  }
  previewJSON('retention/plan', body).done(function (plan) {
    var lines = plan.targets.map(function (item) { return 'Mission ' + item.nMssn + ' · ' + new Date(item.createdAt).toLocaleString(); });
    var message = 'Permanently delete these ' + plan.targets.length + ' mission maps:\n' +
      (lines.length ? lines.slice(0, 20).join('\n') + (lines.length > 20 ? '\n... and ' + (lines.length - 20) + ' times' : '') : 'None') +
      (plan.policy ? '\n\nAlso save policy: automatic cleanup ' + (plan.policy.enabled ? 'enabled; future cleanup will also run automatically.' : 'disabled.') +
        '\nKeep latest ' + plan.policy.maxCount + ' missions; age limit ' + plan.policy.maxDays + ' days (0 disables a limit).' : '') + '\n\nContinue?';
    if (!window.confirm(message)) { finish(); return; }
    previewJSON('retention/apply', { token: plan.token }).done(function (result) {
      var errors = result.failed || [];
      previewForgetMissions(result.deleted);
      if (result.deleted.indexOf(missionId) !== -1) resetDisplayedMission();
      previewMessage('Deleted ' + result.deleted.length + ' missions. ' + (errors.length ? 'Partial failure: ' + errors[0].error
        : (plan.policy ? 'Policy saved.' : '')));
    }).fail(function (xhr) { previewMessage('Operation failed; refresh the list to verify the result: ' + previewError(xhr)); }).always(finish);
  }).fail(function (xhr) { previewMessage('Preview failed: ' + previewError(xhr)); finish(); });
}

/* global RoombaTrajectory */
var mapExtras = { missions: [],
  currentId: null,
  noteId: null,
  revision: null,
  dirty: false,
  noteSaving: false,
  editVersion: 0,
  noteEpoch: 0,
  drafts: {},
  noteLoadError: false,
  compare: null,
  compareRequest: null,
  compareGeneration: 0 };
function previewMissionLabel (mission) {
  var title = mission.annotation && mission.annotation.title;
  return (title ? title + ' · ' : '') + 'Mission ' + (mission.nMssn == null ? '?' : mission.nMssn) + ' · ' +
    new Date(mission.createdAt).toLocaleString() + ' · ' + mission.count + ' points';
}
function previewMissionList (missions, select, currentId) {
  mapExtras.missions = missions;
  if (currentId !== undefined) mapExtras.currentId = currentId;
  while (select.options.length > 1) select.remove(1);
  var query = previewHas('library') && previewElement('extraSearch') ? previewElement('extraSearch').value.trim().toLowerCase() : '';
  var status = previewElement('extraFilterStatus') ? previewElement('extraFilterStatus').value : '';
  var from = previewElement('extraFrom') && previewElement('extraFrom').value;
  var to = previewElement('extraTo') && previewElement('extraTo').value;
  var fromTime = from ? new Date(from + 'T00:00:00').getTime() : NaN;
  var toTime = to ? new Date(to + 'T00:00:00').getTime() : NaN;
  if (Number.isFinite(toTime)) { var end = new Date(toTime); end.setDate(end.getDate() + 1); toTime = end.getTime(); }
  var matches = 0;
  missions.forEach(function (mission) {
    var note = mission.annotation || {};
    var haystack = [mission.id, mission.nMssn, note.title || '', note.note || '', new Date(mission.createdAt).toLocaleString()].join(' ').toLowerCase();
    var active = mission.id === mapExtras.currentId && !mission.completedAt;
    var created = Date.parse(mission.createdAt);
    var included = (!query || haystack.indexOf(query) !== -1) && (!status || (status === 'active' ? active : !active)) &&
      (!Number.isFinite(fromTime) || created >= fromTime) && (!Number.isFinite(toTime) || created < toTime);
    if (included) matches++;
    // Keep a manually selected task visible, even if it falls outside the new filter.
    if (!included && mission.id !== selectedMission) return;
    var option = document.createElement('option'); option.value = mission.id;
    option.textContent = previewMissionLabel(mission) + (included ? '' : ' (selected; outside current filter)');
    select.appendChild(option);
  });
  select.value = selectedMission;
  previewText('extraFilterCount', 'Matched ' + matches + ' / ' + missions.length + ' missions. The latest mission entry remains available.');
  previewCompareOptions();
}
function previewExtrasInit () {
  var area = previewElement('previewExtras');
  var html = '';
  if (previewHas('library')) {
    html += '<details open><summary>Mission titles, notes and search</summary>' +
    '<label>Search <input id="extraSearch" type="search" placeholder="Title, notes or mission number"></label> ' +
    '<select id="extraFilterStatus" aria-label="Filter by mission status"><option value="">All statuses</option><option value="active">Active</option><option value="ended">Ended</option></select> ' +
    '<label>From <input id="extraFrom" type="date"></label> <label>To <input id="extraTo" type="date"></label> ' +
    '<button id="extraResetFilter" type="button">Clear filters</button><div id="extraFilterCount"></div>' +
    '<label style="display:block">Selected mission title <input id="extraTitle" maxlength="120" style="width:320px;max-width:100%"></label>' +
    '<label style="display:block">Notes <textarea id="extraNote" maxlength="4000" rows="2" style="width:520px;max-width:100%"></textarea></label>' +
    '<button id="extraSaveNote" type="button" disabled>Save mission notes</button> ' +
    '<button id="extraReloadNote" type="button" disabled>Reload notes</button> <span id="extraNoteStatus"></span></details>';
  }
  if (previewHas('export')) {
    html += '<div>Export the complete selected trajectory: ' +
    '<a id="extraJSON" target="_blank" rel="noopener">JSON (includes notes)</a> · ' +
    '<a id="extraCSV" target="_blank" rel="noopener">CSV (coordinates)</a>; unaffected by playback position or clearing the display.</div>';
  }
  if (previewHas('compare')) {
    html += '<div><label>Comparison overlay <select id="extraCompare"><option value="">No overlay</option></select></label> ' +
    '<button id="extraReloadCompare" type="button">Refresh comparison</button> <span id="extraCompareStatus"></span>' +
    '<div>Black: selected mission. Dashed orange: comparison snapshot. Overlays use original coordinates; differing origins may cause offsets.</div></div>';
  }
  if (previewHas('metrics')) {
    html += '<div id="extraMetrics"></div>' +
    '<div>Length is measured along continuous recorded segments in uncalibrated coordinates. Long intervals can mean a stationary or paused robot rather than a disconnection. These statistics do not measure cleaning coverage.</div>';
  }
  area.innerHTML = html;
  if (previewHas('library')) {
    window.addEventListener('beforeunload', function (event) {
      if (mapExtras.dirty || Object.keys(mapExtras.drafts).length) { event.preventDefault(); event.returnValue = ''; }
    });
    ['extraSearch', 'extraFrom', 'extraTo', 'extraFilterStatus'].forEach(function (id) {
      previewElement(id).addEventListener(id === 'extraSearch' ? 'input' : 'change', function () {
        previewMissionList(mapExtras.missions, previewElement('historyMission'));
      });
    });
    previewElement('extraResetFilter').addEventListener('click', function () {
      ['extraSearch', 'extraFrom', 'extraTo', 'extraFilterStatus'].forEach(function (id) { previewElement(id).value = ''; });
      previewMissionList(mapExtras.missions, previewElement('historyMission'));
    });
    ['extraTitle', 'extraNote'].forEach(function (id) {
      previewElement(id).addEventListener('input', function () {
        mapExtras.dirty = true; mapExtras.editVersion++;
        previewText('extraNoteStatus', 'Unsaved edits. Save before leaving this mission.');
      });
    });
    previewElement('extraSaveNote').addEventListener('click', previewSaveNote);
    previewElement('extraReloadNote').addEventListener('click', function () {
      if (!missionId) return;
      if (mapExtras.dirty && !window.confirm('Reloading discards unsaved notes on this page. Continue?')) return;
      var id = missionId;
      var version = mapExtras.editVersion;
      $.ajax({ url: '/api/local/history/enhancements/notes/' + encodeURIComponent(id), dataType: 'json', cache: false, timeout: 10000 })
        .done(function (note) {
          if (missionId !== id || version !== mapExtras.editVersion) return;
          mapExtras.noteEpoch++; delete mapExtras.drafts[id];
          mapExtras.dirty = false; previewFillNote(id, note);
        }).fail(function (xhr) { if (missionId === id) previewText('extraNoteStatus', previewError(xhr)); });
    });
  }
  if (previewHas('export')) {
    ['extraJSON', 'extraCSV'].forEach(function (id) {
      previewElement(id).addEventListener('click', function (event) { if (!missionId) event.preventDefault(); });
    });
  }
  if (previewHas('compare')) {
    previewElement('extraCompare').addEventListener('change', previewLoadComparison);
    previewElement('extraReloadCompare').addEventListener('click', previewLoadComparison);
  }
  previewMissionList(mapExtras.missions, previewElement('historyMission'));
  previewUpdateExports();
}
function previewFillNote (id, note) {
  if (!previewElement('extraTitle')) return;
  note = note || { title: '', note: '', revision: null };
  var draft = id && mapExtras.drafts[id];
  if (draft) { note = draft; mapExtras.dirty = true; }
  mapExtras.noteId = id; mapExtras.revision = note.revision; mapExtras.noteLoadError = Boolean(note.error);
  previewElement('extraTitle').value = note.title || ''; previewElement('extraNote').value = note.note || '';
  previewElement('extraSaveNote').disabled = !id || mapExtras.noteSaving || mapExtras.noteLoadError;
  previewElement('extraReloadNote').disabled = !id || mapExtras.noteSaving;
  previewText('extraNoteStatus', note.error || (draft ? 'Restored this page\'s unsaved draft. Save it before reloading.'
    : (id ? 'Notes are stored on the server when you save.' : 'Waiting for a mission.')));
}
function previewSaveNote () {
  if (!missionId || mapExtras.noteId !== missionId || mapExtras.noteSaving || mapExtras.noteLoadError) return;
  var id = missionId;
  var version = mapExtras.editVersion;
  mapExtras.noteSaving = true; previewElement('extraSaveNote').disabled = true;
  var body = { title: previewElement('extraTitle').value, note: previewElement('extraNote').value, revision: mapExtras.revision };
  previewJSON('notes/' + encodeURIComponent(id), body).done(function (note) {
    mapExtras.noteEpoch++;
    if (mapExtras.drafts[id]) {
      if (mapExtras.drafts[id].editVersion === version) delete mapExtras.drafts[id];
      else mapExtras.drafts[id].revision = note.revision;
    }
    mapExtras.missions.forEach(function (mission) { if (mission.id === id) mission.annotation = note; });
    if (missionId !== id) return;
    mapExtras.revision = note.revision;
    if (version === mapExtras.editVersion) { delete mapExtras.drafts[id]; mapExtras.dirty = false; previewFillNote(id, note); }
    previewText('extraNoteStatus', version === mapExtras.editVersion ? 'Mission notes saved on the server.' : 'Previous edits saved; newer edits remain unsaved.');
    previewMissionList(mapExtras.missions, previewElement('historyMission'));
    listAt = 0;
  }).fail(function (xhr) {
    if (missionId === id) previewText('extraNoteStatus', 'Save failed: ' + previewError(xhr));
  }).always(function () {
    mapExtras.noteSaving = false;
    if (previewElement('extraSaveNote')) previewElement('extraSaveNote').disabled = !missionId || mapExtras.noteLoadError;
    if (previewElement('extraReloadNote')) previewElement('extraReloadNote').disabled = !missionId;
  });
}
function previewUpdateExports () {
  if (!previewHas('export')) return;
  ['json', 'csv'].forEach(function (format) {
    var link = previewElement(format === 'json' ? 'extraJSON' : 'extraCSV'); if (!link) return;
    link.setAttribute('aria-disabled', missionId ? 'false' : 'true');
    link.style.opacity = missionId ? '1' : '0.4';
    if (missionId) {
      link.href = '/api/local/history/enhancements/export?mission=' + encodeURIComponent(missionId) + '&format=' + format;
      link.download = missionId + '.' + format;
    } else link.removeAttribute('href');
  });
}
function previewExtrasReset () {
  if (mapExtras.dirty && mapExtras.noteId && previewElement('extraTitle')) {
    mapExtras.drafts[mapExtras.noteId] = { title: previewElement('extraTitle').value,
      note: previewElement('extraNote').value,
      revision: mapExtras.revision,
      editVersion: mapExtras.editVersion };
  }
  mapExtras.noteId = null; mapExtras.revision = null; mapExtras.dirty = false; mapExtras.editVersion++;
  mapExtras.metricsKey = null;
  previewFillNote(null, null); previewText('extraMetrics', '');
  previewClearComparison(); previewUpdateExports();
}
function previewExtrasUpdate (data, annotationEpoch) {
  if (previewHas('library') && (annotationEpoch === undefined || annotationEpoch === mapExtras.noteEpoch) &&
      (mapExtras.noteId !== data.id || (!mapExtras.dirty && !mapExtras.noteSaving))) {
    previewFillNote(data.id, data.annotation);
  }
  previewUpdateExports();
  if (previewHas('metrics')) {
    var last = points[points.length - 1];
    var key = data.id + ':' + points.length + ':' + (last && last.t);
    if (mapExtras.metricsKey !== key) {
      mapExtras.metricsKey = key;
      var stats = RoombaTrajectory.analyze(points);
      previewText('extraMetrics', 'Complete selected trajectory: ' + stats.points + ' points / ' + stats.segments + ' segments; approximate length ' +
        stats.lengthCoordinateUnits.toFixed(1) + ' coordinate units; long intervals (>30 seconds): ' + stats.longIntervals +
        ' times / ' + Math.round(stats.longIntervalSeconds) + ' seconds' + (stats.clockReversals ? '; clock reversals: ' + stats.clockReversals + ' times' : ''));
    }
  }
  if (mapExtras.compare && mapExtras.compare.id === data.id) previewClearComparison();
}
function previewCompareOptions () {
  var select = previewElement('extraCompare'); if (!select) return;
  var value = select.value;
  while (select.options.length > 1) select.remove(1);
  mapExtras.missions.forEach(function (mission) {
    var option = document.createElement('option'); option.value = mission.id;
    option.textContent = previewMissionLabel(mission); select.appendChild(option);
  });
  if (value && !mapExtras.missions.some(function (mission) { return mission.id === value; })) previewClearComparison();
  else select.value = value;
}
function previewClearComparison () {
  mapExtras.compareGeneration++; mapExtras.compare = null;
  var pending = mapExtras.compareRequest; mapExtras.compareRequest = null;
  if (pending) pending.abort();
  if (previewElement('extraCompare')) previewElement('extraCompare').value = '';
  previewText('extraCompareStatus', '');
}
function previewLoadComparison () {
  var select = previewElement('extraCompare'); if (!select) return;
  var id = select.value;
  previewClearComparison(); select.value = id;
  if (!id) { renderMap(); return; }
  if (!missionId || id === missionId) {
    previewMessage('Wait for the selected mission to load, then choose a different comparison mission.'); select.value = ''; renderMap(); return;
  }
  var token = mapExtras.compareGeneration;
  var primary = missionId;
  previewText('extraCompareStatus', 'Loading comparison...');
  var pending = $.ajax({ url: '/api/local/history/points', dataType: 'json', cache: false, timeout: 10000, data: { mission: id, after: 0 } });
  mapExtras.compareRequest = pending;
  pending.done(function (data) {
    if (token !== mapExtras.compareGeneration || missionId !== primary || deleting) return;
    if (data.id !== id || !Array.isArray(data.points)) { previewText('extraCompareStatus', 'The returned mission does not match. Retry.'); return; }
    mapExtras.compare = { id: id, points: data.points.filter(validPosition) };
    previewText('extraCompareStatus', 'Dashed orange: ' + id + ' · ' + data.points.length + ' points (snapshot; refresh to update)');
    renderMap();
  }).fail(function (xhr, state) {
    if (token !== mapExtras.compareGeneration || state === 'abort') return;
    previewText('extraCompareStatus', 'Comparison failed: ' + previewError(xhr)); renderMap();
  }).always(function () { if (mapExtras.compareRequest === pending) mapExtras.compareRequest = null; });
}
function previewComparisonPoints () { return mapExtras.compare ? mapExtras.compare.points : []; }
function previewNoteRequestEpoch () { return mapExtras.noteEpoch; }
function previewForgetMissions (ids) {
  ids.forEach(function (id) { delete mapExtras.drafts[id]; });
  if (ids.indexOf(mapExtras.noteId) !== -1) mapExtras.dirty = false;
}
function previewDrawComparison (context, screen) {
  var reference = previewComparisonPoints(); if (!reference.length) return;
  context.beginPath(); context.strokeStyle = '#db6b00'; context.lineWidth = 2;
  context.setLineDash([6, 4]);
  reference.forEach(function (point, index) {
    var position = screen(point);
    if (!index || point.break) context.moveTo(position.x, position.y); else context.lineTo(position.x, position.y);
  });
  context.stroke(); context.setLineDash([]);
}
function previewMapLayout () {
  if (previewDashboardMapLayout()) return;
  var container = pathLayer && pathLayer.parentNode;
  if (container && container.style) {
    container.style.cssText = 'position:relative;width:100%;max-width:100%;overflow:auto;height:' + (pathLayer.height + 22) + 'px';
  }
}

function previewDashboardInit () {}
function previewLayoutConnection () {}
function previewLayoutState () {}
function previewLayoutPosition () {}
function previewLayoutData () {}
function previewDashboardMapLayout () { return false; }
