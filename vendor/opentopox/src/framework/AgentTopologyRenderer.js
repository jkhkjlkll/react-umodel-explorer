import { NewTopoGraph } from "./NewTopoGraph.js";
import { buildAgentActivityTopology } from "./AgentActivityAdapter.js";
import { createAgentActivityEvent, validateAgentActivityEvent } from "./AgentActivityProtocol.js";

export const CHAT_TOPOLOGY_BLOCK_SCHEMA = "opentopox.chat-topology-block.v1";

export const CHAT_TOPOLOGY_BLOCK_KINDS = Object.freeze({
  TOPOLOGY: "topology",
  ACTIVITY_TRACE: "activity-trace",
});

export function createChatTopologyBlockPayload(input = {}) {
  const parsed = typeof input === "string" ? parseJson(input) : input;
  const payload = isPlainObject(parsed) ? parsed : {};
  const kind = Object.values(CHAT_TOPOLOGY_BLOCK_KINDS).includes(payload.kind)
    ? payload.kind
    : CHAT_TOPOLOGY_BLOCK_KINDS.TOPOLOGY;
  const events = Array.isArray(payload.events)
    ? payload.events.map((event) => createAgentActivityEvent(event))
    : [];
  const graph = normalizeGraph(payload.graph || (events.length ? buildAgentActivityTopology(events) : { nodes: [], edges: [] }));

  return {
    schema: payload.schema || CHAT_TOPOLOGY_BLOCK_SCHEMA,
    kind,
    ...(payload.title ? { title: String(payload.title) } : {}),
    ...(payload.summary ? { summary: String(payload.summary) } : {}),
    ...(payload.runId ? { runId: String(payload.runId) } : {}),
    graph,
    ...(events.length ? { events } : {}),
    ...(Array.isArray(payload.activityRefs) ? { activityRefs: payload.activityRefs.map((item) => String(item)) } : {}),
    view: normalizeView(payload.view),
    meta: sanitizeBlockMeta(payload.meta),
  };
}

export function validateChatTopologyBlockPayload(input, {
  allowFutureSchema = false,
} = {}) {
  const raw = typeof input === "string" ? parseJson(input) : input;
  const payload = createChatTopologyBlockPayload(raw);
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) errors.push("payload must be a plain object or a JSON object string");
  if (!allowFutureSchema && payload.schema !== CHAT_TOPOLOGY_BLOCK_SCHEMA) {
    errors.push(`schema must be ${CHAT_TOPOLOGY_BLOCK_SCHEMA}`);
  }
  if (!Object.values(CHAT_TOPOLOGY_BLOCK_KINDS).includes(payload.kind)) {
    errors.push(`kind must be one of ${Object.values(CHAT_TOPOLOGY_BLOCK_KINDS).join(", ")}`);
  }
  if (!Array.isArray(payload.graph.nodes)) errors.push("graph.nodes must be an array");
  if (!Array.isArray(payload.graph.edges)) errors.push("graph.edges must be an array");
  for (const event of payload.events || []) {
    const validation = validateAgentActivityEvent(event);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `events: ${error}`));
    warnings.push(...validation.warnings);
  }
  if (payload.graph.nodes.length > payload.view.maxNodes) warnings.push("graph node count exceeds view.maxNodes; host may choose to summarize");
  if (payload.graph.edges.length > payload.view.maxEdges) warnings.push("graph edge count exceeds view.maxEdges; host may choose to summarize");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    payload,
  };
}

export function renderAgentTopologyBlock(container, input, options = {}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("renderAgentTopologyBlock requires a DOM container");
  }
  const validation = validateChatTopologyBlockPayload(input, options);
  if (!validation.valid) {
    const error = new Error(`Invalid chat topology block: ${validation.errors.join("; ")}`);
    error.validation = validation;
    throw error;
  }

  const payload = validation.payload;
  container.innerHTML = "";
  const wrapper = document.createElement("section");
  wrapper.className = "topo-chat-topology-block";
  wrapper.dataset.kind = payload.kind;

  const header = document.createElement("div");
  header.className = "topo-chat-topology-header";
  const title = document.createElement("strong");
  title.textContent = payload.title || (payload.kind === CHAT_TOPOLOGY_BLOCK_KINDS.ACTIVITY_TRACE ? "Agent activity" : "Topology");
  const summary = document.createElement("span");
  summary.textContent = payload.summary || summarizeGraph(payload.graph);
  header.append(title, summary);

  const graphHost = document.createElement("div");
  graphHost.className = "topo-chat-topology-graph";
  graphHost.style.height = `${payload.view.maxHeight}px`;

  wrapper.append(header, graphHost);
  container.appendChild(wrapper);

  const topo = new NewTopoGraph({
    container: graphHost,
    config: {
      type: payload.kind === CHAT_TOPOLOGY_BLOCK_KINDS.ACTIVITY_TRACE ? "agentTrace" : "default",
      theme: payload.view.theme || options.theme || "neutral",
      nodeDraggable: false,
      minimap: false,
      hoverHighlight: payload.view.hoverHighlight ?? true,
      enableSelection: false,
      fitViewPadding: payload.view.compact ? 0.08 : 0.14,
      allowedNodeTypes: options.allowedNodeTypes,
    },
    handleNodeClick: (node) => {
      container.dispatchEvent(new CustomEvent("topo:chat-topology-node", {
        detail: { node, payload },
        bubbles: true,
      }));
    },
    handleEdgeClick: (edge) => {
      container.dispatchEvent(new CustomEvent("topo:chat-topology-edge", {
        detail: { edge, payload },
        bubbles: true,
      }));
    },
  });

  const ready = topo.getGraph().setData({
    nodes: payload.graph.nodes,
    edges: payload.graph.edges,
    autoFit: true,
    preserveOrigin: true,
    disableAnimate: payload.view.animate === false,
  });

  return {
    payload,
    validation,
    container,
    graph: topo,
    ready,
    destroy() {
      topo.destroy();
      container.innerHTML = "";
    },
    update(nextInput) {
      const next = createChatTopologyBlockPayload(nextInput);
      return topo.getGraph().setData({
        nodes: next.graph.nodes,
        edges: next.graph.edges,
        autoFit: true,
        preserveOrigin: true,
        disableAnimate: next.view.animate === false,
      });
    },
  };
}

function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(cloneGraphItem) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(cloneGraphItem) : [],
  };
}

function normalizeView(view = {}) {
  const compact = view.compact ?? true;
  return {
    compact: Boolean(compact),
    readonly: view.readonly ?? true,
    maxHeight: clampNumber(view.maxHeight, compact ? 220 : 360, 120, 800),
    maxNodes: clampNumber(view.maxNodes, compact ? 20 : 80, 1, 500),
    maxEdges: clampNumber(view.maxEdges, compact ? 40 : 160, 0, 1000),
    ...(view.theme ? { theme: String(view.theme) } : {}),
    ...(typeof view.hoverHighlight === "boolean" ? { hoverHighlight: view.hoverHighlight } : {}),
    ...(typeof view.animate === "boolean" ? { animate: view.animate } : {}),
  };
}

function sanitizeBlockMeta(meta = {}) {
  if (!isPlainObject(meta)) return {};
  const output = {};
  for (const [key, value] of Object.entries(meta)) {
    if (["context", "payload", "prompt", "response", "messages", "logs", "body", "content"].includes(key)) continue;
    if (value == null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") output[key] = value;
  }
  return output;
}

function summarizeGraph(graph) {
  return `${graph.nodes.length} nodes, ${graph.edges.length} edges`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cloneGraphItem(item) {
  if (Array.isArray(item)) return item.map((entry) => cloneGraphItem(entry));
  if (!item || typeof item !== "object") return item;
  const clone = {};
  for (const [key, value] of Object.entries(item)) clone[key] = cloneGraphItem(value);
  return clone;
}

function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
