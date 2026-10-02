/**
 * Mock Socket.IO Client for Browser / Vercel Standalone Demo
 * Dispatches events in-memory via window events so UI updates reactively
 */

class MockSocket {
  constructor() {
    this.handlers = new Map();
    this.listener = (e) => {
      const { event, data } = e.detail;
      const callbacks = this.handlers.get(event) || [];
      callbacks.forEach(cb => cb(data));
    };
    window.addEventListener('mock-socket-event', this.listener);
  }

  on(event, callback) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(callback);
    return this;
  }

  off(event, callback) {
    if (!this.handlers.has(event)) return this;
    if (!callback) {
      this.handlers.delete(event);
    } else {
      const list = this.handlers.get(event);
      this.handlers.set(event, list.filter(cb => cb !== callback));
    }
    return this;
  }

  emit(event, data) {
    window.dispatchEvent(new CustomEvent('mock-socket-event', {
      detail: { event, data }
    }));
  }

  disconnect() {
    window.removeEventListener('mock-socket-event', this.listener);
    this.handlers.clear();
  }
}

export function io() {
  return new MockSocket();
}

export function broadcastSocketEvent(event, data) {
  window.dispatchEvent(new CustomEvent('mock-socket-event', {
    detail: { event, data }
  }));
}

export default io;
