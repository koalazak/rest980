/* Rigid display transforms only. Original robot samples are never changed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoombaCoordinates = factory();
}(typeof window === 'object' ? window : this, function () {
  'use strict';
  var defaults = { originX: 0, originY: 0, offsetX: 0, offsetY: 0, rotation: 0 };
  function angle (value) { return ((value + 180) % 360 + 360) % 360 - 180; }
  function apply (point, calibration) {
    if (!point) return null;
    var c = calibration || defaults;
    var radians = c.rotation * Math.PI / 180;
    var x = point.x - c.originX;
    var y = point.y - c.originY;
    return Object.assign({}, point, {
      x: x * Math.cos(radians) - y * Math.sin(radians) + c.offsetX,
      y: x * Math.sin(radians) + y * Math.cos(radians) + c.offsetY,
      // The existing canvas swaps/negates axes; its heading convention is clockwise.
      theta: angle(point.theta - c.rotation)
    });
  }
  return { defaults: defaults, apply: apply, angle: angle };
}));
