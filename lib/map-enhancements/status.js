'use strict';
function attach (store) {
  const state = { transport: 'unknown', lastWriteAt: null, lastCoordinateAt: null };
  const atomic = store.atomicJSON;
  store.atomicJSON = function (...args) {
    const result = atomic.apply(this, args);
    state.lastWriteAt = new Date(this.now()).toISOString();
    return result;
  };
  const record = store.recordPosition;
  store.recordPosition = function (...args) {
    const before = this.current.points.length;
    const result = record.apply(this, args);
    if (this.current.points.length > before) {
      state.lastCoordinateAt = this.current.points[this.current.points.length - 1].t;
      state.lastWriteAt = new Date(this.now()).toISOString();
    }
    return result;
  };
  const ingest = store.ingest;
  store.ingest = function (...args) {
    // The state event itself proves a connection even if connect happened before attach.
    state.transport = 'connected';
    return ingest.apply(this, args);
  };
  function snapshot () {
    return { transport: state.transport,
      lastSeen: store.lastSeen,
      lastCoordinateAt: state.lastCoordinateAt,
      lastWriteAt: state.lastWriteAt,
      recordingError: store.error,
      now: new Date(store.now()).toISOString() };
  }
  const get = store.get;
  store.get = function (...args) { return Object.assign(get.apply(this, args), { recorderStatus: snapshot() }); };
  return {
    snapshot,
    attach (client) {
      const connected = () => { state.transport = 'connected'; };
      const disconnected = () => { state.transport = 'disconnected'; };
      client.on('connect', connected); client.on('close', disconnected); client.on('error', disconnected);
      return () => { client.removeListener('connect', connected); client.removeListener('close', disconnected); client.removeListener('error', disconnected); };
    }
  };
}
module.exports = { attach };
