import { TOPOLOGY_DATA_ADAPTER_EVENTS } from "./TopologyDataAdapter.js";
import {
  REALTIME_TOPOLOGY_MESSAGE_TYPES,
  createRealtimeTopologyCursor,
  normalizeRealtimeTopologyMessage,
} from "./RealtimeTopologyProtocol.js";
import { getRegisteredNodeShapes } from "./Registry.js";

export const TOPOLOGY_GRAPH_STORE_EVENTS = Object.freeze({
  CHANGE: "change",
  SNAPSHOT: "snapshot",
  PATCH: "patch",
  STATUS: "status",
  ERROR: "error",
});

export const TOPOLOGY_GRAPH_STORE_STATUS = Object.freeze({
  IDLE: "idle",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  STALE: "stale",
  OFFLINE: "offline",
});

export class TopologyGraphStore {
  constructor({
    nodes = [],
    edges = [],
    version = 0,
    selectedId = "",
    viewport = null,
    connectionStatus = TOPOLOGY_GRAPH_STORE_STATUS.IDLE,
  } = {}) {
    this.nodeMap = new Map();
    this.edgeMap = new Map();
    this.listeners = new Set();
    this.filteredListeners = new Map();
    this.version = version;
    this.cursor = null;
    this.selectedId = selectedId;
    this.viewport = viewport;
    this.connectionStatus = connectionStatus;
    this.lastMessageTime = null;
    this.lastSnapshotAt = null;
    this.lastPatchAt = null;
    this.lastValidation = null;
    this.lastErrors = [];
    this.lastWarnings = [];
    this.metrics = {
      snapshots: 0,
      patches: 0,
      nodePatches: 0,
      edgePatches: 0,
      topologyPatches: 0,
      invalidEdges: 0,
      duplicateNodes: 0,
      duplicateEdges: 0,
      invalidStatuses: 0,
      missingTitles: 0,
      cyclicParents: 0,
      unknownNodeTypes: 0,
    };
    this.replace({ nodes, edges, version }, { emit: false });
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
    const disposers = [
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.MESSAGE, (event) => this.applyAdapterEvent(event)),
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.STATUS, (event) => this.setConnectionStatus(event.status, event)),
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.RECONNECTING, (event) => this.setConnectionStatus(TOPOLOGY_GRAPH_STORE_STATUS.RECONNECTING, event)),
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.STALE, (event) => this.setConnectionStatus(TOPOLOGY_GRAPH_STORE_STATUS.STALE, event)),
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.OFFLINE, (event) => this.setConnectionStatus(TOPOLOGY_GRAPH_STORE_STATUS.OFFLINE, event)),
      adapter.subscribe(TOPOLOGY_DATA_ADAPTER_EVENTS.ERROR, (event) => this.recordError(event.error || event)),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }

  applyAdapterEvent(event = {}) {
    if (event.message) return this.applyMessage(event.message, { context: event.context, validation: event.validation });
    return null;
  }

  applyMessage(input, context = {}) {
    const message = normalizeRealtimeTopologyMessage(input);
    this.cursor = createRealtimeTopologyCursor(message);
    this.version = message.version;
    this.lastMessageTime = Date.now();
    this.lastValidation = context.validation || null;

    if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT) {
      return this.replace({
        nodes: message.payload.nodes,
        edges: message.payload.edges,
        version: message.version,
        meta: message.payload.meta,
      }, { message, context });
    }

    if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.NODE_PATCH) {
      const result = this.applyNodePatches(message.payload.patches || []);
      this.metrics.patches += 1;
      this.metrics.nodePatches += result.applied;
      this.lastPatchAt = Date.now();
      return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.PATCH, { message, context, result });
    }

    if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.EDGE_PATCH) {
      const result = this.applyEdgePatches(message.payload.patches || []);
      this.metrics.patches += 1;
      this.metrics.edgePatches += result.applied;
      this.lastPatchAt = Date.now();
      return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.PATCH, { message, context, result });
    }

    if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH) {
      const result = this.applyTopologyPatch(message.payload);
      this.metrics.patches += 1;
      this.metrics.topologyPatches += 1;
      this.lastPatchAt = Date.now();
      return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.PATCH, { message, context, result });
    }

    return null;
  }

  replace({ nodes = [], edges = [], version = this.version, meta = {} } = {}, { emit = true, message = null, context = {} } = {}) {
    const validation = validateGraphData(nodes, edges);
    this.nodeMap = new Map(validation.nodes.map((node) => [node.id, node]));
    this.edgeMap = new Map(validation.edges.map((edge) => [edge.id, edge]));
    this.version = version;
    this.lastValidation = validation;
    this.lastErrors = validation.errors;
    this.lastWarnings = validation.warnings;
    this.metrics.duplicateNodes += validation.duplicateNodes;
    this.metrics.duplicateEdges += validation.duplicateEdges;
    this.metrics.invalidEdges += validation.invalidEdges;
    this.metrics.invalidStatuses += validation.invalidStatuses;
    this.metrics.missingTitles += validation.missingTitles;
    this.metrics.cyclicParents += validation.cyclicParents;
    this.metrics.unknownNodeTypes += validation.unknownNodeTypes;
    this.metrics.snapshots += 1;
    this.lastSnapshotAt = Date.now();

    if (!emit) return null;
    return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.SNAPSHOT, {
      message,
      context,
      result: {
        replaced: true,
        nodes: this.nodeMap.size,
        edges: this.edgeMap.size,
        meta,
        validation,
      },
    });
  }

  applyNodePatches(patches = []) {
    let applied = 0;
    const missing = [];
    for (const patch of patches) {
      const id = patch?.id;
      const existing = this.nodeMap.get(id);
      if (!id || !existing) {
        missing.push(id);
        continue;
      }
      this.nodeMap.set(id, mergeGraphPatch(existing, patch));
      applied += 1;
    }
    return { applied, missing };
  }

  applyEdgePatches(patches = []) {
    let applied = 0;
    const missing = [];
    for (const patch of patches) {
      const id = patch?.id;
      const existing = this.edgeMap.get(id);
      if (!id || !existing) {
        missing.push(id);
        continue;
      }
      this.edgeMap.set(id, mergeGraphPatch(existing, patch));
      applied += 1;
    }
    return { applied, missing };
  }

  applyTopologyPatch(payload = {}) {
    const removedNodeIds = new Set(payload.removeNodeIds || []);
    const removedEdgeIds = new Set(payload.removeEdgeIds || []);
    for (const id of removedNodeIds) this.nodeMap.delete(id);
    for (const id of removedEdgeIds) this.edgeMap.delete(id);

    for (const edge of this.edgeMap.values()) {
      if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
        this.edgeMap.delete(edge.id);
      }
    }

    for (const node of payload.addNodes || []) {
      if (node?.id) this.nodeMap.set(node.id, cloneGraphItem(node));
    }
    for (const node of payload.updateNodes || []) {
      if (!node?.id) continue;
      const existing = this.nodeMap.get(node.id);
      this.nodeMap.set(node.id, existing ? mergeGraphPatch(existing, node) : cloneGraphItem(node));
    }
    for (const edge of payload.addEdges || []) {
      if (edge?.id) this.edgeMap.set(edge.id, cloneGraphItem(edge));
    }
    for (const edge of payload.updateEdges || []) {
      if (!edge?.id) continue;
      const existing = this.edgeMap.get(edge.id);
      this.edgeMap.set(edge.id, existing ? mergeGraphPatch(existing, edge) : cloneGraphItem(edge));
    }

    const validation = validateGraphData(this.getNodes(), this.getEdges());
    this.nodeMap = new Map(validation.nodes.map((node) => [node.id, node]));
    this.edgeMap = new Map(validation.edges.map((edge) => [edge.id, edge]));
    this.lastValidation = validation;
    this.lastErrors = validation.errors;
    this.lastWarnings = validation.warnings;
    this.metrics.invalidEdges += validation.invalidEdges;
    this.metrics.invalidStatuses += validation.invalidStatuses;
    this.metrics.missingTitles += validation.missingTitles;
    this.metrics.cyclicParents += validation.cyclicParents;
    this.metrics.unknownNodeTypes += validation.unknownNodeTypes;

    return {
      removedNodeIds: [...removedNodeIds],
      removedEdgeIds: [...removedEdgeIds],
      addedNodes: (payload.addNodes || []).length,
      updatedNodes: (payload.updateNodes || []).length,
      addedEdges: (payload.addEdges || []).length,
      updatedEdges: (payload.updateEdges || []).length,
      validation,
    };
  }

  setConnectionStatus(status, context = {}) {
    const normalized = normalizeConnectionStatus(status);
    this.connectionStatus = normalized;
    return this.emit(TOPOLOGY_GRAPH_STORE_EVENTS.STATUS, {
      status: normalized,
      context,
      snapshot: this.getSnapshot(),
    });
  }

  setViewport(viewport) {
    this.viewport = viewport ? { ...viewport } : null;
    return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.CHANGE, { reason: "viewport" });
  }

  setSelectedId(selectedId) {
    this.selectedId = selectedId || "";
    return this.emitChange(TOPOLOGY_GRAPH_STORE_EVENTS.CHANGE, { reason: "selection" });
  }

  recordError(error) {
    const message = error?.message || String(error);
    this.lastErrors = [...this.lastErrors, message].slice(-20);
    return this.emit(TOPOLOGY_GRAPH_STORE_EVENTS.ERROR, { error, snapshot: this.getSnapshot() });
  }

  getData() {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  getNodes() {
    return [...this.nodeMap.values()].map(cloneGraphItem);
  }

  getEdges() {
    return [...this.edgeMap.values()].map(cloneGraphItem);
  }

  getSnapshot() {
    return {
      version: this.version,
      currentGraphVersion: this.version,
      snapshotVersion: this.cursor?.version ?? this.version,
      cursor: this.cursor ? { ...this.cursor } : null,
      selectedId: this.selectedId,
      viewport: this.viewport ? { ...this.viewport } : null,
      connectionStatus: this.connectionStatus,
      lastMessageTime: this.lastMessageTime,
      lastSnapshotAt: this.lastSnapshotAt,
      lastPatchAt: this.lastPatchAt,
      nodeCount: this.nodeMap.size,
      edgeCount: this.edgeMap.size,
      metrics: { ...this.metrics },
      lastValidation: this.lastValidation ? summarizeValidation(this.lastValidation) : null,
      lastErrors: [...this.lastErrors],
      lastWarnings: [...this.lastWarnings],
    };
  }

  emitChange(type, detail = {}) {
    return this.emit(type, {
      ...detail,
      data: this.getData(),
      snapshot: this.getSnapshot(),
    });
  }

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      store: this,
      ...detail,
    };
    for (const listener of this.listeners) listener(event);
    for (const listener of this.filteredListeners.get(type) || []) listener(event);
    return event;
  }
}

export function createTopologyGraphStore(options = {}) {
  return new TopologyGraphStore(options);
}

const VALID_TOPOLOGY_STATUSES = new Set(["pending", "running", "ok", "warn", "critical"]);
const DEFAULT_ALLOWED_NODE_TYPES = new Set([
  "cardNode",
  "cardLayerNode",
  "componentNode",
  "flowLayerNode",
  "flowNode",
  "groupNodeWithHandles",
  "inputSourceNode",
  "labeledGroupNode",
  "operatorNode",
  "planNode",
  "sinkNode",
  "agentRunNode",
  "agentStepNode",
  "toolCallNode",
  "mcpServerNode",
  "skillNode",
  "artifactNode",
  "contextNode",
]);

export function validateGraphData(nodes = [], edges = [], {
  allowedNodeTypes = DEFAULT_ALLOWED_NODE_TYPES,
  additionalAllowedNodeTypes = [],
  validStatuses = VALID_TOPOLOGY_STATUSES,
} = {}) {
  const errors = [];
  const warnings = [];
  const effectiveAllowedNodeTypes = resolveAllowedNodeTypes(allowedNodeTypes, additionalAllowedNodeTypes);
  const nodeIds = new Set();
  const edgeIds = new Set();
  const outputNodes = [];
  const outputEdges = [];
  const nodeById = new Map();
  let duplicateNodes = 0;
  let duplicateEdges = 0;
  let invalidEdges = 0;
  let invalidStatuses = 0;
  let missingTitles = 0;
  let cyclicParents = 0;
  let unknownNodeTypes = 0;

  for (const node of nodes || []) {
    if (!node?.id) {
      errors.push("node id is required");
      continue;
    }
    if (nodeIds.has(node.id)) {
      duplicateNodes += 1;
      errors.push(`duplicate node id: ${node.id}`);
      continue;
    }
    nodeIds.add(node.id);
    const cloned = cloneGraphItem(node);
    const status = cloned.data?.status ?? cloned.status;
    if (status != null && !validStatuses.has(status)) {
      invalidStatuses += 1;
      warnings.push(`invalid node status: ${cloned.id} -> ${status}`);
    }
    if (!hasNodeTitle(cloned)) {
      missingTitles += 1;
      warnings.push(`missing node title: ${cloned.id}`);
    }
    if (cloned.type && effectiveAllowedNodeTypes && !effectiveAllowedNodeTypes.has(cloned.type)) {
      unknownNodeTypes += 1;
      warnings.push(`unknown node type: ${cloned.id} -> ${cloned.type}`);
    }
    nodeById.set(cloned.id, cloned);
    outputNodes.push(cloned);
  }

  for (const edge of edges || []) {
    if (!edge?.id) {
      errors.push("edge id is required");
      continue;
    }
    if (edgeIds.has(edge.id)) {
      duplicateEdges += 1;
      errors.push(`duplicate edge id: ${edge.id}`);
      continue;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      invalidEdges += 1;
      errors.push(`orphan edge: ${edge.id}`);
      continue;
    }
    edgeIds.add(edge.id);
    const cloned = cloneGraphItem(edge);
    const status = cloned.data?.status ?? cloned.status;
    if (status != null && !validStatuses.has(status)) {
      invalidStatuses += 1;
      warnings.push(`invalid edge status: ${cloned.id} -> ${status}`);
    }
    outputEdges.push(cloned);
  }

  for (const node of outputNodes) {
    if (!node.parentId) continue;
    if (!nodeById.has(node.parentId)) {
      warnings.push(`missing parent node: ${node.id} -> ${node.parentId}`);
      continue;
    }
    if (hasParentCycle(node, nodeById)) {
      cyclicParents += 1;
      warnings.push(`cyclic parentId: ${node.id}`);
    }
  }

  return {
    valid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errors,
    warnings,
    nodes: outputNodes,
    edges: outputEdges,
    duplicateNodes,
    duplicateEdges,
    invalidEdges,
    invalidStatuses,
    missingTitles,
    cyclicParents,
    unknownNodeTypes,
  };
}

function resolveAllowedNodeTypes(allowedNodeTypes, additionalAllowedNodeTypes = []) {
  if (!allowedNodeTypes) return null;
  const allowed = new Set(normalizeTypeList(allowedNodeTypes));
  for (const type of normalizeTypeList(additionalAllowedNodeTypes)) allowed.add(type);
  for (const { type } of getRegisteredNodeShapes()) allowed.add(type);
  return allowed;
}

function normalizeTypeList(value) {
  if (!value) return [];
  if (value instanceof Set) return [...value].filter(Boolean);
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return [value];
  return [];
}

function hasNodeTitle(node) {
  return Boolean(
    node.data?.title
    || node.data?.label
    || node.data?.name
    || node.label
    || node.title,
  );
}

function hasParentCycle(node, nodeById) {
  const visited = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId) {
    if (visited.has(parentId)) return true;
    visited.add(parentId);
    parentId = nodeById.get(parentId)?.parentId;
  }
  return false;
}

function summarizeValidation(validation) {
  return {
    valid: validation.valid,
    hasWarnings: validation.hasWarnings,
    duplicateNodes: validation.duplicateNodes,
    duplicateEdges: validation.duplicateEdges,
    invalidEdges: validation.invalidEdges,
    invalidStatuses: validation.invalidStatuses,
    missingTitles: validation.missingTitles,
    cyclicParents: validation.cyclicParents,
    unknownNodeTypes: validation.unknownNodeTypes,
  };
}

function mergeGraphPatch(item, patch) {
  const next = {
    ...item,
    ...cloneGraphItem(patch.patch || patch),
  };
  if (patch.replace === true) {
    return cloneGraphItem({
      id: patch.id || item.id,
      ...patch.patch,
      data: patch.data || patch.patch?.data || {},
    });
  }
  if (patch.data) {
    next.data = { ...item.data, ...cloneGraphItem(patch.data) };
  }
  if (patch.style) {
    next.style = { ...item.style, ...cloneGraphItem(patch.style) };
  }
  if (patch.position) {
    next.position = { ...cloneGraphItem(patch.position) };
  }
  if (Array.isArray(patch.removeFields) && next.data) {
    next.data = { ...next.data };
    for (const field of patch.removeFields) delete next.data[field];
  }
  return next;
}

function normalizeConnectionStatus(status) {
  if (Object.values(TOPOLOGY_GRAPH_STORE_STATUS).includes(status)) return status;
  if (status === "connected") return TOPOLOGY_GRAPH_STORE_STATUS.LIVE;
  return status || TOPOLOGY_GRAPH_STORE_STATUS.IDLE;
}

function cloneGraphItem(item) {
  if (Array.isArray(item)) return item.map((entry) => cloneGraphItem(entry));
  if (!item || typeof item !== "object") return item;
  const clone = {};
  for (const [key, value] of Object.entries(item)) {
    clone[key] = cloneGraphItem(value);
  }
  return clone;
}
