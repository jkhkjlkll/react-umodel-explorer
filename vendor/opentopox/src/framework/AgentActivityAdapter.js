import { createRealtimeTopologyPatch } from "./RealtimeTopologyProtocol.js";
import {
  AGENT_ACTIVITY_KINDS,
  AGENT_ACTIVITY_STATUSES,
  createAgentActivityEvent,
  inferActivityKind,
  validateAgentActivityEvent,
} from "./AgentActivityProtocol.js";

export const AGENT_ACTIVITY_NODE_TYPES = Object.freeze({
  RUN: "agentRunNode",
  STEP: "agentStepNode",
  TOOL: "toolCallNode",
  MCP: "mcpServerNode",
  SKILL: "skillNode",
  ARTIFACT: "artifactNode",
  CONTEXT: "contextNode",
});

export const AGENT_ACTIVITY_EDGE_TYPES = Object.freeze({
  INVOKES: "invokes",
  USES_CONTEXT: "uses-context",
  PRODUCES: "produces",
  DEPENDS_ON: "depends-on",
  REPORTS_TO: "reports-to",
});

const ACTIVITY_ICONS = Object.freeze({
  [AGENT_ACTIVITY_KINDS.RUN]: "RUN",
  [AGENT_ACTIVITY_KINDS.STEP]: "STEP",
  [AGENT_ACTIVITY_KINDS.TOOL]: "TOOL",
  [AGENT_ACTIVITY_KINDS.MCP]: "MCP",
  [AGENT_ACTIVITY_KINDS.SKILL]: "SKL",
  [AGENT_ACTIVITY_KINDS.ARTIFACT]: "ART",
  [AGENT_ACTIVITY_KINDS.CONTEXT]: "CTX",
});

export class AgentActivityAdapter {
  constructor({
    source = "agent-activity",
    version = 1,
    failureBubbleStatus = AGENT_ACTIVITY_STATUSES.WARN,
  } = {}) {
    this.source = source;
    this.version = version;
    this.failureBubbleStatus = failureBubbleStatus;
    this.nodes = new Map();
    this.edges = new Map();
    this.logicalIndex = new Map();
    this.seq = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new Error("AgentActivityAdapter.subscribe requires a listener");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ingest(input, options = {}) {
    const validation = validateAgentActivityEvent(input, options);
    if (!validation.valid) {
      const result = { valid: false, validation, event: validation.event, patch: createEmptyPatch() };
      this.emit("error", result);
      return result;
    }

    const event = validation.event;
    const patch = this.createPatchFromEvent(event);
    const result = {
      valid: true,
      validation,
      event,
      patch,
      message: this.createRealtimePatchMessage(patch, event),
      graph: this.getGraphData(),
    };
    this.emit("patch", result);
    return result;
  }

  ingestMany(events = [], options = {}) {
    const results = [];
    for (const event of events || []) results.push(this.ingest(event, options));
    return {
      results,
      graph: this.getGraphData(),
    };
  }

  createPatchFromEvent(inputEvent) {
    const event = createAgentActivityEvent(inputEvent);
    const patch = createEmptyPatch();
    const runNode = this.upsertNode(createRunNode(event), patch);
    this.indexLogicalKey(`run:${event.runId}`, runNode.id);

    if (event.kind === AGENT_ACTIVITY_KINDS.RUN) {
      if (event.status === AGENT_ACTIVITY_STATUSES.CRITICAL) this.markNodeStatus(runNode.id, AGENT_ACTIVITY_STATUSES.CRITICAL, patch);
      return patch;
    }

    let parentNodeId = runNode.id;
    if (event.stepId || event.kind === AGENT_ACTIVITY_KINDS.STEP) {
      const stepNode = this.upsertNode(createStepNode(event), patch);
      this.indexLogicalKey(`step:${event.runId}:${event.stepId || event.targetId || event.id}`, stepNode.id);
      this.upsertEdge(createAgentActivityEdge({
        source: runNode.id,
        target: stepNode.id,
        relation: AGENT_ACTIVITY_EDGE_TYPES.DEPENDS_ON,
        status: stepNode.data?.status,
      }), patch);
      parentNodeId = stepNode.id;
      if (event.kind === AGENT_ACTIVITY_KINDS.STEP) {
        if (event.status === AGENT_ACTIVITY_STATUSES.CRITICAL) this.markNodeStatus(runNode.id, AGENT_ACTIVITY_STATUSES.WARN, patch);
        return patch;
      }
    }

    parentNodeId = this.resolveParentNodeId(event, parentNodeId);
    const activityNode = this.upsertNode(createActivityNode(event), patch);
    this.indexLogicalKey(`target:${event.runId}:${event.targetId || event.id}`, activityNode.id);
    this.indexLogicalKey(`${event.kind}:${event.runId}:${event.targetId || event.name || event.id}`, activityNode.id);
    this.upsertEdge(createAgentActivityEdge({
      source: parentNodeId,
      target: activityNode.id,
      relation: relationForKind(event.kind),
      status: activityNode.data?.status,
    }), patch);

    if (event.status === AGENT_ACTIVITY_STATUSES.CRITICAL) {
      this.markNodeStatus(parentNodeId, this.failureBubbleStatus, patch);
      if (parentNodeId !== runNode.id) this.markNodeStatus(runNode.id, AGENT_ACTIVITY_STATUSES.WARN, patch);
    }

    return patch;
  }

  createRealtimePatchMessage(patch, event = {}) {
    this.seq += 1;
    return createRealtimeTopologyPatch({
      version: this.version,
      seq: this.seq,
      source: this.source,
      traceId: event.id,
      serverTime: event.createdAt || new Date().toISOString(),
      addNodes: patch.addedNodes,
      updateNodes: patch.updatedNodes,
      removeNodeIds: patch.removedNodeIds,
      addEdges: patch.addedEdges,
      updateEdges: patch.updatedEdges,
      removeEdgeIds: patch.removedEdgeIds,
      meta: {
        schema: event.schema,
        eventType: event.type,
        runId: event.runId,
      },
    });
  }

  getGraphData() {
    return {
      nodes: [...this.nodes.values()].map(cloneGraphItem),
      edges: [...this.edges.values()].map(cloneGraphItem),
    };
  }

  reset() {
    this.nodes.clear();
    this.edges.clear();
    this.logicalIndex.clear();
    this.seq = 0;
    this.emit("reset", { graph: this.getGraphData() });
  }

  resolveParentNodeId(event, fallbackNodeId) {
    if (event.parentId) {
      if (this.nodes.has(event.parentId)) return event.parentId;
      const keys = [
        `target:${event.runId}:${event.parentId}`,
        `${event.kind}:${event.runId}:${event.parentId}`,
        `step:${event.runId}:${event.parentId}`,
      ];
      for (const key of keys) {
        const id = this.logicalIndex.get(key);
        if (id) return id;
      }
    }
    return fallbackNodeId;
  }

  indexLogicalKey(key, nodeId) {
    if (key && nodeId) this.logicalIndex.set(key, nodeId);
  }

  upsertNode(node, patch) {
    const previous = this.nodes.get(node.id);
    const next = previous ? mergeGraphItem(previous, node) : cloneGraphItem(node);
    this.nodes.set(node.id, next);
    if (previous) patch.updatedNodes.push(next);
    else patch.addedNodes.push(next);
    return next;
  }

  upsertEdge(edge, patch) {
    const previous = this.edges.get(edge.id);
    const next = previous ? mergeGraphItem(previous, edge) : cloneGraphItem(edge);
    this.edges.set(edge.id, next);
    if (previous) patch.updatedEdges.push(next);
    else patch.addedEdges.push(next);
    return next;
  }

  markNodeStatus(nodeId, status, patch) {
    const previous = this.nodes.get(nodeId);
    if (!previous) return null;
    const currentWeight = statusWeight(previous.data?.status);
    const nextWeight = statusWeight(status);
    if (nextWeight < currentWeight) return previous;
    const next = mergeGraphItem(previous, { data: { status } });
    this.nodes.set(nodeId, next);
    upsertPatchItem(patch.updatedNodes, next);
    return next;
  }

  emit(type, detail = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      adapter: this,
      ...detail,
    };
    for (const listener of this.listeners) listener(event);
    return event;
  }
}

export function createAgentActivityAdapter(options = {}) {
  return new AgentActivityAdapter(options);
}

export function buildAgentActivityTopology(events = [], options = {}) {
  const adapter = createAgentActivityAdapter(options);
  adapter.ingestMany(events);
  return adapter.getGraphData();
}

export function createAgentActivityTopologyPatch(event, options = {}) {
  const adapter = createAgentActivityAdapter(options);
  return adapter.ingest(event).patch;
}

function createRunNode(event) {
  const status = event.kind === AGENT_ACTIVITY_KINDS.RUN ? event.status : AGENT_ACTIVITY_STATUSES.RUNNING;
  return {
    id: runNodeId(event.runId),
    type: AGENT_ACTIVITY_NODE_TYPES.RUN,
    data: createActivityData({
      event,
      kind: AGENT_ACTIVITY_KINDS.RUN,
      title: event.kind === AGENT_ACTIVITY_KINDS.RUN ? event.name : `Run ${event.runId}`,
      summary: event.kind === AGENT_ACTIVITY_KINDS.RUN ? event.summary : "",
      status,
    }),
  };
}

function createStepNode(event) {
  const stepId = event.stepId || event.targetId || event.id;
  return {
    id: stepNodeId(event.runId, stepId),
    type: AGENT_ACTIVITY_NODE_TYPES.STEP,
    data: createActivityData({
      event,
      kind: AGENT_ACTIVITY_KINDS.STEP,
      title: event.kind === AGENT_ACTIVITY_KINDS.STEP ? event.name : `Step ${stepId}`,
      summary: event.kind === AGENT_ACTIVITY_KINDS.STEP ? event.summary || event.outputSummary || event.inputSummary : "",
      status: event.kind === AGENT_ACTIVITY_KINDS.STEP ? event.status : AGENT_ACTIVITY_STATUSES.RUNNING,
    }),
  };
}

function createActivityNode(event) {
  const kind = event.kind || inferActivityKind(event.type);
  const ref = referenceForKind(event, kind);
  const id = activityNodeId(event, kind, ref);
  return {
    id,
    type: nodeTypeForKind(kind),
    data: createActivityData({
      event,
      kind,
      title: event.name || ref?.name || ref?.title || defaultTitleForKind(kind, event),
      summary: event.summary || event.outputSummary || event.inputSummary || ref?.summary || "",
      status: event.status,
      ref,
    }),
  };
}

function createActivityData({ event, kind, title, summary, status, ref }) {
  const data = {
    title: title || defaultTitleForKind(kind, event),
    subTitle: kind,
    summary: summary || "",
    status,
    domain: "agent",
    icon: ACTIVITY_ICONS[kind] || "AI",
    kind,
    activity: {
      eventId: event.id,
      eventType: event.type,
      runId: event.runId,
      ...(event.stepId ? { stepId: event.stepId } : {}),
      ...(event.targetId ? { targetId: event.targetId } : {}),
      ...(event.startedAt ? { startedAt: event.startedAt } : {}),
      ...(event.endedAt ? { endedAt: event.endedAt } : {}),
      ...(event.durationMs != null ? { durationMs: event.durationMs } : {}),
    },
  };
  if (event.error) data.error = event.error;
  if (ref) data.ref = ref;
  if (Number.isFinite(event.durationMs)) data.metric = { label: "Duration", value: formatDuration(event.durationMs) };
  return data;
}

function createAgentActivityEdge({ source, target, relation, status }) {
  return {
    id: edgeId(source, target, relation),
    source,
    target,
    type: "agentActivityEdge",
    label: relation,
    data: {
      relation,
      status: normalizeEdgeStatus(status),
      edgeType: "agentActivityEdge",
    },
  };
}

function relationForKind(kind) {
  if (kind === AGENT_ACTIVITY_KINDS.CONTEXT) return AGENT_ACTIVITY_EDGE_TYPES.USES_CONTEXT;
  if (kind === AGENT_ACTIVITY_KINDS.ARTIFACT) return AGENT_ACTIVITY_EDGE_TYPES.PRODUCES;
  return AGENT_ACTIVITY_EDGE_TYPES.INVOKES;
}

function nodeTypeForKind(kind) {
  if (kind === AGENT_ACTIVITY_KINDS.RUN) return AGENT_ACTIVITY_NODE_TYPES.RUN;
  if (kind === AGENT_ACTIVITY_KINDS.STEP) return AGENT_ACTIVITY_NODE_TYPES.STEP;
  if (kind === AGENT_ACTIVITY_KINDS.MCP) return AGENT_ACTIVITY_NODE_TYPES.MCP;
  if (kind === AGENT_ACTIVITY_KINDS.SKILL) return AGENT_ACTIVITY_NODE_TYPES.SKILL;
  if (kind === AGENT_ACTIVITY_KINDS.ARTIFACT) return AGENT_ACTIVITY_NODE_TYPES.ARTIFACT;
  if (kind === AGENT_ACTIVITY_KINDS.CONTEXT) return AGENT_ACTIVITY_NODE_TYPES.CONTEXT;
  return AGENT_ACTIVITY_NODE_TYPES.TOOL;
}

function referenceForKind(event, kind) {
  if (kind === AGENT_ACTIVITY_KINDS.CONTEXT) return event.contextRef || null;
  if (kind === AGENT_ACTIVITY_KINDS.ARTIFACT) return event.artifactRef || null;
  if (kind === AGENT_ACTIVITY_KINDS.MCP) return event.mcpRef || null;
  if (kind === AGENT_ACTIVITY_KINDS.SKILL) return event.skillRef || null;
  if (kind === AGENT_ACTIVITY_KINDS.TOOL) return event.toolRef || null;
  return null;
}

function defaultTitleForKind(kind, event) {
  if (kind === AGENT_ACTIVITY_KINDS.RUN) return `Run ${event.runId}`;
  if (kind === AGENT_ACTIVITY_KINDS.STEP) return `Step ${event.stepId || event.targetId || event.id}`;
  return event.targetId || kind;
}

function activityNodeId(event, kind, ref) {
  if (kind === AGENT_ACTIVITY_KINDS.CONTEXT) return `agent-context:${safeIdPart(ref?.id || event.targetId || event.id)}`;
  if (kind === AGENT_ACTIVITY_KINDS.ARTIFACT) return `agent-artifact:${safeIdPart(ref?.id || event.targetId || event.id)}`;
  return `agent-${kind}:${safeIdPart(event.runId)}:${safeIdPart(event.stepId || "run")}:${safeIdPart(event.targetId || ref?.id || event.name || event.id)}`;
}

function runNodeId(runId) {
  return `agent-run:${safeIdPart(runId)}`;
}

function stepNodeId(runId, stepId) {
  return `agent-step:${safeIdPart(runId)}:${safeIdPart(stepId)}`;
}

function edgeId(source, target, relation) {
  return `agent-edge:${safeIdPart(source)}:${safeIdPart(relation)}:${safeIdPart(target)}`;
}

function safeIdPart(value) {
  return String(value || "unknown").replace(/\s+/g, "_").replace(/[^\w:.-]/g, "_");
}

function normalizeEdgeStatus(status) {
  return status === AGENT_ACTIVITY_STATUSES.CRITICAL || status === AGENT_ACTIVITY_STATUSES.WARN ? status : AGENT_ACTIVITY_STATUSES.OK;
}

function statusWeight(status) {
  if (status === AGENT_ACTIVITY_STATUSES.CRITICAL) return 4;
  if (status === AGENT_ACTIVITY_STATUSES.WARN) return 3;
  if (status === AGENT_ACTIVITY_STATUSES.RUNNING) return 2;
  if (status === AGENT_ACTIVITY_STATUSES.OK) return 1;
  return 0;
}

function isProblemStatus(status) {
  return status === AGENT_ACTIVITY_STATUSES.WARN || status === AGENT_ACTIVITY_STATUSES.CRITICAL;
}

function formatDuration(durationMs) {
  const value = Number(durationMs) || 0;
  return value >= 1000 ? `${Math.round(value / 100) / 10}s` : `${Math.round(value)}ms`;
}

function upsertPatchItem(items, item) {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
}

function mergeGraphItem(previous = {}, next = {}) {
  const data = {
    ...(previous.data || {}),
    ...(next.data || {}),
    activity: {
      ...(previous.data?.activity || {}),
      ...(next.data?.activity || {}),
    },
  };
  if (isProblemStatus(previous.data?.status) && statusWeight(previous.data?.status) > statusWeight(next.data?.status)) data.status = previous.data.status;
  return {
    ...previous,
    ...cloneGraphItem(next),
    data,
  };
}

function createEmptyPatch() {
  return {
    addedNodes: [],
    updatedNodes: [],
    removedNodeIds: [],
    addedEdges: [],
    updatedEdges: [],
    removedEdgeIds: [],
  };
}

function cloneGraphItem(item) {
  if (Array.isArray(item)) return item.map((entry) => cloneGraphItem(entry));
  if (!item || typeof item !== "object") return item;
  const clone = {};
  for (const [key, value] of Object.entries(item)) clone[key] = cloneGraphItem(value);
  return clone;
}
