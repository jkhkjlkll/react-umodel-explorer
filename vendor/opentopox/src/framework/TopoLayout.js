const DEFAULT_OPTIONS = {
  topoType: "dot",
  rankDir: "LR",
  rankSep: 220,
  nodeSep: 54,
  clusterSpacing: 320,
  layerSpacing: 150,
  autoWorker: true,
  workerNodeLimit: 1000,
  workerTotalElementLimit: 2500,
  workerTimeoutMs: 4000,
};

const layoutExecutors = new Map();
let workerSequence = 0;

export class TopoLayout {
  constructor({ options = {} } = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.activeWorkerJob = null;
  }

  groupLayout({ mainGraph = { nodes: [], edges: [] }, subGraphs = [] } = {}) {
    const padding = this.options.groupPadding ?? 42;
    const subGraphById = new Map(subGraphs.map((subGraph) => [subGraph.id, subGraph]));
    const subGraphLayouts = new Map();

    for (const subGraph of subGraphs) {
      const subLayout = new TopoLayout({
        options: {
          ...this.options,
          topoType: this.options.subGraphTopoType || "dot",
          rankDir: this.options.subGraphRankDir || "TB",
          rankSep: this.options.subGraphRankSep || 150,
          nodeSep: this.options.subGraphNodeSep || 36,
        },
      });
      const laidOut = subLayout.executeSync({ nodes: subGraph.nodes || [], edges: subGraph.edges || [] });
      const bounds = getLayoutBounds(laidOut.nodes);
      const children = laidOut.nodes.map((node) => ({
        ...node,
        parentId: subGraph.id,
        extent: "parent",
        expandParent: true,
        position: {
          x: Math.round((node.position?.x ?? 0) - bounds.x + padding),
          y: Math.round((node.position?.y ?? 0) - bounds.y + padding),
        },
      }));
      subGraphLayouts.set(subGraph.id, {
        ...laidOut,
        children,
        width: Math.max(300, bounds.width + padding * 2),
        height: Math.max(180, bounds.height + padding * 2),
      });
    }

    const mainNodes = (mainGraph.nodes || []).map((node) => {
      const subGraph = subGraphById.get(node.id);
      const subLayout = subGraphLayouts.get(node.id);
      if (!subGraph || !subLayout) return node;
      return {
        ...node,
        type: node.type || "groupNodeWithHandles",
        data: {
          ...node.data,
          isParent: true,
          label: node.data?.label || node.data?.title || subGraph.label || node.id,
          groupNodeIds: (subGraph.nodes || []).map((child) => child.id),
        },
        style: {
          ...node.style,
          width: subLayout.width,
          height: subLayout.height,
        },
        draggable: false,
      };
    });
    const mainLayout = this.dagreLayout({ nodes: mainNodes, edges: mainGraph.edges || [] });
    const mainById = new Map(mainLayout.nodes.map((node) => [node.id, node]));
    const parent = [];
    const nodes = [];

    for (const node of mainLayout.nodes) {
      if (subGraphLayouts.has(node.id)) {
        parent.push({
          ...node,
          type: node.type || "groupNodeWithHandles",
          data: {
            ...node.data,
            isParent: true,
          },
        });
        nodes.push(...subGraphLayouts.get(node.id).children);
      } else {
        nodes.push(node);
      }
    }

    const edges = [
      ...(mainGraph.edges || []),
      ...subGraphs.flatMap((subGraph) => subGraph.edges || []),
    ];
    const layerById = computeRanks(mainLayout.nodes, mainGraph.edges || []);
    const maxLayer = Math.max(...[...layerById.values()], 0);
    const fitLayers = new Set([maxLayer, maxLayer - 1].filter((layer) => layer >= 0));

    return {
      parent,
      nodes,
      edges,
      fitViewNodes: [...mainById.values()].filter((node) => fitLayers.has(layerById.get(node.id) || 0)),
    };
  }

  async execute({ nodes = [], edges = [], innerFunc = null, clearStatus = false } = {}) {
    const topoType = this.options.topoType || "dot";
    const executor = layoutExecutors.get(topoType) || this.options.executor;
    if (typeof executor === "function") {
      const result = await executor({
        nodes,
        edges,
        options: { ...this.options },
        innerFunc,
        clearStatus,
        fallback: () => this.executeSync({ nodes, edges, innerFunc, clearStatus }),
      });
      return normalizeLayoutResult(result, { edges });
    }
    const workerMode = resolveWorkerMode({ nodes, edges, options: this.options, topoType });
    if (workerMode.enabled) {
      try {
        return await this.executeInWorker({ nodes, edges, clearStatus, workerMode });
      } catch (error) {
        if (error?.cancelled) throw error;
        if (this.options.workerFallback === false) throw error;
        return {
          ...this.executeSync({ nodes, edges, innerFunc, clearStatus }),
          meta: {
            autoWorker: workerMode.auto,
            worker: false,
            fallbackReason: error?.message || "worker layout failed",
          },
        };
      }
    }
    return this.executeSync({ nodes, edges, innerFunc, clearStatus });
  }

  cancelWorkerLayout(reason = "Layout worker cancelled") {
    const job = this.activeWorkerJob;
    if (!job) return false;
    this.activeWorkerJob = null;
    globalThis.clearTimeout(job.timer);
    job.worker.terminate();
    job.reject(createLayoutCancelError(reason));
    return true;
  }

  executeInWorker({ nodes = [], edges = [], clearStatus = false, workerMode = {} } = {}) {
    if (typeof Worker === "undefined" && !this.options.workerFactory) {
      return Promise.reject(new Error("Worker is not available in this runtime"));
    }
    this.cancelWorkerLayout("Layout worker cancelled by a newer request");
    const id = `layout-${Date.now()}-${workerSequence += 1}`;
    const timeoutMs = this.options.workerTimeoutMs ?? 4000;
    const workerTopoType = resolveWorkerTopoType(this.options);
    const worker = this.options.workerFactory?.()
      || new Worker(resolveDefaultLayoutWorkerUrl(this.options.workerUrl), { type: "module" });

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        worker.terminate();
        if (this.activeWorkerJob?.id === id) this.activeWorkerJob = null;
        callback(value);
      };
      const timer = globalThis.setTimeout(() => {
        finish(reject, new Error(`Layout worker timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.activeWorkerJob = { id, worker, timer, reject };

      worker.onmessage = (event) => {
        const payload = event.data || {};
        if (payload.id !== id) return;
        if (payload.error) {
          finish(reject, new Error(payload.error));
          return;
        }
        const result = normalizeLayoutResult(payload.result, { edges });
        finish(resolve, {
          ...result,
          meta: {
            ...result.meta,
            autoWorker: Boolean(workerMode.auto),
            workerRequested: true,
            workerNodeLimit: this.options.workerNodeLimit,
            workerTotalElementLimit: this.options.workerTotalElementLimit,
          },
        });
      };
      worker.onerror = (error) => {
        finish(reject, new Error(error.message || "Layout worker error"));
      };
      worker.postMessage({
        id,
        nodes,
        edges,
        clearStatus,
        options: {
          ...this.options,
          topoType: workerTopoType,
          autoWorker: false,
          useWorker: false,
          executor: undefined,
          workerFactory: undefined,
        },
      });
    });
  }

  executeSync({ nodes = [], edges = [], innerFunc = null, clearStatus = false } = {}) {
    const topoType = this.options.topoType || "dot";
    if (topoType === "fdp") {
      return this.forceLayout({ nodes, edges });
    }
    if (topoType === "layer") {
      return this.layerLayout({ nodes, edges, innerFunc, clearStatus });
    }
    if (topoType === "xyFlow") {
      return this.xyFlowLayout({ nodes, edges, innerFunc, clearStatus });
    }
    if (topoType === "radial") {
      return this.radialLayout({ nodes, edges });
    }
    if (topoType === "grid") {
      return this.gridLayout({ nodes, edges });
    }
    if (topoType === "preset") {
      return this.presetLayout({ nodes, edges });
    }
    if (topoType === "entityFlow") {
      return this.entityFlowLayout({ nodes, edges });
    }
    return this.dagreLayout({ nodes, edges });
  }

  dagreLayout({ nodes, edges }) {
    const rankDir = this.options.rankDir || "LR";
    const ranks = computeRanks(nodes, edges);
    const layers = groupByRank(nodes, ranks);
    orderLayers(layers, ranks, edges);

    const positioned = [];
    for (const [rank, layerNodes] of layers.entries()) {
      const totalSpan = layerNodes.reduce((sum, node) => {
        const size = getNodeSize(node);
        return sum + (rankDir === "LR" ? size.height : size.width);
      }, 0) + Math.max(0, layerNodes.length - 1) * this.options.nodeSep;

      let cursor = -totalSpan / 2;
      for (const node of layerNodes) {
        const size = getNodeSize(node);
        if (rankDir === "LR") {
          positioned.push({
            ...node,
            position: {
              x: rank * this.options.rankSep,
              y: cursor + size.height / 2,
            },
          });
          cursor += size.height + this.options.nodeSep;
        } else {
          positioned.push({
            ...node,
            position: {
              x: cursor + size.width / 2,
              y: rank * this.options.rankSep,
            },
          });
          cursor += size.width + this.options.nodeSep;
        }
      }
    }

    return { nodes: normalizePositions(positioned), edges };
  }

  layerLayout({ nodes, edges, innerFunc, clearStatus }) {
    const rankDir = this.options.rankDir || "LR";
    const buckets = new Map();
    for (const node of nodes) {
      const layer = Number(node.data?.layer ?? node.data?.rank ?? 0);
      if (!buckets.has(layer)) buckets.set(layer, []);
      buckets.get(layer).push(node);
    }

    const keys = [...buckets.keys()].sort((a, b) => a - b);
    const positioned = [];
    for (const layer of keys) {
      const layerNodes = buckets.get(layer).slice().sort((a, b) => {
        return String(a.data?.domain || a.id).localeCompare(String(b.data?.domain || b.id));
      });

      let cursor = 0;
      for (const node of layerNodes) {
        const existing = innerFunc?.getInternalNode?.(node.id);
        const fixed = node.data?.action?.fixed && !clearStatus && existing?.position;
        const size = getNodeSize(node);
        const position = fixed
          ? existing.position
          : rankDir === "LR"
            ? { x: layer * this.options.clusterSpacing, y: cursor }
            : { x: cursor, y: layer * this.options.clusterSpacing };
        positioned.push({ ...node, position });
        cursor += (rankDir === "LR" ? size.height : size.width) + this.options.layerSpacing;
      }
    }

    return { nodes: normalizePositions(positioned), edges };
  }

  xyFlowLayout({ nodes, edges, innerFunc, clearStatus }) {
    const rankGroups = new Map();
    for (const node of nodes) {
      const rank = Number(node.data?.rank ?? 1);
      if (!rankGroups.has(rank)) rankGroups.set(rank, []);
      rankGroups.get(rank).push(node);
    }

    const parent = [];
    const positioned = [];
    let parentY = 0;
    const padding = this.options.groupPadding ?? 50;
    const columnSpacing = this.options.clusterSpacing || 300;
    const rowSpacing = this.options.layerSpacing || 130;
    const rankSpacing = this.options.rankGroupSpacing ?? 96;

    const sortedRanks = [...rankGroups.keys()].sort((a, b) => a - b);
    for (const rank of sortedRanks) {
      const layerGroups = new Map();
      for (const node of rankGroups.get(rank) || []) {
        const layer = Number(node.data?.layer ?? 1);
        if (!layerGroups.has(layer)) layerGroups.set(layer, []);
        layerGroups.get(layer).push(node);
      }

      const sortedLayers = [...layerGroups.keys()].sort((a, b) => a - b);
      const layerIndexByKey = new Map(sortedLayers.map((layer, index) => [layer, index]));
      const parentId = `rank-${rank}`;
      let maxX = 0;
      let maxY = 0;
      const rankNodes = [];

      for (const layer of sortedLayers) {
        const layerNodes = layerGroups.get(layer).slice().sort((a, b) => {
          return String(a.data?.domain || a.id).localeCompare(String(b.data?.domain || b.id));
        });
        const x = padding + (layerIndexByKey.get(layer) || 0) * columnSpacing;
        let cursorY = padding;
        for (const node of layerNodes) {
          const existing = innerFunc?.getInternalNode?.(node.id);
          const fixed = node.data?.action?.fixed && !clearStatus && existing?.position;
          const size = getNodeSize(node);
          const position = fixed
            ? {
                x: Math.max(padding, existing.position.x),
                y: Math.max(padding, existing.position.y),
              }
            : { x, y: cursorY };

          rankNodes.push({
            ...node,
            parentId,
            extent: "parent",
            expandParent: true,
            position,
            data: {
              ...node.data,
              action: {
                ...node.data?.action,
                fixed: Boolean(fixed),
              },
            },
          });
          maxX = Math.max(maxX, position.x + size.width);
          maxY = Math.max(maxY, position.y + size.height);
          cursorY += size.height + rowSpacing;
        }
      }

      const parentWidth = Math.max(280, maxX + padding);
      const parentHeight = Math.max(160, maxY + padding);
      parent.push({
        id: parentId,
        type: "labeledGroupNode",
        draggable: false,
        position: { x: 0, y: parentY },
        data: {
          isParent: true,
          label: rankLabel(rank, rankGroups.get(rank) || []),
          rank,
          zoom: 1,
        },
        style: {
          width: parentWidth,
          height: parentHeight,
        },
      });
      positioned.push(...rankNodes);
      parentY += parentHeight + rankSpacing;
    }

    return normalizeParentLayout({ parent, nodes: positioned, edges });
  }

  radialLayout({ nodes, edges }) {
    if (!nodes.length) return { nodes: [], edges };
    const ranks = computeRanks(nodes, edges);
    const layers = groupByRank(nodes, ranks);
    const positioned = [];
    const center = {
      x: (layers.size + 1) * 160,
      y: (layers.size + 1) * 160,
    };

    for (const [rank, layerNodes] of layers.entries()) {
      const radius = Math.max(1, rank) * (this.options.rankSep || 220);
      const angleStep = (Math.PI * 2) / Math.max(1, layerNodes.length);
      layerNodes.forEach((node, index) => {
        const size = getNodeSize(node);
        const angle = -Math.PI / 2 + index * angleStep + rank * 0.32;
        const position = rank === 0
          ? { x: center.x - size.width / 2, y: center.y - size.height / 2 }
          : {
              x: center.x + Math.cos(angle) * radius - size.width / 2,
              y: center.y + Math.sin(angle) * radius - size.height / 2,
            };
        positioned.push({ ...node, position });
      });
    }

    return { nodes: normalizePositions(positioned), edges };
  }

  gridLayout({ nodes, edges }) {
    if (!nodes.length) return { nodes: [], edges };
    const columns = Math.max(2, Math.ceil(Math.sqrt(nodes.length * 1.6)));
    const positioned = nodes
      .slice()
      .sort((a, b) => {
        const layerDelta = Number(a.data?.layer ?? 0) - Number(b.data?.layer ?? 0);
        return layerDelta || String(a.data?.domain || a.id).localeCompare(String(b.data?.domain || b.id));
      })
      .map((node, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return {
          ...node,
          position: {
            x: column * (this.options.rankSep || 220),
            y: row * (this.options.layerSpacing || 150),
          },
        };
      });

    return { nodes: normalizePositions(positioned), edges };
  }

  presetLayout({ nodes, edges }) {
    const positioned = nodes.map((node) => {
      const position = node.position || node.data?.position || { x: 0, y: 0 };
      return {
        ...node,
        position: {
          x: Number(position.x) || 0,
          y: Number(position.y) || 0,
        },
      };
    });

    return { nodes: normalizePositions(positioned), edges };
  }

  entityFlowLayout({ nodes, edges }) {
    if (!nodes.length) return { nodes: [], edges };

    const graph = buildDirectedMaps(nodes, edges);
    const focus = inferFocusNode(nodes, this.options.focusId);
    const peerIds = findPeerNodeIds(focus, nodes, graph);
    const columns = assignEntityFlowColumns(focus, nodes, graph, peerIds);
    const groups = groupByColumn(nodes, columns);
    const columnSpacing = this.options.columnSpacing || this.options.rankSep || 285;
    const rowSpacing = this.options.rowSpacing ?? this.options.nodeSep ?? 46;
    const positioned = [];
    const centerYById = new Map();

    const maxDistance = Math.max(...[...groups.keys()].map((column) => Math.abs(column)), 0);
    placeEntityCenterColumn(groups.get(0) || [], focus, peerIds, rowSpacing, centerYById, positioned);

    for (let distance = 1; distance <= maxDistance; distance += 1) {
      placeEntityFlowColumn(groups.get(-distance) || [], -distance, columnSpacing, rowSpacing, graph, centerYById, positioned);
      placeEntityFlowColumn(groups.get(distance) || [], distance, columnSpacing, rowSpacing, graph, centerYById, positioned);
    }

    for (const node of nodes) {
      if (!centerYById.has(node.id)) {
        const column = columns.get(node.id) || 0;
        const size = getNodeSize(node);
        const fallbackY = positioned.length * (size.height + rowSpacing);
        positioned.push({
          ...node,
          position: {
            x: column * columnSpacing,
            y: fallbackY,
          },
        });
        centerYById.set(node.id, fallbackY + size.height / 2);
      }
    }

    return {
      nodes: normalizePositions(positioned),
      edges,
    };
  }

  forceLayout({ nodes, edges }) {
    if (nodes.length > 600) {
      return this.gridLayout({ nodes, edges });
    }
    const base = this.dagreLayout({ nodes, edges }).nodes.map((node) => ({
      ...node,
      vx: 0,
      vy: 0,
    }));
    const byId = new Map(base.map((node) => [node.id, node]));
    const links = edges
      .map((edge) => ({ source: byId.get(edge.source), target: byId.get(edge.target) }))
      .filter((edge) => edge.source && edge.target);

    const iterations = nodes.length > 100 ? 72 : nodes.length > 25 ? 120 : 180;
    for (let tick = 0; tick < iterations; tick += 1) {
      const cooling = 1 - tick / iterations;

      for (let i = 0; i < base.length; i += 1) {
        for (let j = i + 1; j < base.length; j += 1) {
          const a = base[i];
          const b = base[j];
          const dx = a.position.x - b.position.x || 1;
          const dy = a.position.y - b.position.y || 1;
          const distanceSq = Math.max(1200, dx * dx + dy * dy);
          const force = 5200 / distanceSq;
          a.vx += dx * force * cooling;
          a.vy += dy * force * cooling;
          b.vx -= dx * force * cooling;
          b.vy -= dy * force * cooling;
        }
      }

      for (const link of links) {
        const dx = link.target.position.x - link.source.position.x;
        const dy = link.target.position.y - link.source.position.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const desired = 220;
        const force = (distance - desired) * 0.012 * cooling;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        link.source.vx += fx;
        link.source.vy += fy;
        link.target.vx -= fx;
        link.target.vy -= fy;
      }

      for (const node of base) {
        node.position.x += node.vx;
        node.position.y += node.vy;
        node.vx *= 0.72;
        node.vy *= 0.72;
      }
    }

    return {
      nodes: normalizePositions(base.map(({ vx, vy, ...node }) => node)),
      edges,
    };
  }
}

export function registerLayoutExecutor(type, executor) {
  if (!type || typeof executor !== "function") throw new Error("registerLayoutExecutor requires a layout type and executor");
  layoutExecutors.set(type, executor);
  return () => layoutExecutors.delete(type);
}

export function unregisterLayoutExecutor(type) {
  layoutExecutors.delete(type);
}

export function getRegisteredLayoutExecutors() {
  return [...layoutExecutors.keys()];
}

export function createGraphvizLayoutExecutor({ layout, fallbackType = "dot" } = {}) {
  if (typeof layout !== "function") throw new Error("createGraphvizLayoutExecutor requires a layout function");
  return async ({ nodes, edges, options, fallback }) => {
    const result = await layout({
      nodes,
      edges,
      options: {
        ...options,
        engine: options.engine || options.graphvizEngine || options.topoType || fallbackType,
      },
    });
    return result || fallback();
  };
}

export function createDagreLayoutExecutor({ topoType = "dot" } = {}) {
  return ({ nodes, edges, options }) => {
    const result = new TopoLayout({
      options: {
        ...options,
        topoType,
        executor: undefined,
      },
    }).executeSync({ nodes, edges });
    return {
      ...result,
      meta: {
        ...result.meta,
        executor: "dagre",
        topoType,
      },
    };
  };
}

export function createDotLayoutExecutor({ engine = "dot" } = {}) {
  return ({ nodes, edges, options }) => {
    const dotSource = options.dotSource || options.dot || "";
    const selectedEngine = options.engine || options.graphvizEngine || engine || "dot";
    const graph = dotSource ? parseDotGraph(dotSource, options) : { nodes, edges };
    const result = new TopoLayout({
      options: {
        ...options,
        topoType: resolveGraphvizEngine(selectedEngine),
        executor: undefined,
        dotSource: undefined,
        dot: undefined,
      },
    }).executeSync(graph);
    return {
      ...result,
      meta: {
        ...result.meta,
        executor: "dot",
        engine: selectedEngine,
        dotSource: Boolean(dotSource),
      },
    };
  };
}

export function parseDotGraph(dotSource = "", { nodeType = "cardNode" } = {}) {
  const nodesById = new Map();
  const edges = [];
  const body = stripDotComments(String(dotSource))
    .replace(/^[^{]*\{/, "")
    .replace(/\}\s*$/, "");
  const statements = body.split(";").map((statement) => statement.trim()).filter(Boolean);

  const ensureNode = (id, attrs = {}) => {
    if (!id) return null;
    if (!nodesById.has(id)) {
      nodesById.set(id, dotNodeToTopologyNode(id, attrs, nodeType));
      return nodesById.get(id);
    }
    const existing = nodesById.get(id);
    nodesById.set(id, {
      ...existing,
      data: {
        ...existing.data,
        ...dotAttrsToData(attrs, id),
      },
    });
    return nodesById.get(id);
  };

  for (const statement of statements) {
    if (/^(graph|node|edge)\s*\[/.test(statement) || /^[a-zA-Z_][\w-]*\s*=/.test(statement)) {
      continue;
    }
    if (statement.includes("->")) {
      const parts = statement.split("->").map((part) => part.trim()).filter(Boolean);
      for (let index = 0; index < parts.length - 1; index += 1) {
        const source = parseDotEndpoint(parts[index]);
        const target = parseDotEndpoint(parts[index + 1]);
        ensureNode(source.id, source.attrs);
        ensureNode(target.id, target.attrs);
        edges.push({
          id: target.attrs.id || `dot-edge:${source.id}:to:${target.id}:${edges.length}`,
          source: source.id,
          target: target.id,
          label: target.attrs.label || "",
          data: {
            status: target.attrs.status || "ok",
            latency: target.attrs.latency,
            traffic: target.attrs.traffic,
            metricTitle: target.attrs.metricTitle,
          },
        });
      }
      continue;
    }
    const node = parseDotEndpoint(statement);
    ensureNode(node.id, node.attrs);
  }

  return {
    nodes: [...nodesById.values()],
    edges,
  };
}

registerLayoutExecutor("dagre", createDagreLayoutExecutor({ topoType: "dot" }));
registerLayoutExecutor("graphvizDot", createDotLayoutExecutor({ engine: "dot" }));
registerLayoutExecutor("graphvizFdp", createDotLayoutExecutor({ engine: "fdp" }));

export function getNodeSize(node) {
  const baseSize = getNodeBaseSize(node);
  const measuredSize = node?.__topoMeasuredSize;
  if (!measuredSize || typeof measuredSize !== "object") return baseSize;
  const measuredWidth = Number(measuredSize.width);
  const measuredHeight = Number(measuredSize.height);
  return {
    width: Number.isFinite(measuredWidth) ? Math.max(Number(baseSize.width) || 0, measuredWidth) : baseSize.width,
    height: Number.isFinite(measuredHeight) ? Math.max(Number(baseSize.height) || 0, measuredHeight) : baseSize.height,
  };
}

export function getNodeBaseSize(node) {
  const size = node.data?.size || node.style?.size;
  if (Array.isArray(size)) return { width: size[0], height: size[1] };
  if (size && typeof size === "object") return { width: size.width, height: size.height };
  if (Number.isFinite(node.style?.width) || Number.isFinite(node.style?.height)) {
    return {
      width: Number(node.style?.width) || 280,
      height: Number(node.style?.height) || 140,
    };
  }
  if (node.type === "planNode") return { width: 600, height: node.data?.summary ? 118 : 86 };
  if (node.type === "cardLayerNode") return { width: 220, height: node.data?.descriptions?.length ? 116 : 86 };
  if (node.type === "componentNode") return { width: 220, height: node.data?.summary ? 104 : 76 };
  if (node.type === "agentRunNode") return { width: 230, height: node.data?.metric ? 92 : 76 };
  if (node.type === "agentStepNode") return { width: 250, height: node.data?.summary ? 104 : 78 };
  if (["toolCallNode", "mcpServerNode", "skillNode", "artifactNode", "contextNode"].includes(node.type)) return { width: 210, height: node.data?.metric ? 90 : 72 };
  if (node.type === "operatorNode" || node.type === "inputSourceNode" || node.type === "sinkNode") return { width: 190, height: 74 };
  if (node.data?.isParent || node.type === "labeledGroupNode" || node.type === "groupNodeWithHandles") return { width: 280, height: 140 };
  return { width: 230, height: node.data?.metric ? 90 : 76 };
}

function stripDotComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "");
}

function parseDotEndpoint(statement) {
  const attrMatch = statement.match(/\[([\s\S]*)\]\s*$/);
  const attrs = attrMatch ? parseDotAttributes(attrMatch[1]) : {};
  const rawId = attrMatch ? statement.slice(0, attrMatch.index).trim() : statement.trim();
  return {
    id: cleanDotId(rawId),
    attrs,
  };
}

function parseDotAttributes(source = "") {
  const attrs = {};
  const pattern = /([a-zA-Z_][\w-]*)\s*=\s*("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|[^,\]]+)/g;
  let match = pattern.exec(source);
  while (match) {
    attrs[match[1]] = cleanDotId(match[2]);
    match = pattern.exec(source);
  }
  return attrs;
}

function cleanDotId(value = "") {
  return String(value)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function dotNodeToTopologyNode(id, attrs = {}, nodeType = "cardNode") {
  return {
    id,
    type: attrs.type || attrs.nodeType || nodeType,
    data: dotAttrsToData(attrs, id),
  };
}

function dotAttrsToData(attrs = {}, id = "") {
  const layer = Number(attrs.layer ?? attrs.rank ?? 0);
  return {
    title: attrs.title || attrs.label || id,
    subTitle: attrs.subTitle || attrs.subtitle || attrs.domain || "",
    icon: attrs.icon || "DOT",
    domain: attrs.domain || attrs.group || "dot",
    group: attrs.group || attrs.domain || "compute",
    status: attrs.status || "ok",
    layer: Number.isFinite(layer) ? layer : 0,
    rank: Number.isFinite(layer) ? layer : 0,
    color: attrs.color,
    metric: attrs.metricLabel || attrs.metricValue
      ? { label: attrs.metricLabel || "metric", value: attrs.metricValue || "" }
      : undefined,
  };
}

function resolveGraphvizEngine(engine = "dot") {
  const normalized = String(engine || "dot").toLowerCase();
  if (normalized === "fdp" || normalized === "sfdp") return "fdp";
  return "dot";
}

function buildDirectedMaps(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, []]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge.target);
    incoming.get(edge.target).push(edge.source);
  }

  return { incoming, outgoing };
}

function resolveWorkerTopoType(options = {}) {
  if (options.workerTopoType) return options.workerTopoType;
  if (options.topoType === "worker" || options.topoType === "workerDot") return "dot";
  if (options.topoType === "workerFdp") return "fdp";
  if (options.topoType === "fdp" && options.largeGraphEngine === "sfdp") return "fdp";
  return options.topoType || "dot";
}

function resolveDefaultLayoutWorkerUrl(workerUrl) {
  if (workerUrl) return workerUrl;
  const moduleUrl = import.meta.url;
  if (moduleUrl) return new URL("./layout.worker.js", moduleUrl);
  return "./layout.worker.js";
}

function resolveWorkerMode({ nodes = [], edges = [], options = {}, topoType = "dot" } = {}) {
  const explicitWorker = options.useWorker || topoType === "worker" || topoType === "workerDot" || topoType === "workerFdp";
  if (explicitWorker) return { enabled: true, auto: false };
  if (options.autoWorker === false || options.useWorker === false) return { enabled: false, auto: false };
  if (typeof Worker === "undefined" && !options.workerFactory) return { enabled: false, auto: true };
  const nodeLimit = options.workerNodeLimit ?? DEFAULT_OPTIONS.workerNodeLimit;
  const totalElementLimit = options.workerTotalElementLimit ?? DEFAULT_OPTIONS.workerTotalElementLimit;
  const shouldUseWorker = nodes.length >= nodeLimit || nodes.length + edges.length >= totalElementLimit;
  return { enabled: shouldUseWorker, auto: shouldUseWorker };
}

function createLayoutCancelError(reason) {
  const error = new Error(reason);
  error.cancelled = true;
  return error;
}

function normalizeLayoutResult(result, { edges = [] } = {}) {
  if (!result) return { nodes: [], edges };
  return {
    parent: result.parent || [],
    nodes: result.nodes || [],
    edges: result.edges || edges,
    fitViewNodes: result.fitViewNodes,
    meta: result.meta || {},
  };
}

function inferFocusNode(nodes, focusId) {
  const explicit = focusId ? nodes.find((node) => node.id === focusId) : null;
  if (explicit) return explicit;

  const tagged = nodes.find((node) => node.data?.focused || node.data?.tags?.includes("focus"));
  if (tagged) return tagged;

  return nodes[0];
}

function findPeerNodeIds(focus, nodes, graph) {
  const focusIncoming = new Set(graph.incoming.get(focus.id) || []);
  const focusOutgoing = new Set(graph.outgoing.get(focus.id) || []);
  const peers = new Set();

  for (const node of nodes) {
    if (node.id === focus.id) continue;
    const sameKind = node.data?.domain === focus.data?.domain || node.data?.group === focus.data?.group;
    if (!sameKind) continue;

    const sharesIncoming = (graph.incoming.get(node.id) || []).some((id) => focusIncoming.has(id));
    const sharesOutgoing = (graph.outgoing.get(node.id) || []).some((id) => focusOutgoing.has(id));
    if (sharesIncoming || sharesOutgoing) peers.add(node.id);
  }

  return peers;
}

function assignEntityFlowColumns(focus, nodes, graph, peerIds) {
  const columns = new Map([[focus.id, 0]]);
  for (const id of peerIds) columns.set(id, 0);

  const seeds = [focus.id, ...peerIds];
  const upstreamQueue = [...seeds];
  while (upstreamQueue.length) {
    const id = upstreamQueue.shift();
    const baseColumn = columns.get(id) || 0;
    for (const source of graph.incoming.get(id) || []) {
      if (peerIds.has(source)) continue;
      const nextColumn = baseColumn - 1;
      if (!columns.has(source) || nextColumn < columns.get(source)) {
        columns.set(source, nextColumn);
        upstreamQueue.push(source);
      }
    }
  }

  const downstreamQueue = [...seeds];
  while (downstreamQueue.length) {
    const id = downstreamQueue.shift();
    const baseColumn = columns.get(id) || 0;
    for (const target of graph.outgoing.get(id) || []) {
      if (target === focus.id || peerIds.has(target)) continue;
      const isTerminalLeaf = !(graph.outgoing.get(target) || []).length;
      const nextColumn = isTerminalLeaf && baseColumn >= 2 ? baseColumn : baseColumn + 1;
      if (!columns.has(target) || nextColumn > columns.get(target)) {
        columns.set(target, nextColumn);
        downstreamQueue.push(target);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (columns.has(node.id)) continue;

      const sourceColumns = (graph.incoming.get(node.id) || [])
        .map((id) => columns.get(id))
        .filter((column) => Number.isFinite(column));
      const targetColumns = (graph.outgoing.get(node.id) || [])
        .map((id) => columns.get(id))
        .filter((column) => Number.isFinite(column));

      if (sourceColumns.length) {
        const maxSource = Math.max(...sourceColumns);
        columns.set(node.id, maxSource < 0 ? maxSource : maxSource + 1);
        changed = true;
      } else if (targetColumns.length) {
        const minTarget = Math.min(...targetColumns);
        const maxTarget = Math.max(...targetColumns);
        columns.set(node.id, minTarget > 0 ? minTarget - 1 : maxTarget - 1);
        changed = true;
      }
    }
  }

  const focusLayer = Number(focus.data?.layer ?? focus.data?.rank ?? 0);
  for (const node of nodes) {
    if (columns.has(node.id)) continue;
    const nodeLayer = Number(node.data?.layer ?? node.data?.rank ?? focusLayer + 1);
    const fallbackColumn = nodeLayer - focusLayer;
    columns.set(node.id, fallbackColumn === 0 ? 1 : fallbackColumn);
  }

  return columns;
}

function groupByColumn(nodes, columns) {
  const groups = new Map();
  for (const node of nodes) {
    const column = columns.get(node.id) || 0;
    if (!groups.has(column)) groups.set(column, []);
    groups.get(column).push(node);
  }
  return groups;
}

function placeEntityCenterColumn(nodes, focus, peerIds, rowSpacing, centerYById, positioned) {
  const focusSize = getNodeSize(focus);
  positioned.push({
    ...focus,
    position: {
      x: 0,
      y: -focusSize.height / 2,
    },
  });
  centerYById.set(focus.id, 0);

  const peers = nodes
    .filter((node) => node.id !== focus.id && peerIds.has(node.id))
    .sort(stableEntityFlowSort);

  let upperOffset = focusSize.height / 2 + rowSpacing;
  let lowerOffset = focusSize.height / 2 + rowSpacing;
  peers.forEach((node, index) => {
    const size = getNodeSize(node);
    const placeAbove = index % 2 === 0;
    const centerY = placeAbove
      ? -(upperOffset + size.height / 2)
      : lowerOffset + size.height / 2;
    if (placeAbove) {
      upperOffset += size.height + rowSpacing;
    } else {
      lowerOffset += size.height + rowSpacing;
    }
    positioned.push({
      ...node,
      position: {
        x: 0,
        y: centerY - size.height / 2,
      },
    });
    centerYById.set(node.id, centerY);
  });

  const others = nodes
    .filter((node) => node.id !== focus.id && !peerIds.has(node.id))
    .sort(stableEntityFlowSort);
  let lowerStack = lowerOffset;
  for (const node of others) {
    const size = getNodeSize(node);
    const centerY = lowerStack + size.height / 2;
    positioned.push({
      ...node,
      position: {
        x: 0,
        y: centerY - size.height / 2,
      },
    });
    centerYById.set(node.id, centerY);
    lowerStack += size.height + rowSpacing;
  }
}

function placeEntityFlowColumn(nodes, column, columnSpacing, rowSpacing, graph, centerYById, positioned) {
  if (!nodes.length) return;

  const withAnchors = nodes
    .map((node) => ({
      node,
      anchor: getEntityFlowAnchor(node, graph, centerYById),
    }))
    .sort((a, b) => {
      return a.anchor - b.anchor || stableEntityFlowSort(a.node, b.node);
    });

  const baseCenter = median(withAnchors.map((item) => item.anchor));
  const totalHeight = withAnchors.reduce((sum, item) => sum + getNodeSize(item.node).height, 0)
    + Math.max(0, withAnchors.length - 1) * rowSpacing;
  let cursor = baseCenter - totalHeight / 2;

  for (const item of withAnchors) {
    const size = getNodeSize(item.node);
    const y = cursor;
    positioned.push({
      ...item.node,
      position: {
        x: column * columnSpacing,
        y,
      },
    });
    centerYById.set(item.node.id, y + size.height / 2);
    cursor += size.height + rowSpacing;
  }
}

function getEntityFlowAnchor(node, graph, centerYById) {
  const connected = [
    ...(graph.incoming.get(node.id) || []),
    ...(graph.outgoing.get(node.id) || []),
  ]
    .map((id) => centerYById.get(id))
    .filter((value) => Number.isFinite(value));

  return connected.length ? median(connected) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stableEntityFlowSort(a, b) {
  return domainSortValue(a) - domainSortValue(b)
    || Number(a.data?.layer ?? a.data?.rank ?? 0) - Number(b.data?.layer ?? b.data?.rank ?? 0)
    || String(a.data?.title || a.id).localeCompare(String(b.data?.title || b.id))
    || String(a.id).localeCompare(String(b.id));
}

function domainSortValue(node) {
  const domain = String(node.data?.domain || node.data?.group || "").toLowerCase();
  const weights = {
    external: 10,
    gateway: 15,
    loadbalancer: 20,
    network: 80,
    ecs: 30,
    redis: 35,
    rds: 45,
    database: 45,
    log: 70,
    metric: 75,
    alert: 85,
    notify: 95,
  };
  return weights[domain] ?? 50;
}

function computeRanks(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const queue = nodes.filter((node) => !indegree.get(node.id)).map((node) => node.id);
  const ranks = new Map(nodes.map((node) => [node.id, Number(node.data?.rank ?? 0)]));
  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    for (const target of outgoing.get(id) || []) {
      ranks.set(target, Math.max(ranks.get(target) || 0, (ranks.get(id) || 0) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }

  return ranks;
}

function groupByRank(nodes, ranks) {
  const layers = new Map();
  for (const node of nodes) {
    const rank = ranks.get(node.id) || 0;
    if (!layers.has(rank)) layers.set(rank, []);
    layers.get(rank).push(node);
  }
  return new Map([...layers.entries()].sort((a, b) => a[0] - b[0]));
}

function orderLayers(layers, ranks, edges) {
  const inbound = new Map();
  for (const edge of edges) {
    if (!inbound.has(edge.target)) inbound.set(edge.target, []);
    inbound.get(edge.target).push(edge.source);
  }

  for (const [rank, nodes] of layers.entries()) {
    nodes.sort((a, b) => {
      const aParents = inbound.get(a.id) || [];
      const bParents = inbound.get(b.id) || [];
      const aScore = aParents.reduce((sum, id) => sum + (ranks.get(id) || 0), 0) / Math.max(1, aParents.length);
      const bScore = bParents.reduce((sum, id) => sum + (ranks.get(id) || 0), 0) / Math.max(1, bParents.length);
      return aScore - bScore || String(a.data?.title || a.id).localeCompare(String(b.data?.title || b.id));
    });
    layers.set(rank, nodes);
  }
}

function rankLabel(rank, nodes) {
  const explicit = nodes.find((node) => node.data?.rankLabel)?.data?.rankLabel;
  if (explicit) return explicit;
  const domains = new Set(nodes.map((node) => node.data?.domain || node.data?.group).filter(Boolean));
  return domains.size ? `Rank ${rank} - ${[...domains].join(" / ")}` : `Rank ${rank}`;
}

function normalizeParentLayout({ parent, nodes, edges }) {
  if (!parent.length) return { nodes: normalizePositions(nodes), edges };
  const minX = Math.min(...parent.map((node) => node.position?.x ?? 0), 0);
  const minY = Math.min(...parent.map((node) => node.position?.y ?? 0), 0);
  const offsetX = -minX + 80;
  const offsetY = -minY + 80;
  return {
    parent: parent.map((node) => ({
      ...node,
      position: {
        x: Math.round((node.position?.x ?? 0) + offsetX),
        y: Math.round((node.position?.y ?? 0) + offsetY),
      },
    })),
    nodes: nodes.map((node) => ({
      ...node,
      position: {
        x: Math.round(node.position?.x ?? 0),
        y: Math.round(node.position?.y ?? 0),
      },
    })),
    edges,
  };
}

function getLayoutBounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const size = getNodeSize(node);
    minX = Math.min(minX, node.position?.x ?? 0);
    minY = Math.min(minY, node.position?.y ?? 0);
    maxX = Math.max(maxX, (node.position?.x ?? 0) + size.width);
    maxY = Math.max(maxY, (node.position?.y ?? 0) + size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalizePositions(nodes) {
  const minX = Math.min(...nodes.map((node) => node.position?.x ?? 0), 0);
  const minY = Math.min(...nodes.map((node) => node.position?.y ?? 0), 0);
  return nodes.map((node) => ({
    ...node,
    position: {
      x: Math.round((node.position?.x ?? 0) - minX + 80),
      y: Math.round((node.position?.y ?? 0) - minY + 80),
    },
  }));
}
