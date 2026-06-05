export const DEFAULT_EXPAND_LIMIT = 6;
export const DEFAULT_MAX_RENDER_NODES = 1200;

export function createEntityTopologyView({
  nodes = [],
  edges = [],
  enabled = true,
  groupBy = (node) => node.data?.groupKey,
  expandedGroupIds = [],
  groupMinSize = 3,
  expandLimit = DEFAULT_EXPAND_LIMIT,
  maxRenderNodes = DEFAULT_MAX_RENDER_NODES,
} = {}) {
  if (!enabled) {
    return {
      nodes: nodes.slice(),
      edges: edges.slice(),
      meta: {
        groups: [],
        hiddenNodeCount: Math.max(0, nodes.length - maxRenderNodes),
        limited: nodes.length > maxRenderNodes,
      },
    };
  }

  const expandedSet = new Set(expandedGroupIds);
  const rawGroups = groupNodes(nodes, groupBy);
  const groups = rawGroups.filter((group) => group.nodes.length >= groupMinSize);
  const groupByMemberId = new Map();
  groups.forEach((group) => group.nodes.forEach((node) => groupByMemberId.set(node.id, group)));

  const outputNodes = [];
  const visibleMemberIds = new Set();
  const hiddenRepresentativeById = new Map();
  const groupMeta = [];

  for (const node of nodes) {
    const group = groupByMemberId.get(node.id);
    if (!group) {
      outputNodes.push(node);
      visibleMemberIds.add(node.id);
      continue;
    }
    if (group.nodes[0].id !== node.id) continue;

    const expanded = expandedSet.has(group.id);
    const visibleMembers = expanded ? group.nodes.slice(0, expandLimit) : [];
    const hiddenMembers = expanded ? group.nodes.slice(expandLimit) : group.nodes;
    const groupNode = createGroupNode(group, { expanded, hiddenCount: hiddenMembers.length });

    if (!expanded) {
      outputNodes.push(groupNode);
      visibleMemberIds.add(groupNode.id);
      group.nodes.forEach((member) => hiddenRepresentativeById.set(member.id, groupNode.id));
    } else {
      outputNodes.push(...visibleMembers);
      visibleMembers.forEach((member) => visibleMemberIds.add(member.id));
      if (hiddenMembers.length) {
        const overflowNode = createOverflowNode(group, hiddenMembers);
        outputNodes.push(overflowNode);
        visibleMemberIds.add(overflowNode.id);
        hiddenMembers.forEach((member) => hiddenRepresentativeById.set(member.id, overflowNode.id));
      }
    }

    groupMeta.push({
      id: group.id,
      label: group.label,
      count: group.nodes.length,
      expanded,
      visibleCount: expanded ? visibleMembers.length : 1,
      hiddenCount: hiddenMembers.length,
      nodeIds: group.nodes.map((member) => member.id),
    });
  }

  const edgeResult = aggregateEdges(edges, {
    visibleMemberIds,
    hiddenRepresentativeById,
    nodes,
  });
  const limited = applyRenderLimit(outputNodes, edgeResult.edges, maxRenderNodes);

  return {
    nodes: limited.nodes,
    edges: limited.edges,
    meta: {
      groups: groupMeta,
      hiddenNodeCount: groupMeta.reduce((sum, group) => sum + group.hiddenCount, 0) + limited.hiddenNodeCount,
      limited: limited.hiddenNodeCount > 0,
      renderNodeCount: limited.nodes.length,
      renderEdgeCount: limited.edges.length,
    },
  };
}

export function toggleGroupId(expandedGroupIds = [], groupId) {
  const next = new Set(expandedGroupIds);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  return [...next];
}

export function buildTopologyDetailModel({ item, type, nodes = [], edges = [], context = {} } = {}) {
  if (!item) return null;
  if (type === "edge" || item.source && item.target) {
    return buildEdgeDetailModel(item, nodes, context);
  }
  if (item.data?.isGroupNode || item.data?.isOverflowGroup) {
    return buildGroupDetailModel(item, nodes, edges, context);
  }
  return buildNodeDetailModel(item, nodes, edges, context);
}

export function resolveEdgeMetricTitle(template = "", { edge, sourceNode, targetNode } = {}) {
  const values = {
    source: sourceNode?.data?.title || sourceNode?.id || edge?.source || "",
    sourceId: sourceNode?.id || edge?.source || "",
    sourceName: displayNodeName(sourceNode) || edge?.source || "",
    target: targetNode?.data?.title || targetNode?.id || edge?.target || "",
    targetId: targetNode?.id || edge?.target || "",
    targetName: displayNodeName(targetNode) || edge?.target || "",
    label: edge?.label || "",
    status: edge?.data?.status || "",
  };
  return String(template || "{source} -> {target} {label}").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function displayNodeName(node) {
  if (!node) return "";
  if (node.data?.isGroupNode) return node.data?.title || node.id;
  return node.data?.subTitle || node.data?.name || node.data?.title || node.id;
}

function buildNodeDetailModel(node, nodes, edges, context) {
  const connectedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  return {
    kind: "node",
    id: node.id,
    title: node.data?.title || node.id,
    subTitle: node.data?.subTitle || node.data?.domain || "",
    icon: node.data?.icon || "N",
    color: node.data?.color || "",
    status: node.data?.status || "ok",
    domain: node.data?.domain || "",
    metric: node.data?.metric || null,
    descriptions: node.data?.descriptions || [],
    datasets: node.data?.datasets || {},
    tags: node.data?.tags || [],
    rows: [
      { label: "类型", value: node.data?.domain || "" },
      { label: "状态", value: node.data?.status || "ok" },
      ...(node.data?.metric ? [{ label: node.data.metric.label, value: node.data.metric.value }] : []),
      { label: "关联关系", value: connectedEdges.length },
    ],
    relatedEdges: connectedEdges,
    context,
  };
}

function buildEdgeDetailModel(edge, nodes, context) {
  const sourceNode = nodes.find((node) => node.id === edge.source || node.data?.groupNodeIds?.includes(edge.source));
  const targetNode = nodes.find((node) => node.id === edge.target || node.data?.groupNodeIds?.includes(edge.target));
  const metricTitle = resolveEdgeMetricTitle(edge.data?.metricTitle, { edge, sourceNode, targetNode });
  return {
    kind: edge.data?.isGroupEdge ? "groupEdge" : "edge",
    id: edge.id,
    icon: "ED",
    title: edge.data?.isGroupEdge ? `${edge.data.aggregateCount} 条聚合关系` : edge.label || edge.id,
    subTitle: `${edge.source} -> ${edge.target}`,
    status: edge.data?.status || "ok",
    metricTitle,
    aggregateCount: edge.data?.aggregateCount || 1,
    aggregatedEdges: edge.data?.aggregatedEdges || [edge],
    descriptions: edge.data?.descriptions || [],
    datasets: edge.data?.datasets || {},
    tags: edge.data?.tags || [],
    parallel: {
      total: edge.data?.parallelTotal || 1,
      index: edge.data?.parallelIndex || 0,
      offset: edge.data?.parallelOffset || 0,
    },
    rows: [
      { label: "状态", value: edge.data?.status || "ok" },
      { label: "指标标题", value: metricTitle },
      { label: "延迟", value: edge.data?.latency || "n/a" },
      { label: "流量", value: edge.data?.traffic || "n/a" },
      { label: "关系 ID", value: edge.id },
    ],
    context: {
      ...context,
      sourceNode,
      targetNode,
    },
  };
}

function buildGroupDetailModel(groupNode, nodes, edges, context) {
  const memberIds = groupNode.data?.groupNodeIds || [];
  const members = nodes.filter((node) => memberIds.includes(node.id));
  const relatedEdges = edges.filter((edge) => memberIds.includes(edge.source) || memberIds.includes(edge.target));
  return {
    kind: "group",
    id: groupNode.id,
    groupId: groupNode.data?.groupId || groupNode.id.replace(/^group:/, "").replace(/:overflow$/, ""),
    title: groupNode.data?.title || groupNode.id,
    subTitle: groupNode.data?.subTitle || "",
    icon: groupNode.data?.icon || "GR",
    color: groupNode.data?.color || "",
    status: groupNode.data?.status || "ok",
    expanded: Boolean(groupNode.data?.expanded),
    hiddenCount: groupNode.data?.hiddenCount || 0,
    memberIds,
    members,
    relatedEdges,
    descriptions: groupNode.data?.descriptions || [],
    datasets: groupNode.data?.datasets || {},
    tags: groupNode.data?.tags || [],
    rows: [
      { label: "实体数量", value: memberIds.length },
      { label: "当前状态", value: groupNode.data?.status || "ok" },
      { label: "隐藏实体", value: groupNode.data?.hiddenCount || 0 },
      { label: "组 ID", value: groupNode.data?.groupId || groupNode.id },
    ],
    context: {
      ...context,
      groupId: groupNode.data?.groupId || groupNode.id.replace(/^group:/, "").replace(/:overflow$/, ""),
      expanded: Boolean(groupNode.data?.expanded),
    },
  };
}

function groupNodes(nodes, groupBy) {
  const groups = new Map();
  for (const node of nodes) {
    const key = groupBy(node);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        id: String(key),
        label: node.data?.groupLabel || node.data?.title || String(key),
        nodes: [],
      });
    }
    groups.get(key).nodes.push(node);
  }
  return [...groups.values()];
}

function createGroupNode(group, { expanded, hiddenCount }) {
  const status = maxStatus(group.nodes.map((node) => node.data?.status));
  const first = group.nodes[0] || {};
  return {
    id: `group:${group.id}`,
    type: "cardLayerNode",
    data: {
      title: group.label,
      subTitle: expanded ? `${group.nodes.length} 个实体，已展开` : `${group.nodes.length} 个实体，点击查看`,
      icon: first.data?.icon || "GR",
      domain: first.data?.domain || "group",
      group: first.data?.group || "group",
      groupId: group.id,
      groupNodeIds: group.nodes.map((node) => node.id),
      isGroupNode: true,
      expanded,
      hiddenCount,
      status,
      color: first.data?.color || "#64748b",
      metric: { label: "实体", value: String(group.nodes.length) },
      descriptions: [
        { label: "实体数量", value: String(group.nodes.length) },
        { label: "隐藏实体", value: String(hiddenCount) },
      ],
      tags: ["group", group.id],
      size: { width: 248, height: 118 },
    },
  };
}

function createOverflowNode(group, hiddenMembers) {
  const first = group.nodes[0] || {};
  return {
    id: `group:${group.id}:overflow`,
    type: "cardLayerNode",
    data: {
      title: `${group.label} 其余实体`,
      subTitle: `${hiddenMembers.length} 个实体受展开限制隐藏`,
      icon: "+",
      domain: first.data?.domain || "group",
      group: first.data?.group || "group",
      groupId: group.id,
      groupNodeIds: hiddenMembers.map((node) => node.id),
      isGroupNode: true,
      isOverflowGroup: true,
      hiddenCount: hiddenMembers.length,
      status: maxStatus(hiddenMembers.map((node) => node.data?.status)),
      color: first.data?.color || "#64748b",
      metric: { label: "隐藏", value: String(hiddenMembers.length) },
      descriptions: [
        { label: "展开上限", value: String(group.nodes.length - hiddenMembers.length) },
        { label: "隐藏实体", value: String(hiddenMembers.length) },
      ],
      tags: ["group", "overflow", group.id],
      size: { width: 248, height: 118 },
    },
  };
}

function aggregateEdges(edges, { visibleMemberIds, hiddenRepresentativeById, nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const buckets = new Map();

  for (const edge of edges) {
    const source = hiddenRepresentativeById.get(edge.source) || edge.source;
    const target = hiddenRepresentativeById.get(edge.target) || edge.target;
    if (source === target) continue;
    if (!visibleMemberIds.has(source) || !visibleMemberIds.has(target)) continue;

    const key = `${source}::${target}::${edge.label || ""}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        source,
        target,
        label: edge.label,
        edges: [],
      });
    }
    buckets.get(key).edges.push(edge);
  }

  return {
    edges: [...buckets.values()].map((bucket) => {
      if (bucket.edges.length === 1 && bucket.source === bucket.edges[0].source && bucket.target === bucket.edges[0].target) {
        return bucket.edges[0];
      }
      const status = maxStatus(bucket.edges.map((edge) => edge.data?.status));
      const sourceNode = byId.get(bucket.edges[0]?.source);
      const targetNode = byId.get(bucket.edges[0]?.target);
      return {
        id: `agg:${hashKey(`${bucket.source}:${bucket.target}:${bucket.label}:${bucket.edges.map((edge) => edge.id).join(",")}`)}`,
        source: bucket.source,
        target: bucket.target,
        label: bucket.edges.length > 1 ? `${bucket.edges.length} 条 ${bucket.label || "关系"}` : bucket.label,
        data: {
          status,
          isGroupEdge: true,
          aggregateCount: bucket.edges.length,
          aggregatedEdges: bucket.edges,
          latency: summarizeField(bucket.edges, "latency"),
          traffic: summarizeField(bucket.edges, "traffic"),
          metricTitle: bucket.edges[0]?.data?.metricTitle || "{source} -> {target} {label}",
          sourceTitle: sourceNode?.data?.title,
          targetTitle: targetNode?.data?.title,
        },
      };
    }),
  };
}

function applyRenderLimit(nodes, edges, maxRenderNodes) {
  if (!Number.isFinite(maxRenderNodes) || nodes.length <= maxRenderNodes) {
    return { nodes, edges, hiddenNodeCount: 0 };
  }
  const visibleNodes = nodes.slice(0, maxRenderNodes);
  const ids = new Set(visibleNodes.map((node) => node.id));
  return {
    nodes: visibleNodes,
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    hiddenNodeCount: nodes.length - visibleNodes.length,
  };
}

function maxStatus(statuses) {
  const rank = { ok: 0, warn: 1, critical: 2 };
  return statuses.reduce((max, status) => (rank[status] || 0) > (rank[max] || 0) ? status : max, "ok");
}

function summarizeField(edges, key) {
  const values = [...new Set(edges.map((edge) => edge.data?.[key]).filter(Boolean))];
  if (!values.length) return "n/a";
  return values.length === 1 ? values[0] : `${values.length} values`;
}

function hashKey(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
