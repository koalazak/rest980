/* Timestamp-based trajectory playback; it never changes the stored points. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoombaReplay = factory();
}(typeof window === 'object' ? window : this, function () {
  'use strict';
  function Replay () {
    this.id = null;
    this.points = [];
    this.times = [];
    this.live = true;
    this.playing = false;
    this.speed = 5;
    this.position = 0;
    this.lastTick = null;
  }
  Replay.prototype.setPoints = function (id, points) {
    if (id !== this.id) { this.id = id; this.goLive(); }
    this.points = points;
    var previous = 0;
    this.times = points.map(function (point) {
      var time = Date.parse(point.t);
      // A backwards clock correction must not reverse playback.
      previous = Number.isFinite(time) ? Math.max(previous, time) : previous;
      return previous;
    });
    if (!this.live) this.position = Math.max(this.first(), Math.min(this.end(), this.position));
  };
  Replay.prototype.first = function () { return this.times[0] || 0; };
  Replay.prototype.end = function () { return this.times[this.times.length - 1] || 0; };
  Replay.prototype.goLive = function () { this.live = true; this.playing = false; this.lastTick = null; };
  Replay.prototype.seek = function (fraction) {
    if (!Number.isFinite(fraction)) return;
    this.live = false;
    this.position = this.first() + Math.max(0, Math.min(1, fraction)) * (this.end() - this.first());
    this.lastTick = null;
  };
  Replay.prototype.play = function () {
    if (!this.points.length) return;
    if (this.live || this.position >= this.end()) this.seek(0);
    this.playing = true;
    this.lastTick = null;
  };
  Replay.prototype.pause = function () { this.playing = false; this.lastTick = null; };
  Replay.prototype.tick = function (now) {
    if (!this.playing) return false;
    var before = this.frame().count;
    if (this.lastTick !== null) {
      this.position = Math.min(this.end(),
        this.position + Math.max(0, now - this.lastTick) * this.speed);
    }
    this.lastTick = now;
    if (this.position >= this.end()) this.pause();
    return this.frame().count !== before;
  };
  Replay.prototype.frame = function () {
    var count = this.points.length;
    if (!this.live) {
      var low = 0;
      var high = this.times.length;
      while (low < high) {
        var middle = Math.floor((low + high) / 2);
        if (this.times[middle] <= this.position) low = middle + 1;
        else high = middle;
      }
      count = low;
    }
    return { count: count,
      points: this.points.slice(0, count),
      current: this.points[count - 1] || null,
      bounds: this.points,
      fraction: this.live ? 1 : (this.end() === this.first() ? 0
        : (this.position - this.first()) / (this.end() - this.first())),
      time: this.live ? this.end() : this.position };
  };
  return Replay;
}));
