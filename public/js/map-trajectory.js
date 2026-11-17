/* Shared, read-only trajectory analysis. Coordinates retain the robot's units. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoombaTrajectory = factory();
}(typeof window === 'object' ? window : this, function () {
  'use strict';
  function valid (point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.theta);
  }
  function analyze (points) {
    var result = { points: 0,
      segments: 0,
      lengthCoordinateUnits: 0,
      longIntervals: 0,
      longIntervalSeconds: 0,
      clockReversals: 0,
      invalidPoints: 0,
      bounds: null };
    var previous = null;
    points.forEach(function (point) {
      if (!valid(point)) { result.invalidPoints++; previous = null; return; }
      result.points++;
      if (!result.bounds) result.bounds = { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
      var bounds = result.bounds;
      bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
      var delta = previous ? Date.parse(point.t) - Date.parse(previous.t) : NaN;
      var reversed = Number.isFinite(delta) && delta < 0;
      var long = Number.isFinite(delta) && delta > 30000;
      if (reversed) result.clockReversals++;
      if (long) { result.longIntervals++; result.longIntervalSeconds += delta / 1000; }
      // Missing timestamps cannot establish continuity for a distance estimate.
      var interrupted = !previous || point.break || long || reversed || !Number.isFinite(delta);
      if (interrupted) result.segments++;
      else result.lengthCoordinateUnits += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    });
    return result;
  }
  return { analyze: analyze, valid: valid };
}));
