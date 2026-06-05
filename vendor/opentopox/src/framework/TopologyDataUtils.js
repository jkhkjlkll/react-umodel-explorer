export function filterTopologyData({
  nodes = [],
  edges = [],
  query = "",
  groups = [],
  domains = [],
  statuses = [],
  nodeIds = [],
  edgeIds = [],
  includeRelated = true,
  degree = 1,
} = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  const groupSet = toSet(groups);
  const domainSet = toSet(domains);
  const statusSet = toSet(statuses);
  const explicitNodeIds = toSet(nodeIds);
  const explicitEdgeIds = toSet(edgeIds);
  const hasNodeFilters = groupSet.size || domainSet.size || statusSet.size || explicitNodeIds.size;
  const hasEdgeFilters = explicitEdgeIds.size;
  const hasQuery = Boolean(normalizedQuery);

  if (!hasQuery && !hasNodeFilters && !hasEdgeFilters) {
    return {
      nodes: nodes.slice(),
      edges: edges.slice(),
      matches: { nodeIds: [], edgeIds: [] },
      invalidFilter: false,
    };
  }

  const matchedNodeIds = new Set();
  const matchedEdgeIds = new Set();

  for (const node of nodes) {
    const groupMatched = !groupSet.size || groupSet.has(String(node.data?.group || ""));
    const domainMatched = !domainSet.size || domainSet.has(String(node.data?.domain || ""));
    const statusMatched = !statusSet.size || statusSet.has(String(node.data?.status || ""));
    const idMatched = !explicitNodeIds.size || explicitNodeIds.has(node.id);
    const queryMatched = !hasQuery || searchableNodeText(node).includes(normalizedQuery);
    if (groupMatched && domainMatched && statusMatched && idMatched && queryMatched) {
      matchedNodeIds.add(node.id);
    }
  }

  for (const edge of edges) {
    const idMatched = !explicitEdgeIds.size || explicitEdgeIds.has(edge.id);
    const queryMatched = hasQuery && searchableEdgeText(edge).includes(normalizedQuery);
    if ((hasEdgeFilters && idMatched) || queryMatched) matchedEdgeIds.add(edge.id);
  }

  const related = includeRelated
    ? getDataByNodeGroup([...matchedNodeIds], [...matchedEdgeIds], nodes, edges, { degree })
    : getStrictData([...matchedNodeIds], [...matchedEdgeIds], nodes, edges);

  return {
    nodes: related.relatedNodes,
    edges: related.relatedEdges,
    matches: {
      nodeIds: [...matchedNodeIds],
      edgeIds: [...matchedEdgeIds],
    },
    invalidFilter: !related.relatedNodes.length,
  };
}

export function getDataByNodeGroup(nodeIds = [], edgeIds = [], nodes = [], edges = [], { degree = 1 } = {}) {
  const seedNodes = new Set(nodeIds);
  const relatedNodes = new Set(seedNodes);
  const relatedEdges = new Set(edgeIds);
  const maxDegree = Math.max(1, Number(degree) || 1);
  const edgeEndpointNodes = new Set();

  for (const edge of edges) {
    if (!relatedEdges.has(edge.id)) continue;
    edgeEndpointNodes.add(edge.source);
    edgeEndpointNodes.add(edge.target);
    relatedNodes.add(edge.source);
    relatedNodes.add(edge.target);
  }

  let frontier = seedNodes.size ? new Set(seedNodes) : edgeEndpointNodes;
  const expandedNodes = new Set(frontier);
  for (let level = 0; level < maxDegree && frontier.size; level += 1) {
    const next = new Set();
    for (const edge of edges) {
      const touches = frontier.has(edge.source) || frontier.has(edge.target);
      if (!touches) continue;
      relatedEdges.add(edge.id);
      if (!expandedNodes.has(edge.source)) next.add(edge.source);
      if (!expandedNodes.has(edge.target)) next.add(edge.target);
      relatedNodes.add(edge.source);
      relatedNodes.add(edge.target);
    }
    for (const nodeId of next) expandedNodes.add(nodeId);
    frontier = next;
  }

  return {
    relatedNodes: nodes.filter((node) => relatedNodes.has(node.id)),
    relatedEdges: edges.filter((edge) => relatedEdges.has(edge.id) && relatedNodes.has(edge.source) && relatedNodes.has(edge.target)),
  };
}

export function processParallelEdges(edges = [], {
  mode = "offset",
  directed = true,
  spacing = 28,
  mergeIdPrefix = "parallel",
  labelFormatter,
} = {}) {
  const buckets = groupParallelEdges(edges, { directed });
  if (mode === "merge") {
    return [...buckets.values()].map((bucket) => {
      if (bucket.edges.length <= 1) return cloneEdge(bucket.edges[0]);
      const first = bucket.edges[0];
      const label = labelFormatter?.(bucket.edges, bucket.key)
        || `${bucket.edges.length} 条${first.label ? ` ${first.label}` : "关系"}`;
      return {
        ...cloneEdge(first),
        id: `${mergeIdPrefix}:${hashKey(bucket.key)}`,
        label,
        data: {
          ...first.data,
          status: maxStatus(bucket.edges.map((edge) => edge.data?.status)),
          isParallelEdge: true,
          parallelCount: bucket.edges.length,
          parallelEdges: bucket.edges.map(cloneEdge),
          parallelKey: bucket.key,
          parallelTotal: bucket.edges.length,
          parallelIndex: 0,
          parallelOffset: 0,
        },
      };
    });
  }

  return edges.map((edge) => {
    const key = getParallelEdgeKey(edge, { directed });
    const bucket = buckets.get(key);
    const index = bucket.edges.findIndex((item) => item.id === edge.id);
    const total = bucket.edges.length;
    const offset = total <= 1 ? 0 : (index - (total - 1) / 2) * spacing;
    return {
      ...cloneEdge(edge),
      data: {
        ...edge.data,
        parallelKey: key,
        parallelIndex: index,
        parallelTotal: total,
        parallelOffset: Math.round(offset * 10) / 10,
      },
    };
  });
}

export function mergeParallelEdges(edges = [], options = {}) {
  return processParallelEdges(edges, { ...options, mode: "merge" });
}

export function getParallelEdgeKey(edge, { directed = true } = {}) {
  if (directed) return `${edge.source}->${edge.target}`;
  return [edge.source, edge.target].sort().join("<>");
}

function getStrictData(nodeIds, edgeIds, nodes, edges) {
  const nodeSet = new Set(nodeIds);
  const edgeSet = new Set(edgeIds);
  for (const edge of edges) {
    if (edgeSet.has(edge.id)) {
      nodeSet.add(edge.source);
      nodeSet.add(edge.target);
    }
  }
  return {
    relatedNodes: nodes.filter((node) => nodeSet.has(node.id)),
    relatedEdges: edges.filter((edge) => {
      if (edgeSet.has(edge.id)) return nodeSet.has(edge.source) && nodeSet.has(edge.target);
      return nodeSet.has(edge.source) && nodeSet.has(edge.target);
    }),
  };
}

function groupParallelEdges(edges, { directed }) {
  const buckets = new Map();
  for (const edge of edges) {
    const key = getParallelEdgeKey(edge, { directed });
    if (!buckets.has(key)) buckets.set(key, { key, edges: [] });
    buckets.get(key).edges.push(edge);
  }
  return buckets;
}

function cloneEdge(edge = {}) {
  return {
    ...edge,
    data: edge.data ? { ...edge.data } : undefined,
  };
}

function maxStatus(statuses = []) {
  const weight = { ok: 0, warn: 1, critical: 2 };
  return statuses.reduce((current, status) => {
    return (weight[status] ?? 0) > (weight[current] ?? 0) ? status : current;
  }, "ok");
}

function hashKey(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function searchableNodeText(node) {
  const data = node.data || {};
  const datasets = data.datasets && typeof data.datasets === "object"
    ? Object.entries(data.datasets).flatMap(([key, value]) => [key, value])
    : [];
  return [
    node.id,
    node.type,
    data.title,
    data.subTitle,
    data.domain,
    data.type,
    data.name,
    ...(data.tags || []),
    ...datasets,
  ].join(" ").toLowerCase();
}

function searchableEdgeText(edge) {
  const data = edge.data || {};
  return [
    edge.id,
    edge.source,
    edge.target,
    edge.label,
    data.status,
    data.latency,
    data.traffic,
  ].join(" ").toLowerCase();
}

function toSet(value) {
  if (!value) return new Set();
  const list = Array.isArray(value) ? value : [value];
  return new Set(list.filter((item) => item !== "all" && item != null && item !== "").map(String));
}
