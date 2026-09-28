'use strict';

/* ============================================================
   BRAINRUSH — Socket.io Client Wrapper
   ============================================================ */

const Socket = (() => {
  let socket = null;
  const listeners = { state: [], connect: [], disconnect: [] };

  function emit(type, ...args) {
    (listeners[type] || []).forEach(fn => {
      try { fn(...args); } catch (e) { console.error(e); }
    });
  }

  function init() {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000
    });
    socket.on('connect', () => emit('connect'));
    socket.on('disconnect', () => emit('disconnect'));
    socket.on('state', (s) => emit('state', s));
    return socket;
  }

  return {
    init,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    raw() { return socket; },
    emit(event, payload, ack) {
      if (!socket) return;
      if (ack) socket.emit(event, payload || {}, ack);
      else socket.emit(event, payload || {});
    }
  };
})();