import { REALTIME_TOPOLOGY_MESSAGE_TYPES } from "./RealtimeTopologyProtocol.js";

export const TOPOLOGY_UPDATE_SCHEDULER_EVENTS = Object.freeze({
  FLUSH: "flush",
  DROP: "drop",
  ERROR: "error",
});

export class TopologyUpdateScheduler {
  constructor({
    graph = null,
    store = null,
    flushIntervalMs = 160,
    maxQueueSize = 1000,
    autoPerformanceMode = true,
    performanceNodeThreshold = 1000,
    performanceEdgeThreshold = 1500,
    defaultSetDataOptions = {},
  } = {}) {
    this.graph = graph;
    this.store = store;
    this.flushIntervalMs = flushIntervalMs;
    this.maxQueueSize = maxQueueSize;
    this.autoPerformanceMode = autoPerformanceMode;
    this.performanceNodeThreshold = performanceNodeThreshold;
    this.performanceEdgeThreshold = performanceEdgeThreshold;
    this.defaultSetDataOptions = {
      preserveViewport: true,
      autoFit: false,
      silentSelection: true,
      disableAnimate: true,
      preserveOrigin: true,
      ...defaultSetDataOptions,
    };
    this.queue = [];
    this.flushTimer = null;
    this.listeners = new Set();
    this.filteredListeners = new Map();
    this.metrics = {
      queuedUpdates: 0,
      flushedBatches: 0,
      flushedMessages: 0,
      droppedUpdates: 0,
      flushDuration: 0,
      lastFlushAt: null,
      lastQueueSize: 0,
      maxQueueSize: this.maxQueueSize,
    };
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

  bindAdapter(adapter) {
    if (!adapter || typeof adapter.subscribe !== "function") {
      throw new Error("bindAdapter requires a TopologyDataAdapter-like object");
    }
    return adapter.subscribe("message", ({ message, context }) => this.enqueueMessage(message, { context }));
  }

  enqueueMessage(message, meta = {}) {
    return this.enqueue({ kind: "message", message, ...meta });
  }

  enqueueGraphPatch(patch, meta = {}) {
    return this.enqueue({ kind: "graphPatch", patch, ...meta });
  }

  enqueue(update) {
    this.queue.push({
      ...update,
      queuedAt: Date.now(),
    });
    this.metrics.queuedUpdates += 1;
    this.applyBackpressure();
    this.publishDebugMetrics(resolveGraphApi(this.graph));
    this.scheduleFlush();
    return this.getMetrics();
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setManagedTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }

  async flush() {
    if (!this.queue.length) return this.getMetrics();
    const startedAt = performance.now();
    const batch = this.queue.splice(0);
    this.metrics.lastQueueSize = batch.length;

    try {
      const coalesced = this.coalesce(batch);
      const graphApi = resolveGraphApi(this.graph);
      let structural = false;
      const directStructurePatches = [];

      for (const item of batch) {
        if (item.kind === "message" && item.message) {
          this.store?.applyMessage?.(item.message);
          if (
            item.message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT
            || item.message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH
          ) {
            structural = true;
            directStructurePatches.push(messageToGraphPatch(item.message));
          }
        } else if (item.kind === "graphPatch" && hasStructurePatch(item.patch)) {
          this.store?.applyMessage?.(graphPatchToTopologyMessage(item.patch));
          structural = true;
          directStructurePatches.push(item.patch);
        }
      }

      if (this.autoPerformanceMode) this.applyAutoPerformanceMode(graphApi);

      if (structural && this.store && graphApi?.setData) {
        await graphApi.setData({
          ...this.store.getData(),
          ...this.defaultSetDataOptions,
        });
      } else if (graphApi?.patchGraphData) {
        graphApi.patchGraphData({
          ...mergeStructurePatches(directStructurePatches),
          nodePatches: [...coalesced.nodePatches.values()],
          edgePatches: [...coalesced.edgePatches.values()],
        }, this.defaultSetDataOptions);
      }

      this.metrics.flushedBatches += 1;
      this.metrics.flushedMessages += batch.length;
      this.metrics.flushDuration = Math.round((performance.now() - startedAt) * 10) / 10;
      this.metrics.lastFlushAt = Date.now();
      this.publishDebugMetrics(graphApi);
      this.emit(TOPOLOGY_UPDATE_SCHEDULER_EVENTS.FLUSH, {
        batch,
        coalesced,
        metrics: this.getMetrics(),
      });
      return this.getMetrics();
    } catch (error) {
      this.emit(TOPOLOGY_UPDATE_SCHEDULER_EVENTS.ERROR, { error, batch });
      throw error;
    }
  }

  coalesce(batch) {
    const nodePatches = new Map();
    const edgePatches = new Map();
    const snapshotMessages = [];
    const structuralMessages = [];
    const lightMessages = [];

    for (const item of batch) {
      if (item.kind === "graphPatch") {
        for (const patch of normalizePatchList(item.patch?.nodePatches)) nodePatches.set(patch.id, mergePatch(nodePatches.get(patch.id), patch));
        for (const patch of normalizePatchList(item.patch?.edgePatches)) edgePatches.set(patch.id, mergePatch(edgePatches.get(patch.id), patch));
        if (hasStructurePatch(item.patch)) structuralMessages.push(graphPatchToTopologyMessage(item.patch));
        continue;
      }

      const message = item.message;
      if (!message) continue;
      if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT) {
        snapshotMessages.splice(0, snapshotMessages.length, message);
        continue;
      }
      if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH) {
        structuralMessages.push(message);
        continue;
      }
      if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.NODE_PATCH) {
        lightMessages.push(message);
        for (const patch of message.payload?.patches || []) nodePatches.set(patch.id, mergePatch(nodePatches.get(patch.id), patch));
        continue;
      }
      if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.EDGE_PATCH) {
        lightMessages.push(message);
        for (const patch of message.payload?.patches || []) edgePatches.set(patch.id, mergePatch(edgePatches.get(patch.id), patch));
      }
    }

    return {
      snapshotMessages,
      structuralMessages,
      lightMessages,
      nodePatches,
      edgePatches,
    };
  }

  applyBackpressure() {
    if (!this.maxQueueSize || this.queue.length <= this.maxQueueSize) return;
    const overflow = this.queue.length - this.maxQueueSize;
    let dropped = 0;
    const kept = [];
    for (const item of this.queue) {
      if (dropped < overflow && isDropCandidate(item)) {
        dropped += 1;
        continue;
      }
      kept.push(item);
    }
    while (kept.length > this.maxQueueSize) {
      kept.shift();
      dropped += 1;
    }
    this.queue = kept;
    this.metrics.droppedUpdates += dropped;
    if (dropped) {
      this.emit(TOPOLOGY_UPDATE_SCHEDULER_EVENTS.DROP, {
        dropped,
        metrics: this.getMetrics(),
      });
    }
  }

  applyAutoPerformanceMode(graphApi) {
    if (!graphApi?.setPerformanceMode || !this.store?.getSnapshot) return;
    const snapshot = this.store.getSnapshot();
    const shouldEnable = snapshot.nodeCount >= this.performanceNodeThreshold
      || snapshot.edgeCount >= this.performanceEdgeThreshold;
    if (shouldEnable) graphApi.setPerformanceMode(true);
  }

  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.length,
    };
  }

  publishDebugMetrics(graphApi = resolveGraphApi(this.graph)) {
    if (!graphApi?.updateDebugMetrics) return;
    const snapshot = this.store?.getSnapshot?.() || {};
    graphApi.updateDebugMetrics({
      ...this.getMetrics(),
      ...snapshot,
      schedulerUpdatedAt: Date.now(),
    });
  }

  destroy() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.queue = [];
  }

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      scheduler: this,
      ...detail,
    };
    for (const listener of this.listeners) listener(event);
    for (const listener of this.filteredListeners.get(type) || []) listener(event);
    return event;
  }
}

export function createTopologyUpdateScheduler(options = {}) {
  return new TopologyUpdateScheduler(options);
}

function resolveGraphApi(graph) {
  if (!graph) return null;
  return typeof graph.getGraph === "function" ? graph.getGraph() : graph;
}

function isDropCandidate(item) {
  const message = item.message;
  if (!message) return item.kind !== "graphPatch" || !hasStructurePatch(item.patch);
  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT) return false;
  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH) return false;
  return !hasCriticalPatch(message.payload?.patches || []);
}

function hasCriticalPatch(patches = []) {
  return patches.some((patch) => {
    const status = patch?.data?.status || patch?.patch?.data?.status;
    return status === "critical" || status === "warn";
  });
}

function hasStructurePatch(patch = {}) {
  return Boolean(
    patch.addedNodes?.length
    || patch.addNodes?.length
    || patch.updatedNodes?.length
    || patch.updateNodes?.length
    || patch.removedNodeIds?.length
    || patch.removeNodeIds?.length
    || patch.addedEdges?.length
    || patch.addEdges?.length
    || patch.updatedEdges?.length
    || patch.updateEdges?.length
    || patch.removedEdgeIds?.length
    || patch.removeEdgeIds?.length,
  );
}

function graphPatchToTopologyMessage(patch = {}) {
  return {
    type: REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH,
    version: patch.version ?? 0,
    seq: patch.seq ?? 0,
    serverTime: patch.serverTime || new Date().toISOString(),
    source: patch.source || "scheduler",
    payload: {
      addNodes: patch.addedNodes || patch.addNodes || [],
      updateNodes: patch.updatedNodes || patch.updateNodes || [],
      removeNodeIds: patch.removedNodeIds || patch.removeNodeIds || [],
      addEdges: patch.addedEdges || patch.addEdges || [],
      updateEdges: patch.updatedEdges || patch.updateEdges || [],
      removeEdgeIds: patch.removedEdgeIds || patch.removeEdgeIds || [],
    },
  };
}

function messageToGraphPatch(message = {}) {
  if (message.type !== REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH) return {};
  const payload = message.payload || {};
  return {
    addedNodes: payload.addNodes || [],
    updatedNodes: payload.updateNodes || [],
    removedNodeIds: payload.removeNodeIds || [],
    addedEdges: payload.addEdges || [],
    updatedEdges: payload.updateEdges || [],
    removedEdgeIds: payload.removeEdgeIds || [],
  };
}

function mergeStructurePatches(patches = []) {
  return patches.reduce((merged, patch) => ({
    addedNodes: merged.addedNodes.concat(patch.addedNodes || patch.addNodes || []),
    updatedNodes: merged.updatedNodes.concat(patch.updatedNodes || patch.updateNodes || []),
    removedNodeIds: merged.removedNodeIds.concat(patch.removedNodeIds || patch.removeNodeIds || []),
    addedEdges: merged.addedEdges.concat(patch.addedEdges || patch.addEdges || []),
    updatedEdges: merged.updatedEdges.concat(patch.updatedEdges || patch.updateEdges || []),
    removedEdgeIds: merged.removedEdgeIds.concat(patch.removedEdgeIds || patch.removeEdgeIds || []),
  }), {
    addedNodes: [],
    updatedNodes: [],
    removedNodeIds: [],
    addedEdges: [],
    updatedEdges: [],
    removedEdgeIds: [],
  });
}

function normalizePatchList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.entries()].map(([id, patch]) => ({ id, ...(patch || {}) }));
  if (typeof value === "object") return Object.entries(value).map(([id, patch]) => ({ id, ...(patch || {}) }));
  return [];
}

function mergePatch(previous = {}, next = {}) {
  return {
    ...previous,
    ...next,
    data: {
      ...previous.data,
      ...next.data,
    },
    patch: {
      ...previous.patch,
      ...next.patch,
    },
  };
}

function setManagedTimeout(callback, delay) {
  const timer = setTimeout(callback, Math.max(0, delay));
  timer.unref?.();
  return timer;
}
