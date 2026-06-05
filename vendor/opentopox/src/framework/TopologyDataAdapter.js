import {
  REALTIME_TOPOLOGY_MESSAGE_TYPES,
  normalizeRealtimeTopologyMessage,
  shouldAcceptRealtimeTopologyMessage,
} from "./RealtimeTopologyProtocol.js";

export const TOPOLOGY_DATA_TRANSPORTS = Object.freeze({
  MANUAL: "manual",
  WEBSOCKET: "websocket",
  SSE: "sse",
  POLLING: "polling",
});

export const TOPOLOGY_DATA_ADAPTER_STATUS = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  STALE: "stale",
  OFFLINE: "offline",
});

export const TOPOLOGY_DATA_ADAPTER_EVENTS = Object.freeze({
  STATUS: "status",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  STALE: "stale",
  OFFLINE: "offline",
  MESSAGE: "message",
  SNAPSHOT: "snapshot",
  PATCH: "patch",
  DROPPED: "dropped",
  ERROR: "error",
});

export class TopologyDataAdapter {
  constructor({
    transport = TOPOLOGY_DATA_TRANSPORTS.MANUAL,
    url = "",
    protocols,
    eventSourceInit,
    fetcher,
    fetchImpl,
    requestInit,
    webSocketFactory = createDefaultWebSocket,
    eventSourceFactory = createDefaultEventSource,
    normalizeMessage = normalizeRealtimeTopologyMessage,
    validateOptions = {},
    autoReconnect = true,
    reconnectDelayMs = 800,
    reconnectMaxDelayMs = 15000,
    maxReconnectAttempts = Infinity,
    pollIntervalMs = 5000,
    staleTimeoutMs = 30000,
    autoConnect = false,
  } = {}) {
    this.transport = transport;
    this.url = url;
    this.protocols = protocols;
    this.eventSourceInit = eventSourceInit;
    this.fetcher = fetcher;
    this.fetchImpl = fetchImpl || globalThis.fetch?.bind(globalThis);
    this.requestInit = requestInit;
    this.webSocketFactory = webSocketFactory;
    this.eventSourceFactory = eventSourceFactory;
    this.normalizeMessage = normalizeMessage;
    this.validateOptions = validateOptions;
    this.autoReconnect = autoReconnect;
    this.reconnectDelayMs = reconnectDelayMs;
    this.reconnectMaxDelayMs = reconnectMaxDelayMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.pollIntervalMs = pollIntervalMs;
    this.staleTimeoutMs = staleTimeoutMs;
    this.listeners = new Set();
    this.filteredListeners = new Map();
    this.status = TOPOLOGY_DATA_ADAPTER_STATUS.IDLE;
    this.cursor = null;
    this.transportInstance = null;
    this.pollTimer = null;
    this.staleTimer = null;
    this.reconnectTimer = null;
    this.abortController = null;
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.lastMessageAt = null;
    this.lastError = null;
    this.messageCount = 0;
    this.droppedMessages = 0;
    this.messageLag = null;
    this.messageWindow = [];

    if (autoConnect) {
      queueMicrotask(() => this.connect());
    }
  }

  async connect() {
    this.intentionalClose = false;
    this.clearReconnectTimer();

    if (this.transport === TOPOLOGY_DATA_TRANSPORTS.MANUAL) {
      this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.LIVE);
      this.resetStaleTimer();
      return this;
    }

    if (this.transport === TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET) {
      return this.connectWebSocket();
    }

    if (this.transport === TOPOLOGY_DATA_TRANSPORTS.SSE) {
      return this.connectEventSource();
    }

    if (this.transport === TOPOLOGY_DATA_TRANSPORTS.POLLING) {
      return this.connectPolling();
    }

    throw new Error(`Unsupported topology data transport: ${this.transport}`);
  }

  disconnect({ status = TOPOLOGY_DATA_ADAPTER_STATUS.OFFLINE } = {}) {
    this.intentionalClose = true;
    this.cleanupTransport();
    this.setStatus(status);
    return this;
  }

  reconnect() {
    this.cleanupTransport();
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.RECONNECTING);
    return this.connect();
  }

  subscribe(typeOrListener, maybeListener) {
    if (typeof typeOrListener === "function") {
      this.listeners.add(typeOrListener);
      return () => this.listeners.delete(typeOrListener);
    }

    const type = typeOrListener;
    const listener = maybeListener;
    if (!type || typeof listener !== "function") {
      throw new Error("subscribe requires a listener or an event type and listener");
    }
    if (!this.filteredListeners.has(type)) this.filteredListeners.set(type, new Set());
    this.filteredListeners.get(type).add(listener);
    return () => this.filteredListeners.get(type)?.delete(listener);
  }

  getStatus() {
    return {
      status: this.status,
      transport: this.transport,
      url: this.url,
      cursor: this.cursor ? { ...this.cursor } : null,
      connected: this.status === TOPOLOGY_DATA_ADAPTER_STATUS.LIVE,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
      messageCount: this.messageCount,
      droppedMessages: this.droppedMessages,
      messageLag: this.messageLag,
      messageRate: this.getMessageRate(),
    };
  }

  ingest(raw, context = {}) {
    return this.handleRawMessage(raw, { ...context, transport: this.transport });
  }

  connectWebSocket() {
    if (!this.url) throw new Error("WebSocket topology data adapter requires a url");
    this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.CONNECTING);

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = this.webSocketFactory(this.url, this.protocols);
      this.transportInstance = socket;

      addTransportListener(socket, "open", () => {
        settled = true;
        this.reconnectAttempts = 0;
        this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.LIVE);
        this.resetStaleTimer();
        resolve(this);
      });

      addTransportListener(socket, "message", (event) => {
        this.handleRawMessage(readEventData(event), { transport: this.transport });
      });

      addTransportListener(socket, "error", (event) => {
        const error = normalizeTransportError(event, "WebSocket error");
        this.handleError(error, { transport: this.transport });
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      addTransportListener(socket, "close", () => {
        this.transportInstance = null;
        if (this.intentionalClose) return;
        this.scheduleReconnect();
      });
    });
  }

  connectEventSource() {
    if (!this.url) throw new Error("SSE topology data adapter requires a url");
    this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.CONNECTING);

    return new Promise((resolve) => {
      let opened = false;
      const source = this.eventSourceFactory(this.url, this.eventSourceInit);
      this.transportInstance = source;

      addTransportListener(source, "open", () => {
        opened = true;
        this.reconnectAttempts = 0;
        this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.LIVE);
        this.resetStaleTimer();
        resolve(this);
      });

      addTransportListener(source, "message", (event) => {
        this.handleRawMessage(readEventData(event), { transport: this.transport });
      });

      addTransportListener(source, "error", (event) => {
        const error = normalizeTransportError(event, "EventSource error");
        this.handleError(error, { transport: this.transport });
        if (this.intentionalClose) return;
        if (source.readyState === 2) {
          this.transportInstance = null;
          this.scheduleReconnect();
        } else if (!opened) {
          this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.RECONNECTING);
        }
      });
    });
  }

  async connectPolling() {
    if (!this.fetcher && !this.url) throw new Error("Polling topology data adapter requires a url or fetcher");
    if (!this.fetcher && typeof this.fetchImpl !== "function") throw new Error("Polling topology data adapter requires fetch");

    this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.CONNECTING);
    const ok = await this.pollOnce();
    if (ok !== false) this.schedulePoll();
    return this;
  }

  async pollOnce() {
    if (this.intentionalClose) return null;
    this.clearPollTimer();

    try {
      const result = await this.readPollResult();
      for (const item of normalizeMessageBatch(result)) {
        this.handleRawMessage(item, { transport: this.transport });
      }
      this.reconnectAttempts = 0;
      if (this.status !== TOPOLOGY_DATA_ADAPTER_STATUS.LIVE) {
        this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.LIVE);
      }
      return true;
    } catch (error) {
      this.handleError(error, { transport: this.transport });
      if (this.autoReconnect) this.scheduleReconnect();
      else this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.OFFLINE);
      return false;
    }
  }

  async readPollResult() {
    if (this.fetcher) {
      return this.fetcher({
        adapter: this,
        cursor: this.cursor ? { ...this.cursor } : null,
        status: this.getStatus(),
      });
    }

    this.abortController = typeof AbortController === "undefined" ? null : new AbortController();
    const response = await this.fetchImpl(this.url, {
      ...this.requestInit,
      signal: this.abortController?.signal,
    });
    if (!response?.ok && typeof response?.ok === "boolean") {
      throw new Error(`Polling request failed with status ${response.status}`);
    }
    if (typeof response?.json === "function") return response.json();
    if (typeof response?.text === "function") return response.text();
    return response;
  }

  handleRawMessage(raw, context = {}) {
    const input = normalizeRawMessage(raw);
    const normalized = this.normalizeMessage(input);
    const decision = shouldAcceptRealtimeTopologyMessage(normalized, this.cursor, this.validateOptions);

    if (!decision.accept) {
      this.droppedMessages += 1;
      const event = this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.DROPPED, {
        reason: decision.reason,
        validation: decision.validation,
        message: decision.validation?.message || normalized,
        cursor: decision.cursor,
        context,
      });
      if (decision.reason === "invalid") {
        this.handleError(new Error(decision.validation.errors.join("; ")), {
          ...context,
          message: normalized,
          validation: decision.validation,
        });
      }
      return event;
    }

    const message = decision.validation.message;
    this.cursor = decision.cursor;
    this.lastMessageAt = Date.now();
    this.messageLag = resolveMessageLag(message, this.lastMessageAt);
    this.recordMessageRate(this.lastMessageAt);
    this.messageCount += 1;
    this.resetStaleTimer();
    if (this.status !== TOPOLOGY_DATA_ADAPTER_STATUS.LIVE) {
      this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.LIVE);
    }

    const event = this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.MESSAGE, {
      message,
      validation: decision.validation,
      cursor: this.cursor,
      context,
    });
    if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT) {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.SNAPSHOT, {
        message,
        cursor: this.cursor,
        context,
      });
    } else {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.PATCH, {
        message,
        cursor: this.cursor,
        context,
      });
    }
    return event;
  }

  handleError(error, detail = {}) {
    this.lastError = error?.message || String(error);
    this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.ERROR, {
      error,
      ...detail,
    });
  }

  schedulePoll() {
    if (this.intentionalClose || this.transport !== TOPOLOGY_DATA_TRANSPORTS.POLLING) return;
    this.clearPollTimer();
    this.pollTimer = setManagedTimeout(() => {
      this.pollOnce().then((ok) => {
        if (ok !== false) this.schedulePoll();
      });
    }, this.pollIntervalMs);
  }

  scheduleReconnect() {
    if (this.intentionalClose) return;
    this.cleanupTransport({ keepReconnectTimer: true });
    if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.OFFLINE);
      return;
    }

    this.reconnectAttempts += 1;
    this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.RECONNECTING);
    const delay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectDelayMs * 2 ** Math.max(0, this.reconnectAttempts - 1),
    );
    this.reconnectTimer = setManagedTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.handleError(error, { transport: this.transport });
        this.scheduleReconnect();
      });
    }, delay);
  }

  resetStaleTimer() {
    this.clearStaleTimer();
    if (!this.staleTimeoutMs || this.staleTimeoutMs < 0) return;
    this.staleTimer = setManagedTimeout(() => {
      if (this.status === TOPOLOGY_DATA_ADAPTER_STATUS.LIVE) {
        this.setStatus(TOPOLOGY_DATA_ADAPTER_STATUS.STALE);
      }
    }, this.staleTimeoutMs);
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.STATUS, {
      status,
      snapshot: this.getStatus(),
    });
    if (status === TOPOLOGY_DATA_ADAPTER_STATUS.LIVE) {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.CONNECTED, { status });
    }
    if (status === TOPOLOGY_DATA_ADAPTER_STATUS.RECONNECTING) {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.RECONNECTING, { status });
    }
    if (status === TOPOLOGY_DATA_ADAPTER_STATUS.STALE) {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.STALE, { status });
    }
    if (status === TOPOLOGY_DATA_ADAPTER_STATUS.OFFLINE) {
      this.emit(TOPOLOGY_DATA_ADAPTER_EVENTS.OFFLINE, { status });
    }
  }

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      status: this.status,
      adapter: this,
      ...detail,
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    for (const listener of this.filteredListeners.get(type) || []) {
      listener(event);
    }
    return event;
  }

  cleanupTransport({ keepReconnectTimer = false } = {}) {
    this.clearPollTimer();
    this.clearStaleTimer();
    if (!keepReconnectTimer) this.clearReconnectTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.transportInstance) {
      closeTransport(this.transportInstance);
      this.transportInstance = null;
    }
  }

  clearPollTimer() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  clearStaleTimer() {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  recordMessageRate(timestamp) {
    const windowMs = 60000;
    this.messageWindow.push(timestamp);
    const cutoff = timestamp - windowMs;
    while (this.messageWindow.length && this.messageWindow[0] < cutoff) {
      this.messageWindow.shift();
    }
  }

  getMessageRate() {
    if (!this.messageWindow.length) return 0;
    const first = this.messageWindow[0];
    const last = this.messageWindow[this.messageWindow.length - 1];
    const durationSeconds = Math.max(1, (last - first) / 1000);
    return Math.round((this.messageWindow.length / durationSeconds) * 10) / 10;
  }
}

export function createTopologyDataAdapter(options = {}) {
  return new TopologyDataAdapter(options);
}

function createDefaultWebSocket(url, protocols) {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is not available in this runtime");
  }
  return protocols ? new WebSocket(url, protocols) : new WebSocket(url);
}

function createDefaultEventSource(url, init) {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not available in this runtime");
  }
  return new EventSource(url, init);
}

function addTransportListener(target, type, handler) {
  if (typeof target.addEventListener === "function") {
    target.addEventListener(type, handler);
    return;
  }
  target[`on${type}`] = handler;
}

function closeTransport(target) {
  if (typeof target.close === "function") {
    try {
      target.close();
    } catch {
      // Transport may already be closed by the browser/runtime.
    }
  }
}

function normalizeTransportError(event, fallbackMessage) {
  if (event instanceof Error) return event;
  if (event?.error instanceof Error) return event.error;
  if (event?.message) return new Error(event.message);
  return new Error(fallbackMessage);
}

function normalizeRawMessage(raw) {
  const data = readEventData(raw);
  if (typeof data !== "string") return data;
  const parsed = parseJson(data);
  return parsed || data;
}

function normalizeMessageBatch(result) {
  const data = normalizeRawMessage(result);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  if (data == null) return [];
  return [data];
}

function readEventData(event) {
  if (event && typeof event === "object" && "data" in event) return event.data;
  return event;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function setManagedTimeout(callback, delay) {
  const timer = setTimeout(callback, Math.max(0, delay));
  timer.unref?.();
  return timer;
}

function resolveMessageLag(message, now) {
  const serverTime = Date.parse(message.serverTime);
  if (Number.isNaN(serverTime)) return null;
  return Math.max(0, now - serverTime);
}
