/* ============================================================
   SSE Client — Real-time status streaming
   ============================================================ */
class StatusStream {
  constructor(options = {}) {
    this.basePath = options.basePath || '/pedidos';
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.listeners = {};
    this._eventSource = null;
    this._reconnectTimer = null;
    this._currentDelay = this.reconnectDelay;
    this._intentionalClose = false;
  }
  connect(pedidoId) {
    this._intentionalClose = false;
    this.disconnect();
    try {
      const token = auth.getToken();
      const path = this.basePath+'/'+pedidoId+'/stream';
      const url = API_BASE+path+'?token='+encodeURIComponent(token||'');
      this._eventSource = new EventSource(url);
      this._eventSource.onopen = () => { this._currentDelay = this.reconnectDelay; this._emit('connected',{pedidoId}); };
      this._eventSource.onmessage = (event) => { try { const d=JSON.parse(event.data); this._emit('message',d); if (d.type) this._emit(d.type,d); if (d.status) this._emit('status:'+d.status,d); } catch { this._emit('message',event.data); } };
      this._eventSource.onerror = (err) => { this._emit('error',err); if (this._eventSource.readyState===EventSource.CLOSED) this._scheduleReconnect(pedidoId); };
    } catch (err) { this._emit('error',err); this._scheduleReconnect(pedidoId); }
  }
  disconnect() { this._intentionalClose = true; this._clearReconnect(); if (this._eventSource) { this._eventSource.close(); this._eventSource = null; } }
  on(event, callback) { if (!this.listeners[event]) this.listeners[event]=[]; this.listeners[event].push(callback); return this; }
  off(event, callback) { if (!this.listeners[event]) return; this.listeners[event] = callback ? this.listeners[event].filter(cb=>cb!==callback) : []; return this; }
  _emit(event, data) { (this.listeners[event]||[]).forEach(cb=>{ try { cb(data); } catch(err) { console.error(err); } }); }
  _scheduleReconnect(pedidoId) {
    if (this._intentionalClose) return;
    this._clearReconnect();
    this._reconnectTimer = setTimeout(()=>{ this.connect(pedidoId); }, Math.min(this._currentDelay,this.maxReconnectDelay));
    this._currentDelay = Math.min(this._currentDelay*1.5, this.maxReconnectDelay);
  }
  _clearReconnect() { if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; } }
  get connected() { return this._eventSource && this._eventSource.readyState === EventSource.OPEN; }
  get connecting() { return this._eventSource && this._eventSource.readyState === EventSource.CONNECTING; }
}
let defaultStream = null;
function getStatusStream() { if (!defaultStream) defaultStream = new StatusStream(); return defaultStream; }
function connectPedidoStream(pedidoId, handlers = {}) {
  const stream = getStatusStream();
  stream.off('message'); stream.off('error');
  if (handlers.onMessage) stream.on('message', handlers.onMessage);
  if (handlers.onStatus) stream.on('status', handlers.onStatus);
  if (handlers.onError) stream.on('error', handlers.onError);
  stream.connect(pedidoId);
  return stream;
}
