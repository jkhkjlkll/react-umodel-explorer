export const TOPOLOGY_CONTEXT_SCHEMA = "opentopox.agent-context.v1";

const DEFAULT_MAX_NODES = 80;
const DEFAULT_MAX_EDGES = 160;
const DEFAULT_DENY_FIELDS = [
  "accesskey",
  "accesskeyid",
  "accesskeysecret",
  "apikey",
  "authorization",
  "cookie",
  "credentials",
  "password",
  "passwd",
  "privatekey",
  "pwd",
  "secret",
  "setcookie",
  "token",
];

const OMIT_FIELD = Symbol("omitField");

export function createTopologyContext({
  nodes = [],
  edges = [],
  selection,
  visibleRect,
  viewport,
  source = {},
  options = {},
} = {}) {
  const scope = options.scope || (hasSelection(selection) ? "selected" : "visible");
  const includeMode = options.includeMode || (scope === "visible" ? "visible" : "connectedEdges");
  const selected = normalizeSelection(selection, options.ids);
  const resolved = resolveContextGraph({
    nodes,
    edges,
    selection: selected,
    visibleRect,
    scope,
    includeMode,
    degree: options.degree,
    direction: options.direction,
  });
  const limited = limitGraph(resolved.nodes, resolved.edges, {
    maxNodes: options.maxNodes,
    maxEdges: options.maxEdges,
  });
  const redactedFields = new Set();
  const redaction = normalizeRedaction(options.redaction);
  const contextNodes = limited.nodes.map((node) => sanitizeGraphItem(node, redaction, redactedFields));
  const contextEdges = limited.edges.map((edge) => sanitizeGraphItem(edge, redaction, redactedFields));
  const envelope = {
    schema: TOPOLOGY_CONTEXT_SCHEMA,
    createdAt: options.createdAt || new Date().toISOString(),
    source: {
      library: "opentopox",
      graphType: source.graphType || "default",
      ...(source.layout ? { layout: source.layout } : {}),
      ...(source.version ? { version: source.version } : {}),
    },
    scope: {
      type: scope,
      includeMode,
      selected: selectedToArray(selected),
      ...(visibleRect ? { visibleRect: cloneGraphItem(visibleRect) } : {}),
      ...(Number.isFinite(Number(options.degree)) ? { degree: Number(options.degree) } : {}),
      ...(options.direction ? { direction: options.direction } : {}),
    },
    ...(options.includeViewport === false || !viewport ? {} : { viewport: cloneGraphItem(viewport) }),
    summary: createContextSummary({ scope, includeMode, nodes: contextNodes, edges: contextEdges, limited }),
    nodes: contextNodes,
    edges: contextEdges,
    meta: {
      nodeCount: contextNodes.length,
      edgeCount: contextEdges.length,
      originalNodeCount: resolved.nodes.length,
      originalEdgeCount: resolved.edges.length,
      truncated: limited.truncated,
      redactedFields: [...redactedFields].sort(),
    },
  };

  return envelope;
}

export function resolveContextGraph({
  nodes = [],
  edges = [],
  selection,
  visibleRect,
  scope = "visible",
  includeMode = "connectedEdges",
  degree = 1,
  direction = "both",
} = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

  if (scope === "visible" || includeMode === "visible") {
    return getVisibleGraphData({ nodes, edges, visibleRect });
  }

  const selected = normalizeSelection(selection);
  const nodeIds = new Set(selected.nodes.filter((id) => nodeById.has(id)));
  const edgeIds = new Set(selected.edges.filter((id) => edgeById.has(id)));

  for (const edgeId of edgeIds) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;
    if (nodeById.has(edge.source)) nodeIds.add(edge.source);
    if (nodeById.has(edge.target)) nodeIds.add(edge.target);
  }

  if (scope === "neighborhood" || includeMode === "oneHop") {
    const related = getRelatedData([...nodeIds], nodes, edges, { degree, direction });
    related.edges.forEach((edge) => edgeIds.add(edge.id));
    related.nodes.forEach((node) => nodeIds.add(node.id));
  }

  if (includeMode === "connectedEdges" || includeMode === "oneHop") {
    for (const edge of edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) edgeIds.add(edge.id);
    }
  }

  return {
    nodes: nodes.filter((node) => nodeIds.has(node.id)).map((node) => cloneGraphItem(node)),
    edges: edges.filter((edge) => edgeIds.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target)).map((edge) => cloneGraphItem(edge)),
  };
}

export function getVisibleGraphData({ nodes = [], edges = [], visibleRect } = {}) {
  if (!visibleRect) {
    return {
      nodes: nodes.map((node) => cloneGraphItem(node)),
      edges: edges.map((edge) => cloneGraphItem(edge)),
    };
  }

  const visibleNodeIds = new Set();
  for (const node of nodes) {
    if (isNodeCenterInRect(node, visibleRect)) visibleNodeIds.add(node.id);
  }

  return {
    nodes: nodes.filter((node) => visibleNodeIds.has(node.id)).map((node) => cloneGraphItem(node)),
    edges: edges
      .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => cloneGraphItem(edge)),
  };
}

export function formatTopologyContextAsMarkdown(context) {
  const focus = context.scope?.selected?.map((item) => item.id).filter(Boolean).slice(0, 8).join(", ") || "-";
  return [
    "## OpenTopoX Context",
    "",
    `Scope: ${context.scope?.type || "visible"}`,
    `Include mode: ${context.scope?.includeMode || "connectedEdges"}`,
    `Nodes: ${context.meta?.nodeCount ?? context.nodes?.length ?? 0}`,
    `Edges: ${context.meta?.edgeCount ?? context.edges?.length ?? 0}`,
    `Focus: ${focus}`,
    context.meta?.truncated ? "Truncated: true" : "Truncated: false",
    "",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
  ].join("\n");
}

export function serializeTopologyContext(context, { format = "json" } = {}) {
  if (format === "markdown") return formatTopologyContextAsMarkdown(context);
  if (format === "both") {
    return {
      envelope: context,
      json: JSON.stringify(context, null, 2),
      markdown: formatTopologyContextAsMarkdown(context),
    };
  }
  return context;
}

function getRelatedData(focusIds, nodes, edges, { degree = 1, direction = "both" } = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const relatedNodes = new Set(focusIds.filter((id) => nodeById.has(id)));
  const relatedEdges = new Set();
  let frontier = new Set(relatedNodes);
  const maxDegree = Math.max(1, Number(degree) || 1);

  for (let level = 0; level < maxDegree && frontier.size; level += 1) {
    const next = new Set();
    for (const edge of edges) {
      const isIncoming = frontier.has(edge.target);
      const isOutgoing = frontier.has(edge.source);
      const allowed = direction === "upstream"
        ? isIncoming
        : direction === "downstream"
          ? isOutgoing
          : isIncoming || isOutgoing;
      if (!allowed) continue;

      relatedEdges.add(edge.id);
      if (!relatedNodes.has(edge.source)) next.add(edge.source);
      if (!relatedNodes.has(edge.target)) next.add(edge.target);
      relatedNodes.add(edge.source);
      relatedNodes.add(edge.target);
    }
    frontier = next;
  }

  return {
    nodes: nodes.filter((node) => relatedNodes.has(node.id)),
    edges: edges.filter((edge) => relatedEdges.has(edge.id) && relatedNodes.has(edge.source) && relatedNodes.has(edge.target)),
  };
}

function limitGraph(nodes, edges, { maxNodes = DEFAULT_MAX_NODES, maxEdges = DEFAULT_MAX_EDGES } = {}) {
  const nodeLimit = Math.max(1, Number(maxNodes) || DEFAULT_MAX_NODES);
  const edgeLimit = Math.max(0, Number(maxEdges) || DEFAULT_MAX_EDGES);
  const limitedNodes = nodes.slice(0, nodeLimit);
  const allowedNodeIds = new Set(limitedNodes.map((node) => node.id));
  const limitedEdges = edges
    .filter((edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target))
    .slice(0, edgeLimit);
  return {
    nodes: limitedNodes,
    edges: limitedEdges,
    truncated: limitedNodes.length < nodes.length || limitedEdges.length < edges.length,
  };
}

function sanitizeGraphItem(item, redaction, redactedFields) {
  const sanitized = sanitizeValue(item, [], redaction, redactedFields);
  return sanitized === OMIT_FIELD ? undefined : sanitized;
}

function sanitizeValue(value, path, redaction, redactedFields) {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => sanitizeValue(entry, [...path, String(index)], redaction, redactedFields))
      .filter((entry) => entry !== OMIT_FIELD);
  }
  if (!value || typeof value !== "object") return value;

  const clone = {};
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (shouldOmitField(key, nextPath, redaction)) {
      redactedFields.add(nextPath.join("."));
      continue;
    }
    const sanitized = sanitizeValue(entry, nextPath, redaction, redactedFields);
    if (sanitized !== OMIT_FIELD) clone[key] = sanitized;
  }
  return clone;
}

function shouldOmitField(key, path, redaction) {
  const normalizedKey = normalizeFieldName(key);
  const normalizedPath = normalizeFieldName(path.join("."));
  if (redaction.allowFields.has(normalizedKey) || redaction.allowFields.has(normalizedPath)) return false;
  return redaction.denyFields.has(normalizedKey) || redaction.denyFields.has(normalizedPath);
}

function normalizeRedaction(redaction = {}) {
  const denyFields = redaction.denyFields?.length ? redaction.denyFields : DEFAULT_DENY_FIELDS;
  return {
    allowFields: new Set((redaction.allowFields || []).map(normalizeFieldName)),
    denyFields: new Set(denyFields.map(normalizeFieldName)),
  };
}

function normalizeSelection(selection = {}, ids = []) {
  const nodes = new Set(selection.nodes || []);
  const edges = new Set(selection.edges || []);
  for (const id of ids || []) nodes.add(id);
  const primary = selection.primary || (
    nodes.size ? { type: "node", id: [...nodes][0] }
      : edges.size ? { type: "edge", id: [...edges][0] }
        : null
  );
  return {
    nodes: [...nodes].filter(Boolean),
    edges: [...edges].filter(Boolean),
    primary,
  };
}

function selectedToArray(selection) {
  return [
    ...selection.nodes.map((id) => ({ type: "node", id })),
    ...selection.edges.map((id) => ({ type: "edge", id })),
  ];
}

function hasSelection(selection) {
  return Boolean(selection?.nodes?.length || selection?.edges?.length);
}

function isNodeCenterInRect(node, rect) {
  const position = node.position || { x: 0, y: 0 };
  const size = node.measured || node.size || node.data?.size || { width: 0, height: 0 };
  const width = Array.isArray(size) ? Number(size[0]) || 0 : Number(size.width) || 0;
  const height = Array.isArray(size) ? Number(size[1]) || 0 : Number(size.height) || 0;
  const center = {
    x: (Number(position.x) || 0) + width / 2,
    y: (Number(position.y) || 0) + height / 2,
  };
  return center.x >= rect.x
    && center.x <= rect.x + rect.width
    && center.y >= rect.y
    && center.y <= rect.y + rect.height;
}

function createContextSummary({ scope, includeMode, nodes, edges, limited }) {
  const truncated = limited.truncated ? " truncated" : "";
  return `OpenTopoX ${scope} context with ${nodes.length} nodes and ${edges.length} edges (${includeMode})${truncated}.`;
}

function normalizeFieldName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
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
