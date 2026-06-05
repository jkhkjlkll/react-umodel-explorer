export function buildCloudResourceTopology({
  connectedResources = [],
  unconnectedResources = [],
  connections = [],
  page = 1,
  pageSize = 20,
} = {}) {
  const connectedNodes = connectedResources.map((resource, index) => resourceToNode(resource, {
    connected: true,
    index,
  }));
  const unconnectedPage = paginateResources(unconnectedResources, { page, pageSize });
  const unconnectedNodes = unconnectedPage.items.map((resource, index) => resourceToNode(resource, {
    connected: false,
    index: connectedNodes.length + index,
  }));
  const ids = new Set([...connectedNodes, ...unconnectedNodes].map((node) => node.id));
  const edges = connections
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge, index) => ({
      id: edge.id || `cloud-edge:${edge.source}:to:${edge.target}:${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label || "connected",
      data: {
        status: edge.status || edge.data?.status || "ok",
        latency: edge.latency || edge.data?.latency,
        traffic: edge.traffic || edge.data?.traffic,
        metricTitle: edge.metricTitle || edge.data?.metricTitle || "{sourceName} 到 {targetName} 的云资源链路",
        ...edge.data,
      },
    }));

  return {
    nodes: [...connectedNodes, ...unconnectedNodes],
    edges,
    meta: {
      connectedCount: connectedResources.length,
      unconnectedCount: unconnectedResources.length,
      page: unconnectedPage.page,
      pageSize: unconnectedPage.pageSize,
      totalPages: unconnectedPage.totalPages,
      visibleUnconnectedCount: unconnectedPage.items.length,
    },
  };
}

export function createCloudResourceQueryProvider({
  queryCloudResources,
  queryGlobalEntities,
  queryResourceGraph,
  queryResourceGraphWithCache,
  getCloudResourceData,
  getEntityCountMap,
  getEntitySetMap,
  getRelations,
  cache = new Map(),
  cacheKey = defaultCacheKey,
} = {}) {
  return {
    async queryResources(query = {}) {
      const key = cacheKey("resources", query);
      if (cache?.has(key)) return cloneQueryResult(cache.get(key));
      const parts = await Promise.all([
        callMaybe(queryCloudResources, query),
        callMaybe(getCloudResourceData, query),
        callMaybe(queryResourceGraph, query.graphQuery || query),
        callMaybe(queryResourceGraphWithCache, query.graphQuery || query),
      ]);
      const result = mergeCloudResourceQueryResults(parts.map(normalizeCloudResourceQueryResult));
      cache?.set(key, cloneQueryResult(result));
      return result;
    },
    async queryGlobal(query = {}) {
      const key = cacheKey("global", query);
      if (cache?.has(key)) return cloneQueryResult(cache.get(key));
      const direct = await callMaybe(queryGlobalEntities, query);
      const result = direct
        ? normalizeGlobalQueryResult(direct)
        : {
            entityCountMap: await callMaybe(getEntityCountMap, query) || {},
            entitySetMap: await callMaybe(getEntitySetMap, query) || {},
            relations: await callMaybe(getRelations, query) || [],
          };
      cache?.set(key, cloneQueryResult(result));
      return result;
    },
    clearCache() {
      cache?.clear?.();
    },
  };
}

export async function buildCloudResourceTopologyFromQuery({
  provider,
  query = {},
  page = query.page || 1,
  pageSize = query.pageSize || 20,
  selectedIds = [],
} = {}) {
  if (!provider || typeof provider.queryResources !== "function") {
    throw new Error("buildCloudResourceTopologyFromQuery requires a cloud resource query provider");
  }
  const resourceResult = await provider.queryResources({ ...query, page, pageSize });
  const topology = buildCloudResourceTopology({
    connectedResources: resourceResult.connectedResources,
    unconnectedResources: resourceResult.unconnectedResources,
    connections: resourceResult.connections,
    page,
    pageSize,
  });
  const globalResult = typeof provider.queryGlobal === "function"
    ? await provider.queryGlobal(query)
    : resourceResult.global || {};
  const globalTopology = resourceResult.globalTopology || (globalResult.nodes && globalResult.edges
    ? globalResult
    : buildGlobalEntityTopology(globalResult));
  const batchSelection = createResourceBatchSelection(resourceResult.unconnectedResources, selectedIds);
  return {
    ...topology,
    meta: {
      ...topology.meta,
      ...resourceResult.meta,
      query,
      queryProvider: true,
      globalTopology,
      batchSelection,
    },
  };
}

export function normalizeCloudResourceQueryResult(result = {}) {
  result = result || {};
  if (Array.isArray(result)) {
    return { connectedResources: result, unconnectedResources: [], connections: [], meta: {} };
  }
  return {
    connectedResources: normalizeResources(result.connectedResources || result.connected || result.resources || result.nodes),
    unconnectedResources: normalizeResources(result.unconnectedResources || result.unconnected || result.pendingResources || result.pending || []),
    connections: normalizeConnections(result.connections || result.edges || result.relations || []),
    globalTopology: result.globalTopology,
    global: result.global,
    meta: result.meta || {},
  };
}

export function buildGlobalEntityTopology({
  entityCountMap = {},
  entitySetMap = {},
  relations = [],
} = {}) {
  const countEntries = toEntries(entityCountMap);
  const setEntries = new Map(toEntries(entitySetMap));
  const nodes = countEntries.map(([type, count], index) => {
    const members = toArray(setEntries.get(type));
    return {
      id: `global:${type}`,
      type: "cardLayerNode",
      data: {
        title: entityTitle(type),
        subTitle: `${count} 个实体`,
        icon: entityIcon(type),
        domain: String(type),
        group: "global",
        status: count ? "ok" : "warn",
        layer: index,
        rank: index,
        color: entityColor(type),
        metric: { label: "实体数", value: String(count) },
        descriptions: [
          { label: "实体集合", value: String(members.length || count) },
          { label: "类型", value: String(type) },
        ],
        datasets: {
          entity_type: type,
          count,
          members: members.join(","),
        },
        tags: ["global", String(type)],
        size: { width: 240, height: 118 },
      },
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = relations
    .map((relation, index) => ({
      id: relation.id || `global-edge:${relation.source}:to:${relation.target}:${index}`,
      source: normalizeGlobalId(relation.source),
      target: normalizeGlobalId(relation.target),
      label: relation.label || "关联",
      data: {
        status: relation.status || relation.data?.status || "ok",
        metricTitle: "{sourceName} 到 {targetName} 的全局实体关系",
        ...relation.data,
      },
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return {
    nodes,
    edges,
    meta: {
      entityTypes: nodes.length,
      relationTypes: edges.length,
      totalEntities: countEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0),
    },
  };
}

export function paginateResources(resources = [], { page = 1, pageSize = 20 } = {}) {
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(resources.length / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    total: resources.length,
    totalPages,
    items: resources.slice(start, start + safePageSize),
  };
}

export function createResourceBatchSelection(resources = [], selectedIds = []) {
  const selectedSet = new Set(selectedIds);
  const selected = resources.filter((resource) => selectedSet.has(resource.id));
  const unselected = resources.filter((resource) => !selectedSet.has(resource.id));
  return {
    selected,
    unselected,
    selectedIds: selected.map((resource) => resource.id),
    selectedCount: selected.length,
    total: resources.length,
  };
}

function resourceToNode(resource, { connected, index }) {
  const type = resource.type || resource.resourceType || resource.domain || "resource";
  const group = resource.group || inferResourceGroup(type);
  return {
    id: resource.id,
    type: resource.nodeType || "cardLayerNode",
    data: {
      title: resource.name || resource.title || resource.id,
      subTitle: resource.instanceId || resource.subTitle || resource.regionId || (connected ? "已接入" : "未接入"),
      icon: resource.icon || entityIcon(type),
      domain: type,
      group,
      status: connected ? resource.status || "ok" : resource.status || "warn",
      connected,
      layer: Number(resource.layer ?? index),
      rank: Number(resource.rank ?? resource.layer ?? index),
      color: resource.color || entityColor(type),
      metric: resource.metric || { label: connected ? "状态" : "接入", value: connected ? "connected" : "pending" },
      descriptions: resource.descriptions || [
        { label: "地域", value: resource.regionId || "cn-hangzhou" },
        { label: "接入状态", value: connected ? "已接入" : "未接入" },
      ],
      datasets: {
        resource_id: resource.id,
        resource_type: type,
        region_id: resource.regionId,
        connected,
        ...resource.datasets,
      },
      tags: [group, type, connected ? "connected" : "unconnected"].filter(Boolean),
      size: resource.size || { width: 240, height: 118 },
    },
  };
}

function mergeCloudResourceQueryResults(results = []) {
  return results.reduce((merged, result) => ({
    connectedResources: [...merged.connectedResources, ...result.connectedResources],
    unconnectedResources: [...merged.unconnectedResources, ...result.unconnectedResources],
    connections: [...merged.connections, ...result.connections],
    globalTopology: result.globalTopology || merged.globalTopology,
    global: result.global || merged.global,
    meta: { ...merged.meta, ...result.meta },
  }), {
    connectedResources: [],
    unconnectedResources: [],
    connections: [],
    globalTopology: null,
    global: null,
    meta: {},
  });
}

function normalizeGlobalQueryResult(result = {}) {
  result = result || {};
  if (result.nodes && result.edges) return result;
  return {
    entityCountMap: result.entityCountMap || result.countMap || {},
    entitySetMap: result.entitySetMap || result.setMap || {},
    relations: result.relations || result.edges || [],
  };
}

function normalizeResources(resources = []) {
  return toArray(resources).map((resource, index) => {
    const data = resource.data || resource;
    return {
      id: resource.id || data.id || data.resourceId || data.instanceId || `cloud-resource:${index}`,
      name: data.name || data.title,
      title: data.title,
      instanceId: data.instanceId || data.resourceId,
      type: data.type || data.resourceType || data.domain,
      nodeType: data.nodeType,
      layer: data.layer,
      rank: data.rank,
      group: data.group,
      metric: data.metric,
      status: data.status,
      regionId: data.regionId,
      datasets: data.datasets,
      descriptions: data.descriptions,
      size: data.size,
      color: data.color,
      icon: data.icon,
    };
  });
}

function normalizeConnections(connections = []) {
  return toArray(connections).map((edge, index) => ({
    id: edge.id || `cloud-query-edge:${edge.source}:to:${edge.target}:${index}`,
    source: edge.source,
    target: edge.target,
    label: edge.label || edge.name || "关联",
    status: edge.status || edge.data?.status,
    latency: edge.latency || edge.data?.latency,
    traffic: edge.traffic || edge.data?.traffic,
    metricTitle: edge.metricTitle || edge.data?.metricTitle,
    data: edge.data,
  })).filter((edge) => edge.source && edge.target);
}

async function callMaybe(fn, arg) {
  if (typeof fn !== "function") return null;
  return fn(arg);
}

function cloneQueryResult(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function defaultCacheKey(scope, query) {
  return `${scope}:${JSON.stringify(query || {})}`;
}

function toEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  return Object.entries(value || {});
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  return [value];
}

function normalizeGlobalId(value) {
  const text = String(value);
  return text.startsWith("global:") ? text : `global:${text}`;
}

function entityTitle(type) {
  return {
    slb: "负载均衡",
    ecs: "ECS 实例",
    rds: "RDS 数据库",
    redis: "Redis 缓存",
    oss: "OSS 存储",
    fc: "函数计算",
  }[type] || String(type).toUpperCase();
}

function entityIcon(type) {
  return {
    slb: "LB",
    ecs: "EC",
    rds: "DB",
    redis: "KV",
    oss: "OS",
    fc: "FC",
  }[type] || "CR";
}

function entityColor(type) {
  return {
    slb: "#0ea5e9",
    ecs: "#2563eb",
    rds: "#dc2626",
    redis: "#16a34a",
    oss: "#d97706",
    fc: "#9333ea",
  }[type] || "#475467";
}

function inferResourceGroup(type) {
  if (["rds", "redis", "oss"].includes(type)) return "storage";
  if (["slb", "alb", "vpc"].includes(type)) return "gateway";
  return "compute";
}
