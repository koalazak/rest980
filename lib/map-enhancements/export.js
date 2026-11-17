'use strict';
const { validId } = require('./library.js');
const { analyze } = require('../../public/js/map-trajectory');
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' ? value : '';
function snapshot (record, annotation, calibration) {
  const meta = record.meta;
  const points = record.points.map(point => ({ seq: finite(point.seq),
    t: text(point.t),
    x: finite(point.x),
    y: finite(point.y),
    theta: finite(point.theta),
    phase: text(point.phase),
    cycle: text(point.cycle),
    break: Boolean(point.break) }));
  // Only documented history fields are exported. Never serialize arbitrary robot state/config.
  const data = { version: 1,
    mission: { id: meta.id,
      nMssn: finite(meta.nMssn),
      createdAt: text(meta.createdAt),
      updatedAt: text(meta.updatedAt),
      endedAt: text(meta.completedAt) || null,
      title: annotation ? text(annotation.title) : '',
      note: annotation ? text(annotation.note) : '' },
    units: 'robot coordinates; not calibrated to meters',
    statistics: analyze(points),
    points };
  if (calibration) {
    data.version = 2; data.calibration = calibration;
    const coordinates = require('../../public/js/map-coordinates');
    data.mapPoints = points.map(point => coordinates.apply(point, calibration));
    data.coordinateFrames = { points: 'original robot frame', mapPoints: 'saved map calibration; same units, not meters' };
  }
  return data;
}
function csvValue (value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let content = String(value);
  // Text cells must not become spreadsheet formulas. Negative numeric coordinates stay numeric.
  if (/^\s*[=+\-@]/.test(content) || /^[\t\r\n]/.test(content)) content = "'" + content;
  return '"' + content.replace(/"/g, '""') + '"';
}
function csv (data) {
  const keys = ['seq', 't', 'x', 'y', 'theta', 'phase', 'cycle', 'break'];
  const mapped = Array.isArray(data.mapPoints);
  const extra = mapped ? ',map_x,map_y,map_theta' : '';
  return '\ufeff' + ['missionId,' + keys.join(',') + extra, ...data.points.map((point, index) =>
    [data.mission.id, ...keys.map(key => point[key]), ...(mapped ? [data.mapPoints[index].x, data.mapPoints[index].y, data.mapPoints[index].theta] : [])]
      .map(csvValue).join(','))].join('\r\n') + '\r\n';
}
function install (router, store, notes, calibrations) {
  router.get('/local/history/enhancements/export', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const id = req.query.mission;
      const format = req.query.format || 'json';
      if (!validId(id) || !['json', 'csv'].includes(format)) {
        throw Object.assign(new Error('Use an explicit mission ID and json or csv format'), { status: 400 });
      }
      const annotation = notes ? notes.get(id) : null;
      const data = snapshot(store.findMission(id), annotation, calibrations ? calibrations.get(id) : null);
      res.set('Content-Disposition', 'attachment; filename="' + id + '.' + format + '"');
      res.type(format === 'json' ? 'application/json' : 'text/csv');
      res.send(format === 'json' ? JSON.stringify(data, null, 2) + '\n' : csv(data));
    } catch (error) { res.status(error.status || 503).json({ error: error.message }); }
  });
}
module.exports = { snapshot, csv, csvValue, install };
