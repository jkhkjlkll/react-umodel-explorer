import { TopoLayout, getNodeBaseSize, getNodeSize } from "./TopoLayout.js";
import {
  createTopologyContext,
  formatTopologyContextAsMarkdown,
  getVisibleGraphData as getVisibleTopologyGraphData,
  serializeTopologyContext,
} from "./TopologyContextBridge.js";
import { getEdgeShape, getNodeShape, registerEdgeShape, registerNodeShape } from "./Registry.js";
import { validateGraphData } from "./TopologyGraphStore.js";
import { FlowControls } from "./FlowControls.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let graphInstanceSeed = 0;

export class NewTopoGraph {
  constructor({
    container,
    config = {},
    style = {},
    className = "",
    onLoad,
    handleNodeClick,
    handleEdgeClick,
    handleCloseInfo,
    renderAddNodeModal,
    onDeleteNode,
  }) {
    if (!container) throw new Error("NewTopoGraph requires a container");
    this.container = container;
    this.config = config;
    this.handleNodeClick = handleNodeClick;
    this.handleEdgeClick = handleEdgeClick;
    this.handleCloseInfo = handleCloseInfo;
    this.renderAddNodeModal = renderAddNodeModal;
    this.onDeleteNode = onDeleteNode;
    this.nodes = [];
    this.edges = [];
    this.originData = { nodes: [], edges: [] };
    this.currentFocusId = "";
    this.nodeType = "cardNode";
    this.viewport = { x: 0, y: 0, zoom: 1 };
    this.selected = null;
    this.selection = { nodes: [], edges: [], primary: null };
    this.selectionEnabled = Boolean(config.enableSelection ?? config.selectionEnabled ?? false);
    this.selectionMode = this.selectionEnabled && config.selectionMode === "area" ? "area" : "default";
    this.areaSelection = null;
    this.animate = config.animate ?? true;
    this.userAnimate = this.animate;
    this.performanceMode = false;
    this.autoPerformanceActive = false;
    this.edgeLabelsVisible = true;
    this.userEdgeLabelsVisible = this.edgeLabelsVisible;
    this.autoEdgeLabelsHidden = false;
    this.graphType = config.type || config.graphType || "default";
    this.agentLoopInsertCount = 0;
    this.nodeDraggable = config.nodeDraggable ?? true;
    this.hoverHighlight = config.hoverHighlight ?? true;
    this.hoverHighlightDegree = config.hoverHighlightDegree ?? 1;
    this.effectiveHoverHighlightDegree = this.hoverHighlightDegree;
    this.minimapEnabled = config.minimap ?? false;
    this.controlsEnabled = config.controls ?? config.controlsEnabled ?? false;
    this.controlActions = config.controlActions || ["zoom-out", "zoom-in", "fit", "fullscreen", "minimap"];
    this.controlOrientation = config.controlOrientation || "horizontal";
    this.controlClassName = config.controlClassName || "";
    this.controlZoomStep = config.controlZoomStep ?? 1.22;
    this.gridVisible = config.grid ?? false;
    this.minimapWidth = config.minimapWidth ?? 220;
    this.minimapHeight = config.minimapHeight ?? 150;
    this.minimapEdgeLimit = config.minimapEdgeLimit ?? 1200;
    this.fitViewPadding = config.fitViewPadding ?? 0.15;
    this.minZoom = config.minZoom ?? 0.12;
    this.maxZoom = config.maxZoom ?? 2;
    this.zoomSensitivity = config.zoomSensitivity ?? 0.0045;
    this.edgeRouting = config.edgeRouting || "default";
    this.performanceEdgeLabelLimit = config.performanceEdgeLabelLimit ?? 60;
    this.autoPerformanceMode = config.autoPerformanceMode ?? true;
    this.performanceNodeLimit = config.performanceNodeLimit ?? 1000;
    this.performanceTotalElementLimit = config.performanceTotalElementLimit ?? 2500;
    this.hideEdgesOnViewportMove = config.hideEdgesOnViewportMove ?? true;
    this.viewportInteractionSettleMs = config.viewportInteractionSettleMs ?? 220;
    this.canvasEdges = config.canvasEdges ?? true;
    this.canvasEdgeThreshold = config.canvasEdgeThreshold ?? 2000;
    this.canvasEdgePixelRatio = config.canvasEdgePixelRatio ?? 1.5;
    this.validateData = config.validateData ?? true;
    this.allowedNodeTypes = config.allowedNodeTypes || [];
    this.throwOnInvalid = config.throwOnInvalid ?? false;
    this.onValidation = config.onValidation;
    this.onValidationError = config.onValidationError;
    this.lightStructurePatch = config.lightStructurePatch ?? true;
    this.lightStructureNodeLimit = config.lightStructureNodeLimit ?? 6;
    this.lightStructureEdgeLimit = config.lightStructureEdgeLimit ?? 24;
    this.debugPanelEnabled = config.debugPanel ?? false;
    this.debugMetrics = {};
    this.lastRenderStats = { nodes: 0, edges: 0, durationMs: 0, performanceMode: false };
    this.layoutVersion = 0;
    this.viewportTimer = null;
    this.viewportInteractionTimer = null;
    this.nodeElementById = new Map();
    this.edgeElementById = new Map();
    this.nodeById = new Map();
    this.edgeById = new Map();
    this.edgeIdsByNodeId = new Map();
    this.childrenByParentId = new Map();
    this.renderedSelection = { nodes: new Set(), edges: new Set(), primary: null };
    this.renderedHover = { nodes: new Set(), edges: new Set() };
    this.edgeRenderFrame = null;
    this.edgeCanvasFrame = null;
    this.pendingEdgeRenderIds = null;
    this.pendingEdgeGeometryOnly = false;
    this.hoverRenderFrame = null;
    this.minimapRenderFrame = null;
    this.pendingMinimapRenderViewportOnly = false;
    this.minimapStaticDirty = true;
    this.minimapViewportElement = null;
    this.minimapTransform = null;
    this.nodeAnimationFrame = null;
    this.nodeAnimationTimer = null;
    this.pendingNodeAnimation = null;
    this.fullscreenFallback = false;
    this.instanceId = createGraphInstanceId();
    this.edgeMarkerId = `topo-arrow-${this.instanceId}`;
    this.minimapShadowId = `minimap-soft-shadow-${this.instanceId}`;
    this.handleFullscreenChange = () => this.syncFullscreenState();
    this.handleKeydown = (event) => this.handleGraphKeydown(event);
    this.hoverState = null;
    this.suppressNodeClick = null;
    this.isMinimapDragging = false;
    this.layout = new TopoLayout({ options: { topoType: "dot", rankDir: "LR" } });
    this.buildShell(style, className);
    this.setGraphType(this.graphType);
    this.setNodeDraggable(this.nodeDraggable);
    this.setTheme(config.theme || "neutral");
    this.bindCanvasEvents();
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    document.addEventListener("keydown", this.handleKeydown);
    onLoad?.();
  }

  getGraph() {
    return {
      getData: () => this.getData(),
      getGraphData: () => this.getData(),
      getNodes: () => this.getNodes(),
      getEdges: () => this.getEdges(),
      setData: (data) => this.setData(data),
      setGroupData: (data) => this.setGroupData(data),
      updateGraphData: (nodes, edges, options) => this.updateGraphData(nodes, edges, options),
      showOriginData: (options) => this.showOriginData(options),
      handleFocusNode: (id, options) => this.handleFocusNode(id, options),
      reverseData: (options) => this.showOriginData(options),
      getGraphType: () => this.graphType,
      setGraphType: (type) => this.setGraphType(type),
      insertNodeOnEdge: (edgeId, node, options) => this.insertNodeOnEdge(edgeId, node, options),
      deleteNode: (id, options) => this.deleteNode(id, options),
      setLayout: (options, nodeType) => this.setLayout(options, nodeType),
      setAnimateMode: (enabled) => this.setAnimateMode(enabled),
      setPerformanceMode: (enabled) => this.setPerformanceMode(enabled),
      setEdgeLabelsVisible: (enabled) => this.setEdgeLabelsVisible(enabled),
      areEdgeLabelsVisible: () => this.edgeLabelsVisible,
      setNodeDraggable: (enabled) => this.setNodeDraggable(enabled),
      setHoverHighlight: (enabled, options) => this.setHoverHighlight(enabled, options),
      setMinimapVisible: (enabled) => this.setMinimapVisible(enabled),
      isMinimapVisible: () => this.minimapEnabled,
      setGridVisible: (enabled) => this.setGridVisible(enabled),
      setDebugPanelVisible: (enabled) => this.setDebugPanelVisible(enabled),
      isDebugPanelVisible: () => this.debugPanelEnabled,
      updateDebugMetrics: (metrics) => this.updateDebugMetrics(metrics),
      setTheme: (theme) => this.setTheme(theme),
      getOptions: () => this.getOptions(),
      getPluginInstance: (name) => this.getPluginInstance(name),
      render: () => this.render(),
      refreshMeasurements: () => this.refreshMeasurements(),
      registerNodeShape: (type, shape) => registerNodeShape(type, shape),
      registerEdgeShape: (type, shape) => registerEdgeShape(type, shape),
      fitView: (options) => this.fitView(options),
      fitCenter: () => this.fitCenter(),
      zoomTo: (zoom) => this.zoomTo(zoom),
      focusNode: (id) => this.focusNode(id),
      getContainer: () => this.container,
      getRootElement: () => this.root,
      selectNode: (id, options) => this.selectNode(id, options),
      getSelection: () => this.getSelection(),
      setSelection: (selection, options) => this.setSelection(selection, options),
      toggleSelectionItem: (item, options) => this.toggleSelectionItem(item, options),
      clearSelection: (options) => this.clearSelection(options),
      selectArea: (rect, options) => this.selectArea(rect, options),
      selectVisible: (options) => this.selectVisible(options),
      invertSelection: (options) => this.invertSelection(options),
      selectByCriteria: (criteria, options) => this.selectByCriteria(criteria, options),
      setSelectionEnabled: (enabled) => this.setSelectionEnabled(enabled),
      isSelectionEnabled: () => this.isSelectionEnabled(),
      setSelectionMode: (mode) => this.setSelectionMode(mode),
      getSelectionMode: () => this.selectionMode,
      getVisibleGraphData: (options) => this.getVisibleGraphData(options),
      extractContext: (options) => this.extractContext(options),
      copyContext: (options) => this.copyContext(options),
      updateNode: (id, patch) => this.updateNode(id, patch),
      updateNodeData: (id, patch) => this.updateNodeData(id, patch),
      updateEdge: (id, patch) => this.updateEdge(id, patch),
      updateEdgeData: (id, patch) => this.updateEdgeData(id, patch),
      patchGraphData: (patch, options) => this.patchGraphData(patch, options),
      getInternalNode: (id) => this.getInternalNode(id),
      getSelected: () => this.selected ? { ...this.selected } : null,
      getViewport: () => ({ ...this.viewport }),
      setViewport: (viewport) => this.setViewport(viewport),
      getRenderStats: () => ({ ...this.lastRenderStats }),
      isNodeDraggable: () => this.nodeDraggable,
      isGridVisible: () => this.gridVisible,
      isFullscreen: () => this.isFullscreen(),
      setFullscreen: (enabled) => this.setFullscreen(enabled),
      toggleFullscreen: () => this.toggleFullscreen(),
    };
  }

  getData() {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  getNodes() {
    return this.nodes.map((node) => cloneGraphItem(node));
  }

  getEdges() {
    return this.edges.map((edge) => cloneGraphItem(edge));
  }

  setLayout(options = {}, nodeType) {
    this.layout.cancelWorkerLayout?.("Layout replaced");
    this.layout = new TopoLayout({ options });
    if (nodeType) this.nodeType = nodeType;
    return this;
  }

  setGraphType(type = "default") {
    this.graphType = type || "default";
    this.config.type = this.graphType;
    if (!this.root) return this;
    this.root.classList.forEach((name) => {
      if (name.startsWith("is-graph-")) this.root.classList.remove(name);
    });
    this.root.classList.add(`is-graph-${this.graphType}`);
    this.root.classList.toggle("is-agentloop", this.isAgentLoop());
    return this;
  }

  isAgentLoop() {
    return this.graphType === "agentloop";
  }

  setAnimateMode(enabled) {
    this.userAnimate = Boolean(enabled);
    this.applyAnimateMode(!this.performanceMode && this.userAnimate);
  }

  applyAnimateMode(enabled) {
    this.animate = Boolean(enabled);
    this.nodeLayer?.classList.toggle("no-animate", !this.animate);
    this.root?.classList.toggle("no-animate", !this.animate);
  }

  setPerformanceMode(enabled) {
    this.autoPerformanceActive = false;
    this.performanceMode = Boolean(enabled);
    this.root.classList.toggle("is-performance", this.performanceMode);
    this.applyAnimateMode(!this.performanceMode && this.userAnimate);
    this.render();
  }

  setEdgeLabelsVisible(enabled) {
    this.userEdgeLabelsVisible = Boolean(enabled);
    this.edgeLabelsVisible = this.userEdgeLabelsVisible && !this.autoEdgeLabelsHidden;
    this.lastRenderStats = {
      ...this.lastRenderStats,
      edgeLabelsVisible: this.edgeLabelsVisible,
      autoEdgeLabelsHidden: this.autoEdgeLabelsHidden,
    };
    this.renderEdges();
  }

  syncAutoPerformanceMode({ nodeCount = this.nodes.length, edgeCount = this.edges.length } = {}) {
    if (!this.autoPerformanceMode) return;
    const totalElementCount = nodeCount + edgeCount;
    const shouldUsePerformanceMode = nodeCount >= this.performanceNodeLimit
      || totalElementCount >= this.performanceTotalElementLimit;
    if (shouldUsePerformanceMode && !this.performanceMode) {
      this.autoPerformanceActive = true;
      this.performanceMode = true;
    } else if (!shouldUsePerformanceMode && this.autoPerformanceActive) {
      this.autoPerformanceActive = false;
      this.performanceMode = false;
    }

    this.autoEdgeLabelsHidden = edgeCount > this.performanceEdgeLabelLimit;
    this.edgeLabelsVisible = this.userEdgeLabelsVisible && !this.autoEdgeLabelsHidden;
    this.effectiveHoverHighlightDegree = totalElementCount >= this.performanceTotalElementLimit
      ? Math.min(1, this.hoverHighlightDegree)
      : this.hoverHighlightDegree;
    this.root?.classList.toggle("is-performance", this.performanceMode);
    this.applyAnimateMode(!this.performanceMode && this.userAnimate);
  }

  setNodeDraggable(enabled) {
    this.nodeDraggable = Boolean(enabled);
    this.root?.classList.toggle("is-draggable", this.nodeDraggable);
  }

  setHoverHighlight(enabled, { degree } = {}) {
    this.hoverHighlight = Boolean(enabled);
    if (Number.isFinite(degree)) this.hoverHighlightDegree = Math.max(0, degree);
    this.effectiveHoverHighlightDegree = this.hoverHighlightDegree;
    if (!this.hoverHighlight) this.clearHoverHighlight();
  }

  setMinimapVisible(enabled) {
    this.minimapEnabled = Boolean(enabled);
    this.root?.classList.toggle("has-minimap", this.minimapEnabled);
    this.scheduleMinimapRender();
    this.container.dispatchEvent(new CustomEvent("topo:minimap", {
      detail: { enabled: this.minimapEnabled },
      bubbles: true,
    }));
  }

  setGridVisible(enabled) {
    this.gridVisible = Boolean(enabled);
    this.root?.classList.toggle("has-grid", this.gridVisible);
  }

  setDebugPanelVisible(enabled) {
    this.debugPanelEnabled = Boolean(enabled);
    this.root?.classList.toggle("has-debug-panel", this.debugPanelEnabled);
    if (this.debugPanel) this.debugPanel.hidden = !this.debugPanelEnabled;
    this.renderDebugPanel();
  }

  updateDebugMetrics(metrics = {}) {
    this.debugMetrics = {
      ...this.debugMetrics,
      ...cloneGraphItem(metrics),
      updatedAt: Date.now(),
    };
    this.renderDebugPanel();
    return this.debugMetrics;
  }

  getOptions() {
    return {
      layout: { ...this.layout.options },
      graphType: this.graphType,
      nodeType: this.nodeType,
      plugins: {
        debugPanel: this.debugPanelEnabled,
        fullscreen: true,
        grid: this.gridVisible,
        minimap: this.minimapEnabled,
        selection: this.selectionEnabled,
      },
    };
  }

  getPluginInstance(name) {
    if (name === "fullscreen") {
      return {
        request: () => this.setFullscreen(true),
        exit: () => this.setFullscreen(false),
        toggle: () => this.toggleFullscreen(),
        isEnabled: () => this.isFullscreen(),
      };
    }
    if (name === "grid") {
      return {
        show: () => this.setGridVisible(true),
        hide: () => this.setGridVisible(false),
        toggle: () => this.setGridVisible(!this.gridVisible),
        isVisible: () => this.gridVisible,
      };
    }
    if (name === "minimap") {
      return {
        show: () => this.setMinimapVisible(true),
        hide: () => this.setMinimapVisible(false),
        toggle: () => this.setMinimapVisible(!this.minimapEnabled),
        isVisible: () => this.minimapEnabled,
      };
    }
    return null;
  }

  setTheme(theme = "neutral") {
    this.theme = theme;
    this.config.theme = theme;
    if (!this.root) return;
    this.root.classList.forEach((name) => {
      if (name.startsWith("theme-")) this.root.classList.remove(name);
    });
    this.root.classList.add(`theme-${theme}`);
  }

  rebuildGraphIndexes() {
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edgeById = new Map(this.edges.map((edge) => [edge.id, edge]));
    this.edgeIdsByNodeId = new Map();
    this.childrenByParentId = new Map();
    for (const node of this.nodes) {
      if (!node.parentId) continue;
      if (!this.childrenByParentId.has(node.parentId)) this.childrenByParentId.set(node.parentId, new Set());
      this.childrenByParentId.get(node.parentId).add(node.id);
    }
    for (const edge of this.edges) this.addEdgeToNodeIndex(edge);
    this.markMinimapDirty();
    return this;
  }

  updateNodeIndex(node, previousNode = this.nodeById.get(node?.id)) {
    if (!node?.id) return;
    if (previousNode?.parentId && previousNode.parentId !== node.parentId) {
      this.childrenByParentId.get(previousNode.parentId)?.delete(node.id);
    }
    this.nodeById.set(node.id, node);
    if (node.parentId && previousNode?.parentId !== node.parentId) {
      if (!this.childrenByParentId.has(node.parentId)) this.childrenByParentId.set(node.parentId, new Set());
      this.childrenByParentId.get(node.parentId).add(node.id);
    }
  }

  updateEdgeIndex(edge, previousEdge = this.edgeById.get(edge?.id)) {
    if (!edge?.id) return;
    const endpointChanged = previousEdge
      && (previousEdge.source !== edge.source || previousEdge.target !== edge.target);
    if (endpointChanged) this.removeEdgeFromNodeIndex(previousEdge);
    this.edgeById.set(edge.id, edge);
    if (!previousEdge || endpointChanged) this.addEdgeToNodeIndex(edge);
  }

  addEdgeToNodeIndex(edge) {
    if (!edge?.id) return;
    for (const nodeId of [edge.source, edge.target]) {
      if (!nodeId) continue;
      if (!this.edgeIdsByNodeId.has(nodeId)) this.edgeIdsByNodeId.set(nodeId, new Set());
      this.edgeIdsByNodeId.get(nodeId).add(edge.id);
    }
  }

  removeEdgeFromNodeIndex(edge) {
    if (!edge?.id) return;
    for (const nodeId of [edge.source, edge.target]) {
      if (!nodeId) continue;
      this.edgeIdsByNodeId.get(nodeId)?.delete(edge.id);
    }
  }

  markMinimapDirty() {
    this.minimapStaticDirty = true;
    this.minimapTransform = null;
  }

  async setData({
    nodes = [],
    edges = [],
    centerNodeId,
    clearStatus = false,
    disableAnimate = false,
    preserveOrigin = false,
    preserveViewport = false,
    autoFit = true,
    silentSelection = false,
  } = {}) {
    const startedAt = performance.now();
    const layoutVersion = this.layoutVersion += 1;
    this.hoverState = null;
    const validation = this.validateData
      ? validateGraphData(nodes, edges, this.getValidationOptions())
      : createValidationResult(nodes, edges);
    this.emitValidationResult(validation, { source: "setData", layoutVersion });
    const graphNodes = validation.nodes;
    const graphEdges = validation.edges;
    const previousPositions = this.captureNodePositions();
    if (!preserveOrigin) {
      this.originData = {
        nodes: graphNodes.map((node) => cloneGraphItem(node)),
        edges: graphEdges.map((edge) => cloneGraphItem(edge)),
      };
    }
    let layoutResult;
    try {
      layoutResult = await this.layout.execute({
        nodes: graphNodes.filter((node) => !node.data?.isParent),
        edges: graphEdges,
        innerFunc: { getInternalNode: (id) => this.getInternalNode(id) },
        clearStatus,
      });
    } catch (error) {
      if (!error?.cancelled) throw error;
      return {
        stale: true,
        cancelled: true,
        layoutVersion,
        currentLayoutVersion: this.layoutVersion,
      };
    }
    if (layoutVersion !== this.layoutVersion) {
      return {
        stale: true,
        layoutVersion,
        currentLayoutVersion: this.layoutVersion,
      };
    }

    this.nodes = [...(layoutResult.parent || []), ...(layoutResult.nodes || [])].map((node) => ({
      ...node,
      type: this.resolveNodeType(node),
    }));
    this.edges = graphEdges.map((edge) => ({
      type: "flowEdge",
      ...edge,
      markerEnd: edge.markerEnd ?? "arrow",
    }));
    this.rebuildGraphIndexes();
    this.pruneSelection({ emit: false });
    this.syncAutoPerformanceMode({ nodeCount: this.nodes.length, edgeCount: this.edges.length });
    this.pendingNodeAnimation = this.createNodeAnimation(previousPositions, { centerNodeId, disableAnimate });

    this.render();
    this.lastRenderStats = {
      nodes: this.nodes.length,
      edges: this.edges.length,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      performanceMode: this.performanceMode,
      layout: this.layout.options.topoType || "dot",
      theme: this.theme,
      edgeLabelsVisible: this.edgeLabelsVisible,
      autoEdgeLabelsHidden: this.autoEdgeLabelsHidden,
      effectiveHoverHighlightDegree: this.effectiveHoverHighlightDegree,
      layoutMeta: layoutResult.meta || {},
      validation,
      layoutVersion,
      stale: false,
    };
    this.container.dispatchEvent(new CustomEvent("topo:render", {
      detail: this.lastRenderStats,
      bubbles: true,
    }));
    this.renderDebugPanel();

    if (centerNodeId && !disableAnimate && this.animate && !preserveViewport) {
      if (silentSelection) this.focusViewportOnNode(centerNodeId);
      else this.focusNode(centerNodeId);
    } else if (autoFit && !preserveViewport) {
      this.scheduleViewportFit({ padding: this.fitViewPadding, layoutVersion });
    } else {
      this.applyViewport();
    }

    return layoutResult;
  }

  getValidationOptions() {
    return {
      additionalAllowedNodeTypes: this.allowedNodeTypes,
    };
  }

  emitValidationResult(validation, detail = {}) {
    const eventDetail = {
      ...detail,
      validation,
    };
    this.onValidation?.(validation, eventDetail);
    if (!validation.valid || validation.hasWarnings) {
      this.onValidationError?.(validation, eventDetail);
    }
    this.container.dispatchEvent(new CustomEvent("topo:validation", {
      detail: eventDetail,
      bubbles: true,
    }));
    if (this.throwOnInvalid && !validation.valid) {
      const error = new Error(`Invalid topology graph data: ${validation.errors.join("; ")}`);
      error.validation = validation;
      throw error;
    }
  }

  async setGroupData({
    mainGraph,
    subGraphs = [],
    centerNodeId,
    clearStatus = false,
    disableAnimate = false,
    preserveOrigin = false,
    preserveViewport = false,
    autoFit = true,
    silentSelection = false,
  } = {}) {
    const startedAt = performance.now();
    const layoutVersion = this.layoutVersion += 1;
    const previousPositions = this.captureNodePositions();
    const layoutResult = this.layout.groupLayout({ mainGraph, subGraphs });
    if (layoutVersion !== this.layoutVersion) {
      return {
        stale: true,
        layoutVersion,
        currentLayoutVersion: this.layoutVersion,
      };
    }
    const nodes = [...(layoutResult.parent || []), ...(layoutResult.nodes || [])].map((node) => ({
      ...node,
      type: this.resolveNodeType(node),
    }));
    const edges = (layoutResult.edges || []).map((edge) => ({
      type: "flowEdge",
      ...edge,
      markerEnd: edge.markerEnd ?? "arrow",
    }));

    if (!preserveOrigin) {
      this.originData = {
        nodes: nodes.map((node) => cloneGraphItem(node)),
        edges: edges.map((edge) => cloneGraphItem(edge)),
      };
    }

    this.nodes = nodes;
    this.edges = edges;
    this.rebuildGraphIndexes();
    this.pruneSelection({ emit: false });
    this.syncAutoPerformanceMode({ nodeCount: this.nodes.length, edgeCount: this.edges.length });
    this.pendingNodeAnimation = this.createNodeAnimation(previousPositions, { centerNodeId, disableAnimate });
    this.render();
    this.lastRenderStats = {
      nodes: this.nodes.length,
      edges: this.edges.length,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      performanceMode: this.performanceMode,
      layout: "groupLayout",
      theme: this.theme,
      edgeLabelsVisible: this.edgeLabelsVisible,
      autoEdgeLabelsHidden: this.autoEdgeLabelsHidden,
      effectiveHoverHighlightDegree: this.effectiveHoverHighlightDegree,
      layoutVersion,
      stale: false,
    };
    this.container.dispatchEvent(new CustomEvent("topo:render", {
      detail: this.lastRenderStats,
      bubbles: true,
    }));
    this.renderDebugPanel();

    if (centerNodeId && !disableAnimate && this.animate && !preserveViewport) {
      if (silentSelection) this.focusViewportOnNode(centerNodeId);
      else this.focusNode(centerNodeId);
    } else if (autoFit && !preserveViewport && layoutResult.fitViewNodes?.length) {
      this.scheduleViewportFit({ padding: this.fitViewPadding, nodes: layoutResult.fitViewNodes, layoutVersion });
    } else if (autoFit && !preserveViewport) {
      this.scheduleViewportFit({ padding: this.fitViewPadding, layoutVersion });
    } else {
      this.applyViewport();
    }

    return layoutResult;
  }

  updateNodeData(id, patch) {
    const startedAt = performance.now();
    let changed = false;
    let updatedNode = null;
    let previousNode = null;
    this.nodes = this.nodes.map((node) => {
      if (node.id !== id) return node;
      changed = true;
      previousNode = node;
      updatedNode = { ...node, data: { ...node.data, ...patch } };
      return updatedNode;
    });
    if (!changed) return null;
    this.updateNodeIndex(updatedNode, previousNode);
    this.renderNodeUpdates([id]);
    this.renderEdgeUpdates(this.getConnectedEdgeIds([id]));
    this.scheduleMinimapRender();
    this.recordPatchStats({ startedAt, nodePatches: 1, edgePatches: 0 });
    return updatedNode;
  }

  updateNode(id, patch) {
    const startedAt = performance.now();
    let changed = false;
    let updatedNode = null;
    let previousNode = null;
    this.nodes = this.nodes.map((node) => {
      if (node.id !== id) return node;
      const nextPatch = typeof patch === "function" ? patch(cloneGraphItem(node)) : patch;
      if (!nextPatch) return node;
      changed = true;
      previousNode = node;
      updatedNode = mergeNodePatch(node, nextPatch);
      return updatedNode;
    });
    if (!changed) return null;
    this.updateNodeIndex(updatedNode, previousNode);
    this.renderNodeUpdates([id]);
    this.renderEdgeUpdates(this.getConnectedEdgeIds([id]));
    this.scheduleMinimapRender();
    this.recordPatchStats({ startedAt, nodePatches: 1, edgePatches: 0 });
    return updatedNode;
  }

  updateEdgeData(id, patch) {
    const startedAt = performance.now();
    let changed = false;
    let updatedEdge = null;
    let previousEdge = null;
    this.edges = this.edges.map((edge) => {
      if (edge.id !== id) return edge;
      changed = true;
      previousEdge = edge;
      updatedEdge = { ...edge, data: { ...edge.data, ...patch } };
      return updatedEdge;
    });
    if (!changed) return null;
    this.updateEdgeIndex(updatedEdge, previousEdge);
    this.renderEdgeUpdates([id]);
    this.scheduleMinimapRender();
    this.recordPatchStats({ startedAt, nodePatches: 0, edgePatches: 1 });
    return updatedEdge;
  }

  updateEdge(id, patch) {
    const startedAt = performance.now();
    let changed = false;
    let updatedEdge = null;
    let previousEdge = null;
    this.edges = this.edges.map((edge) => {
      if (edge.id !== id) return edge;
      const nextPatch = typeof patch === "function" ? patch(cloneGraphItem(edge)) : patch;
      if (!nextPatch) return edge;
      changed = true;
      previousEdge = edge;
      updatedEdge = mergeEdgePatch(edge, nextPatch);
      return updatedEdge;
    });
    if (!changed) return null;
    this.updateEdgeIndex(updatedEdge, previousEdge);
    this.renderEdgeUpdates([id]);
    this.scheduleMinimapRender();
    this.recordPatchStats({ startedAt, nodePatches: 0, edgePatches: 1 });
    return updatedEdge;
  }

  patchGraphData(patch = {}, options = {}) {
    const startedAt = performance.now();
    const patchOptions = { ...(patch.options || {}), ...options };
    const nodePatches = normalizePatchList(patch.nodePatches);
    const edgePatches = normalizePatchList(patch.edgePatches);
    const addedNodes = normalizeGraphItemList(patch.addedNodes || patch.addNodes);
    const updatedNodes = normalizeGraphItemList(patch.updatedNodes || patch.updateNodes);
    const removedNodeIds = normalizeIdList(patch.removedNodeIds || patch.removeNodeIds);
    const addedEdges = normalizeGraphItemList(patch.addedEdges || patch.addEdges);
    const updatedEdges = normalizeGraphItemList(patch.updatedEdges || patch.updateEdges);
    const removedEdgeIds = normalizeIdList(patch.removedEdgeIds || patch.removeEdgeIds);
    const removedNodeIdSet = new Set(removedNodeIds);
    const removedEdgeIdSet = new Set(removedEdgeIds);
    const hasStructureChange = Boolean(
      addedNodes.length
      || updatedNodes.length
      || removedNodeIds.length
      || addedEdges.length
      || updatedEdges.length
      || removedEdgeIds.length,
    );

    if (hasStructureChange) {
      const nodeById = new Map(this.getNodes().map((node) => [node.id, node]));
      const edgeById = new Map(this.getEdges().map((edge) => [edge.id, edge]));
      for (const id of removedNodeIdSet) nodeById.delete(id);
      for (const id of removedEdgeIdSet) edgeById.delete(id);
      for (const edge of edgeById.values()) {
        if (removedNodeIdSet.has(edge.source) || removedNodeIdSet.has(edge.target)) {
          edgeById.delete(edge.id);
        }
      }
      for (const node of addedNodes) if (node?.id) nodeById.set(node.id, cloneGraphItem(node));
      for (const node of updatedNodes) {
        if (!node?.id) continue;
        const existing = nodeById.get(node.id);
        nodeById.set(node.id, existing ? mergeNodePatch(existing, node) : cloneGraphItem(node));
      }
      for (const item of nodePatches) {
        const existing = nodeById.get(item.id);
        if (existing) nodeById.set(item.id, mergeNodePatch(existing, patchFromRealtimeItem(item)));
      }
      for (const edge of addedEdges) if (edge?.id) edgeById.set(edge.id, cloneGraphItem(edge));
      for (const edge of updatedEdges) {
        if (!edge?.id) continue;
        const existing = edgeById.get(edge.id);
        edgeById.set(edge.id, existing ? mergeEdgePatch(existing, edge) : cloneGraphItem(edge));
      }
      for (const item of edgePatches) {
        const existing = edgeById.get(item.id);
        if (existing) edgeById.set(item.id, mergeEdgePatch(existing, patchFromRealtimeItem(item)));
      }
      const lightResult = this.applyLightStructurePatch({
        startedAt,
        nodeById,
        edgeById,
        addedNodes,
        updatedNodes,
        removedNodeIds,
        addedEdges,
        updatedEdges,
        removedEdgeIds,
        nodePatches,
        edgePatches,
        options: patchOptions,
      });
      if (lightResult) return lightResult;
      return this.setData({
        nodes: [...nodeById.values()],
        edges: [...edgeById.values()].filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)),
        preserveOrigin: patchOptions.preserveOrigin ?? true,
        clearStatus: patchOptions.clearStatus ?? true,
        disableAnimate: patchOptions.disableAnimate ?? true,
        centerNodeId: patchOptions.centerNodeId,
        autoFit: patchOptions.autoFit,
        preserveViewport: patchOptions.preserveViewport,
        silentSelection: patchOptions.silentSelection,
      });
    }

    let nodePatchCount = 0;
    let edgePatchCount = 0;
    const changedNodeIds = new Set();
    const changedEdgeIds = new Set();
    const updatedNodePairs = [];
    const updatedEdgePairs = [];
    let topologyIndexChanged = false;
    if (nodePatches.length) {
      const patchById = new Map(nodePatches.map((item) => [item.id, patchFromRealtimeItem(item)]));
      this.nodes = this.nodes.map((node) => {
        const nextPatch = patchById.get(node.id);
        if (!nextPatch) return node;
        nodePatchCount += 1;
        changedNodeIds.add(node.id);
        const nextNode = mergeNodePatch(node, nextPatch);
        if (nextNode.parentId !== node.parentId) topologyIndexChanged = true;
        updatedNodePairs.push([nextNode, node]);
        return nextNode;
      });
    }
    if (edgePatches.length) {
      const patchById = new Map(edgePatches.map((item) => [item.id, patchFromRealtimeItem(item)]));
      this.edges = this.edges.map((edge) => {
        const nextPatch = patchById.get(edge.id);
        if (!nextPatch) return edge;
        edgePatchCount += 1;
        changedEdgeIds.add(edge.id);
        const nextEdge = mergeEdgePatch(edge, nextPatch);
        if (nextEdge.source !== edge.source || nextEdge.target !== edge.target) topologyIndexChanged = true;
        updatedEdgePairs.push([nextEdge, edge]);
        return nextEdge;
      });
    }
    if (!nodePatchCount && !edgePatchCount) return { nodePatches: 0, edgePatches: 0 };
    if (topologyIndexChanged) {
      this.rebuildGraphIndexes();
    } else {
      for (const [node, previousNode] of updatedNodePairs) this.updateNodeIndex(node, previousNode);
      for (const [edge, previousEdge] of updatedEdgePairs) this.updateEdgeIndex(edge, previousEdge);
    }
    if (nodePatchCount) this.renderNodeUpdates(changedNodeIds);
    const affectedEdgeIds = new Set([...changedEdgeIds, ...this.getConnectedEdgeIds(changedNodeIds)]);
    if (affectedEdgeIds.size) this.renderEdgeUpdates(affectedEdgeIds);
    this.scheduleMinimapRender();
    this.recordPatchStats({ startedAt, nodePatches: nodePatchCount, edgePatches: edgePatchCount });
    return {
      nodePatches: nodePatchCount,
      edgePatches: edgePatchCount,
      affectedEdges: affectedEdgeIds.size,
    };
  }

  applyLightStructurePatch({
    startedAt,
    nodeById,
    edgeById,
    addedNodes = [],
    updatedNodes = [],
    removedNodeIds = [],
    addedEdges = [],
    updatedEdges = [],
    removedEdgeIds = [],
    nodePatches = [],
    edgePatches = [],
    options = {},
  } = {}) {
    if (!this.shouldApplyLightStructurePatch({
      addedNodes,
      updatedNodes,
      removedNodeIds,
      addedEdges,
      updatedEdges,
      removedEdgeIds,
      options,
    })) {
      return null;
    }

    const addedNodeIds = new Set(addedNodes.map((node) => node?.id).filter(Boolean));
    const changedNodeIds = new Set([
      ...addedNodeIds,
      ...updatedNodes.map((node) => node?.id).filter(Boolean),
      ...nodePatches.map((patch) => patch?.id).filter(Boolean),
    ]);
    const changedEdgeIds = new Set([
      ...addedEdges.map((edge) => edge?.id).filter(Boolean),
      ...updatedEdges.map((edge) => edge?.id).filter(Boolean),
      ...removedEdgeIds,
      ...edgePatches.map((patch) => patch?.id).filter(Boolean),
    ]);

    let index = 0;
    for (const id of addedNodeIds) {
      const node = nodeById.get(id);
      if (!node || node.position || node.data?.position) continue;
      node.position = this.inferLightStructureNodePosition(node, edgeById, index);
      index += 1;
    }

    const validation = this.validateData
      ? validateGraphData([...nodeById.values()], [...edgeById.values()], this.getValidationOptions())
      : createValidationResult([...nodeById.values()], [...edgeById.values()]);
    this.emitValidationResult(validation, { source: "patchGraphData" });
    if (validation.errors.length) return null;

    this.hoverState = null;
    this.nodes = validation.nodes.map((node) => ({
      ...node,
      type: this.resolveNodeType(node),
    }));
    this.edges = validation.edges.map((edge) => ({
      type: "flowEdge",
      ...edge,
      markerEnd: edge.markerEnd ?? "arrow",
    }));
    this.rebuildGraphIndexes();
    this.pruneSelection({ emit: false });
    if (!options.preserveOrigin) {
      this.originData = {
        nodes: validation.nodes.map((node) => cloneGraphItem(node)),
        edges: validation.edges.map((edge) => cloneGraphItem(edge)),
      };
    }
    this.syncAutoPerformanceMode({ nodeCount: this.nodes.length, edgeCount: this.edges.length });
    this.renderNodes();
    this.renderEdges();
    this.applyViewport();
    this.scheduleMinimapRender();

    const result = {
      structural: true,
      relayout: false,
      addedNodes: addedNodes.length,
      updatedNodes: updatedNodes.length + nodePatches.length,
      removedNodeIds: removedNodeIds.length,
      addedEdges: addedEdges.length,
      updatedEdges: updatedEdges.length + edgePatches.length,
      removedEdgeIds: removedEdgeIds.length,
      changedNodes: changedNodeIds.size,
      changedEdges: changedEdgeIds.size,
      validation,
    };
    this.recordPatchStats({
      startedAt,
      nodePatches: result.updatedNodes + result.addedNodes + result.removedNodeIds,
      edgePatches: result.updatedEdges + result.addedEdges + result.removedEdgeIds,
      structurePatch: result,
    });
    return result;
  }

  shouldApplyLightStructurePatch({
    addedNodes = [],
    updatedNodes = [],
    removedNodeIds = [],
    addedEdges = [],
    updatedEdges = [],
    removedEdgeIds = [],
    options = {},
  } = {}) {
    if (!this.lightStructurePatch || options.relayout === true || options.forceLayout === true) return false;
    const nodeChangeCount = addedNodes.length + updatedNodes.length + removedNodeIds.length;
    const edgeChangeCount = addedEdges.length + updatedEdges.length + removedEdgeIds.length;
    if (nodeChangeCount > this.lightStructureNodeLimit) return false;
    if (edgeChangeCount > this.lightStructureEdgeLimit) return false;
    const removedNodeIdSet = new Set(removedNodeIds);
    if (this.nodes.some((node) => removedNodeIdSet.has(node.parentId))) return false;
    const unsafeNodeChange = [...addedNodes, ...updatedNodes].some((node) => {
      const type = this.resolveNodeType(node || {});
      return node?.parentId
        || node?.extent
        || node?.expandParent
        || node?.data?.isParent
        || isParentNode(node, type);
    });
    return !unsafeNodeChange;
  }

  inferLightStructureNodePosition(node, edgeById, index = 0) {
    const rankDir = this.layout.options.rankDir || "LR";
    const relatedEdge = [...edgeById.values()].find((edge) => edge.source === node.id || edge.target === node.id);
    const neighborId = relatedEdge?.source === node.id ? relatedEdge.target : relatedEdge?.source;
    const neighbor = neighborId ? this.nodeById.get(neighborId) : null;
    const neighborPosition = neighbor ? this.getNodeAbsolutePosition(neighbor) : null;
    const offset = rankDir === "TB"
      ? { x: (index % 3) * 260, y: 180 + Math.floor(index / 3) * 120 }
      : { x: 260 + Math.floor(index / 3) * 260, y: (index % 3 - 1) * 120 };
    if (neighborPosition) {
      return {
        x: Math.round(neighborPosition.x + offset.x),
        y: Math.round(neighborPosition.y + offset.y),
      };
    }
    const bounds = this.getBounds();
    return {
      x: Math.round(bounds.x + bounds.width + 220 + Math.floor(index / 3) * 260),
      y: Math.round(bounds.y + (index % 3) * 120),
    };
  }

  recordPatchStats({ startedAt, nodePatches = 0, edgePatches = 0, structurePatch = null }) {
    this.lastRenderStats = {
      ...this.lastRenderStats,
      patchDurationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      nodePatches,
      edgePatches,
      structurePatch,
      lastPatchAt: Date.now(),
      nodes: this.nodes.length,
      edges: this.edges.length,
      performanceMode: this.performanceMode,
      edgeLabelsVisible: this.edgeLabelsVisible,
      autoEdgeLabelsHidden: this.autoEdgeLabelsHidden,
    };
    this.container.dispatchEvent(new CustomEvent("topo:patch", {
      detail: this.lastRenderStats,
      bubbles: true,
    }));
    this.renderDebugPanel();
  }

  getInternalNode(id) {
    const node = this.nodeById.get(id);
    if (!node) return null;
    return {
      ...cloneGraphItem(node),
      position: this.getNodeAbsolutePosition(node),
      measured: getNodeSize(node),
    };
  }

  async updateGraphData(nodes = [], edges = [], options = {}) {
    if (!options.remain) {
      this.originData = {
        nodes: (options.origin?.nodes || options.origin?.nodeRes || nodes).map((node) => cloneGraphItem(node)),
        edges: (options.origin?.edges || options.origin?.edgesRes || edges).map((edge) => cloneGraphItem(edge)),
      };
    }

    const focusId = options.focusId || options.id || options.centerNodeId;
    this.currentFocusId = focusId || "";
    return this.setData({
      nodes,
      edges,
      centerNodeId: focusId,
      clearStatus: options.clearStatus,
      disableAnimate: options.disableAnimate,
      preserveOrigin: true,
    });
  }

  async handleFocusNode(id, { degree = 1, direction = "both", disableAnimate = false } = {}) {
    const sourceData = this.originData.nodes.length ? this.originData : this.getData();
    const related = getRelatedData(id, sourceData.nodes, sourceData.edges, { degree, direction });
    if (!related.nodes.length) return null;
    this.currentFocusId = id;
    await this.setData({
      nodes: related.nodes.map((node) => node.id === id ? disableExpandAction(node) : node),
      edges: related.edges,
      centerNodeId: id,
      clearStatus: true,
      disableAnimate,
      preserveOrigin: true,
    });
    return related;
  }

  async showOriginData({ centerNodeId, disableAnimate = false } = {}) {
    const sourceData = this.originData.nodes.length ? this.originData : this.getData();
    this.currentFocusId = "";
    return this.setData({
      ...sourceData,
      centerNodeId,
      clearStatus: true,
      disableAnimate,
      preserveOrigin: true,
    });
  }

  focusNode(id) {
    const focused = this.focusViewportOnNode(id);
    if (!focused) return;
    this.selectNode(id, { emit: false });
  }

  focusViewportOnNode(id) {
    const node = this.nodeById.get(id);
    if (!node) return false;

    const rect = this.container.getBoundingClientRect();
    const size = getNodeSize(node);
    const position = this.getNodeAbsolutePosition(node);
    const zoom = Math.max(0.8, Math.min(1.25, this.viewport.zoom));
    this.viewport = {
      zoom,
      x: rect.width / 2 - (position.x + size.width / 2) * zoom,
      y: rect.height / 2 - (position.y + size.height / 2) * zoom,
    };
    this.applyViewport();
    return true;
  }

  selectNode(id, { emit = true } = {}) {
    const node = this.nodeById.get(id);
    if (!node) return null;
    if (this.selectionEnabled) {
      this.setSelection({ nodes: [id], edges: [], primary: { type: "node", id } }, { emit });
    } else {
      this.setSelectedItem({ type: "node", id });
    }
    if (emit) this.handleNodeClick?.(node);
    return node;
  }

  getSelection() {
    return cloneSelection(this.selection);
  }

  setSelection(selection = {}, { emit = true, render = true } = {}) {
    const next = this.normalizeSelection(selection);
    const previous = this.selection;
    this.selection = next;
    this.selected = next.primary ? { ...next.primary } : null;
    if (render) this.renderSelection();
    if (emit && !areSelectionsEqual(previous, next)) {
      this.container.dispatchEvent(new CustomEvent("topo:selection-change", {
        detail: { selection: this.getSelection(), previous: cloneSelection(previous) },
        bubbles: true,
      }));
    }
    return this.getSelection();
  }

  toggleSelectionItem(item = {}, { emit = true } = {}) {
    if (item.type !== "node" && item.type !== "edge") return this.getSelection();
    const selection = this.getSelection();
    const collection = item.type === "node" ? selection.nodes : selection.edges;
    const index = collection.indexOf(item.id);
    if (index >= 0) collection.splice(index, 1);
    else collection.push(item.id);
    const primary = index >= 0 && selection.primary?.type === item.type && selection.primary?.id === item.id
      ? resolvePrimarySelection(selection)
      : { type: item.type, id: item.id };
    return this.setSelection({ ...selection, primary }, { emit });
  }

  clearSelection({ emit = true } = {}) {
    return this.setSelection({ nodes: [], edges: [], primary: null }, { emit });
  }

  setSelectedItem(item = null) {
    this.selected = item ? { type: item.type, id: item.id } : null;
    this.renderSelection();
    return this.selected ? { ...this.selected } : null;
  }

  selectArea(rect, { append = false, emit = true, includeEdges = true, edgeMode = "intersect" } = {}) {
    const normalizedRect = normalizeRect(rect);
    const selectedNodeIds = this.nodes
      .filter((node) => doesNodeRectIntersect(node, normalizedRect, (item) => this.getNodeAbsolutePosition(item)))
      .map((node) => node.id);
    const selectedEdgeIds = includeEdges
      ? this.getEdgesIntersectingRect(normalizedRect, selectedNodeIds, { edgeMode })
      : [];
    const base = append ? this.getSelection() : { nodes: [], edges: [], primary: null };
    const nodes = [...new Set([...base.nodes, ...selectedNodeIds])];
    const edges = [...new Set([...base.edges, ...selectedEdgeIds])];
    const primary = selectedNodeIds.length
      ? { type: "node", id: selectedNodeIds[0] }
      : selectedEdgeIds.length
        ? { type: "edge", id: selectedEdgeIds[0] }
        : resolvePrimarySelection({ nodes, edges }) || base.primary;
    const next = this.setSelection({ nodes, edges, primary }, { emit });
    this.container.dispatchEvent(new CustomEvent("topo:selection-area-end", {
      detail: { rect: normalizedRect, selection: next, nodeIds: selectedNodeIds, edgeIds: selectedEdgeIds },
      bubbles: true,
    }));
    return next;
  }

  selectVisible({ append = false, emit = true, includeEdges = true } = {}) {
    const visible = this.getVisibleGraphData();
    const base = append ? this.getSelection() : { nodes: [], edges: [], primary: null };
    const nodes = [...new Set([...base.nodes, ...visible.nodes.map((node) => node.id)])];
    const edges = includeEdges
      ? [...new Set([...base.edges, ...visible.edges.map((edge) => edge.id)])]
      : base.edges;
    return this.setSelection({
      nodes,
      edges,
      primary: resolvePrimarySelection({ nodes, edges }),
    }, { emit });
  }

  invertSelection({ scope = "visible", emit = true, includeEdges = true } = {}) {
    const candidates = scope === "all" ? this.getData() : this.getVisibleGraphData();
    const candidateNodeIds = new Set(candidates.nodes.map((node) => node.id));
    const candidateEdgeIds = new Set(includeEdges ? candidates.edges.map((edge) => edge.id) : []);
    const current = this.getSelection();
    const nodeIds = new Set(current.nodes);
    const edgeIds = new Set(current.edges);

    for (const id of candidateNodeIds) {
      if (nodeIds.has(id)) nodeIds.delete(id);
      else nodeIds.add(id);
    }
    for (const id of candidateEdgeIds) {
      if (edgeIds.has(id)) edgeIds.delete(id);
      else edgeIds.add(id);
    }
    if (scope === "all") {
      for (const id of current.nodes) if (!candidateNodeIds.has(id)) nodeIds.delete(id);
      for (const id of current.edges) if (!candidateEdgeIds.has(id)) edgeIds.delete(id);
    }

    const next = {
      nodes: [...nodeIds],
      edges: includeEdges ? [...edgeIds] : current.edges,
    };
    return this.setSelection({ ...next, primary: resolvePrimarySelection(next) }, { emit });
  }

  selectByCriteria(criteria = {}, { append = false, emit = true, visibleOnly = false, includeEdges = true } = {}) {
    if (!criteria || typeof criteria !== "object") return this.getSelection();
    const graph = visibleOnly ? this.getVisibleGraphData() : this.getData();
    const selectedNodeIds = graph.nodes
      .filter((node) => matchesSelectionCriteria(node, "node", criteria))
      .map((node) => node.id);
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const explicitlySelectedEdgeIds = new Set(graph.edges
      .filter((edge) => matchesSelectionCriteria(edge, "edge", criteria))
      .map((edge) => edge.id));
    const selectedEdgeIds = includeEdges
      ? graph.edges
        .filter((edge) => explicitlySelectedEdgeIds.has(edge.id) || (selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target)))
        .map((edge) => edge.id)
      : [...explicitlySelectedEdgeIds];
    const base = append ? this.getSelection() : { nodes: [], edges: [], primary: null };
    const nodes = [...new Set([...base.nodes, ...selectedNodeIds])];
    const edges = [...new Set([...base.edges, ...selectedEdgeIds])];
    return this.setSelection({
      nodes,
      edges,
      primary: resolvePrimarySelection({ nodes, edges }),
    }, { emit });
  }

  setSelectionMode(mode = "default") {
    const previous = this.selectionMode;
    this.selectionMode = this.selectionEnabled && mode === "area" ? "area" : "default";
    this.root?.classList.toggle("is-selection-mode-area", this.selectionMode === "area");
    if (previous !== this.selectionMode) {
      this.container.dispatchEvent(new CustomEvent("topo:selection-mode-change", {
        detail: { mode: this.selectionMode, previous },
        bubbles: true,
      }));
    }
    return this.selectionMode;
  }

  setSelectionEnabled(enabled) {
    const next = Boolean(enabled);
    if (this.selectionEnabled === next) return this.selectionEnabled;
    const previous = this.selectionEnabled;
    this.selectionEnabled = next;
    if (!next) {
      this.setSelectionMode("default");
      this.clearSelection();
    } else {
      this.renderSelection();
    }
    this.root?.classList.toggle("is-selection-enabled", this.selectionEnabled);
    this.container.dispatchEvent(new CustomEvent("topo:selection-enabled-change", {
      detail: { enabled: this.selectionEnabled, previous },
      bubbles: true,
    }));
    return this.selectionEnabled;
  }

  isSelectionEnabled() {
    return this.selectionEnabled;
  }

  normalizeSelection(selection = {}) {
    const nodes = [...new Set(selection.nodes || [])].filter((id) => this.nodeById.has(id));
    const edges = [...new Set(selection.edges || [])].filter((id) => this.edgeById.has(id));
    let primary = selection.primary || null;
    if (primary?.type === "node" && !this.nodeById.has(primary.id)) primary = null;
    if (primary?.type === "edge" && !this.edgeById.has(primary.id)) primary = null;
    if (!primary) primary = resolvePrimarySelection({ nodes, edges });
    return { nodes, edges, primary };
  }

  pruneSelection({ emit = false } = {}) {
    return this.setSelection(this.selection, { emit, render: false });
  }

  selectGraphItem(type, id, event, item) {
    if (!this.selectionEnabled) {
      this.setSelectedItem({ type, id });
      if (type === "node") this.handleNodeClick?.(item);
      if (type === "edge") this.handleEdgeClick?.(item);
      return this.getSelection();
    }
    const additive = isAdditiveSelectionEvent(event);
    const selection = additive
      ? this.toggleSelectionItem({ type, id })
      : this.setSelection({
        nodes: type === "node" ? [id] : [],
        edges: type === "edge" ? [id] : [],
        primary: { type, id },
      });
    if (type === "node") this.handleNodeClick?.(item);
    if (type === "edge") this.handleEdgeClick?.(item);
    return selection;
  }

  getEdgesIntersectingRect(rect, selectedNodeIds = [], { edgeMode = "intersect" } = {}) {
    const selectedNodeIdSet = new Set(selectedNodeIds);
    if (edgeMode === "connected" && !selectedNodeIdSet.size) return [];
    const edgeCandidates = edgeMode === "connected" && selectedNodeIdSet.size
      ? this.getConnectedEdgeIds(selectedNodeIdSet).map((id) => this.edgeById.get(id)).filter(Boolean)
      : this.edges;
    return edgeCandidates
      .filter((edge) => {
        const source = this.nodeById.get(edge.source);
        const target = this.nodeById.get(edge.target);
        if (!source || !target) return false;
        if (edgeMode === "connected") return selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target);
        const sourceCenter = this.getNodeCenter(source);
        const targetCenter = this.getNodeCenter(target);
        return segmentIntersectsRect(sourceCenter, targetCenter, rect)
          || (selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target));
      })
      .map((edge) => edge.id);
  }

  getNodeCenter(node) {
    const position = this.getNodeAbsolutePosition(node);
    const size = getNodeSize(node);
    return {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
    };
  }

  getContextNodes() {
    return this.nodes.map((node) => ({
      ...cloneGraphItem(node),
      position: this.getNodeAbsolutePosition(node),
      measured: getNodeSize(node),
    }));
  }

  getVisibleGraphData(options = {}) {
    return getVisibleTopologyGraphData({
      nodes: this.getContextNodes(),
      edges: this.getEdges(),
      visibleRect: options.visibleRect || this.getVisibleGraphRect(),
    });
  }

  extractContext(options = {}) {
    const contextOptions = this.resolveContextOptions(options);
    const context = createTopologyContext({
      nodes: this.getContextNodes(),
      edges: this.getEdges(),
      selection: this.getSelection(),
      visibleRect: this.getVisibleGraphRect(),
      viewport: { ...this.viewport },
      source: {
        graphType: this.graphType,
        layout: this.layout.options.topoType || "dot",
      },
      options: contextOptions,
    });
    const result = serializeTopologyContext(context, { format: contextOptions.format || "json" });
    this.container.dispatchEvent(new CustomEvent("topo:context-extract", {
      detail: { context, format: contextOptions.format || "json" },
      bubbles: true,
    }));
    return result;
  }

  async copyContext(options = {}) {
    const contextOptions = this.resolveContextOptions(options);
    const context = createTopologyContext({
      nodes: this.getContextNodes(),
      edges: this.getEdges(),
      selection: this.getSelection(),
      visibleRect: this.getVisibleGraphRect(),
      viewport: { ...this.viewport },
      source: {
        graphType: this.graphType,
        layout: this.layout.options.topoType || "dot",
      },
      options: { ...contextOptions, format: "json" },
    });
    const text = options.text || formatTopologyContextAsMarkdown(context);
    let copied = false;
    let error = null;
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (copyError) {
      error = copyError;
    }
    const detail = { copied, text, context, error };
    this.container.dispatchEvent(new CustomEvent("topo:context-copy", {
      detail,
      bubbles: true,
    }));
    return detail;
  }

  resolveContextOptions(options = {}) {
    if ((options.scope === "selected" || !options.scope) && !hasSelection(this.selection)) {
      return {
        ...options,
        scope: "visible",
        includeMode: "visible",
      };
    }
    return options;
  }

  zoomTo(zoom) {
    const rect = this.container.getBoundingClientRect();
    const nextZoom = clamp(zoom, this.minZoom, this.maxZoom);
    const center = {
      x: (rect.width / 2 - this.viewport.x) / this.viewport.zoom,
      y: (rect.height / 2 - this.viewport.y) / this.viewport.zoom,
    };
    this.viewport = {
      zoom: nextZoom,
      x: rect.width / 2 - center.x * nextZoom,
      y: rect.height / 2 - center.y * nextZoom,
    };
    this.applyViewport();
  }

  getViewport() {
    return { ...this.viewport };
  }

  setViewport(viewport = {}) {
    this.viewport = {
      x: Number.isFinite(viewport.x) ? viewport.x : this.viewport.x,
      y: Number.isFinite(viewport.y) ? viewport.y : this.viewport.y,
      zoom: Number.isFinite(viewport.zoom) ? clamp(viewport.zoom, this.minZoom, this.maxZoom) : this.viewport.zoom,
    };
    this.applyViewport();
  }

  fitCenter() {
    const bounds = this.getBounds();
    const rect = this.container.getBoundingClientRect();
    this.viewport.x = rect.width / 2 - (bounds.x + bounds.width / 2) * this.viewport.zoom;
    this.viewport.y = rect.height / 2 - (bounds.y + bounds.height / 2) * this.viewport.zoom;
    this.applyViewport();
  }

  fitView({ padding = 0.12, nodes, minZoom = this.minZoom, maxZoom = 1.35 } = {}) {
    const nodeIds = nodes?.length ? new Set(nodes.map((item) => typeof item === "string" ? item : item?.id).filter(Boolean)) : null;
    const selectedNodes = nodeIds?.size
      ? [...nodeIds].map((id) => this.nodeById.get(id)).filter(Boolean)
      : this.nodes;
    const bounds = this.getBounds(selectedNodes);
    const rect = this.container.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !rect.width || !rect.height) return;

    const paddedWidth = bounds.width * (1 + padding * 2);
    const paddedHeight = bounds.height * (1 + padding * 2);
    const zoom = clamp(Math.min(rect.width / paddedWidth, rect.height / paddedHeight), minZoom, maxZoom);
    this.viewport = {
      zoom,
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    };
    this.applyViewport();
  }

  scheduleViewportFit({ padding = 0.12, nodes, layoutVersion = this.layoutVersion } = {}) {
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    if (this.viewportInteractionTimer) clearTimeout(this.viewportInteractionTimer);
    this.viewportTimer = window.setTimeout(() => {
      this.viewportTimer = null;
      if (layoutVersion !== this.layoutVersion) return;
      this.fitView({ padding, nodes });
    }, 60);
  }

  destroy() {
    if (this.edgeRenderFrame) cancelAnimationFrame(this.edgeRenderFrame);
    if (this.edgeCanvasFrame) cancelAnimationFrame(this.edgeCanvasFrame);
    if (this.hoverRenderFrame) cancelAnimationFrame(this.hoverRenderFrame);
    if (this.minimapRenderFrame) cancelAnimationFrame(this.minimapRenderFrame);
    if (this.nodeAnimationFrame) cancelAnimationFrame(this.nodeAnimationFrame);
    if (this.nodeAnimationTimer) clearTimeout(this.nodeAnimationTimer);
    if (this.viewportTimer) clearTimeout(this.viewportTimer);
    this.controls?.destroy?.();
    document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
    document.removeEventListener("keydown", this.handleKeydown);
    this.nodeElementById.clear();
    this.edgeElementById.clear();
    this.nodeById.clear();
    this.edgeById.clear();
    this.edgeIdsByNodeId.clear();
    this.childrenByParentId.clear();
    this.container.innerHTML = "";
  }

  isFullscreen() {
    return this.fullscreenFallback || document.fullscreenElement === this.root || this.root?.classList.contains("is-fullscreen");
  }

  async setFullscreen(enabled) {
    const shouldEnable = Boolean(enabled);
    if (shouldEnable) {
      this.fullscreenFallback = false;
      if (this.root.requestFullscreen && !document.fullscreenElement) {
        try {
          await this.root.requestFullscreen();
        } catch {
          this.fullscreenFallback = true;
        }
      } else {
        this.fullscreenFallback = true;
      }
    } else {
      this.fullscreenFallback = false;
      if (document.fullscreenElement === this.root && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          this.fullscreenFallback = false;
        }
      }
    }
    this.syncFullscreenState();
    window.setTimeout(() => this.fitView({ padding: this.fitViewPadding }), 80);
    return this.isFullscreen();
  }

  toggleFullscreen() {
    return this.setFullscreen(!this.isFullscreen());
  }

  syncFullscreenState() {
    const enabled = this.fullscreenFallback || document.fullscreenElement === this.root;
    this.root?.classList.toggle("is-fullscreen", enabled);
    this.container.dispatchEvent(new CustomEvent("topo:fullscreen", {
      detail: { enabled },
      bubbles: true,
    }));
  }

  buildShell(style, className) {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = `new-topo-graph ${className}`.trim();
    this.root.classList.toggle("has-grid", this.gridVisible);
    Object.assign(this.root.style, style);

    this.viewportEl = document.createElement("div");
    this.viewportEl.className = "topo-viewport";

    this.edgeCanvas = document.createElement("canvas");
    this.edgeCanvas.className = "topo-edge-canvas";

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.classList.add("topo-svg");
    this.edgeLayer = document.createElementNS(SVG_NS, "g");
    this.svg.appendChild(this.edgeLayer);

    this.nodeLayer = document.createElement("div");
    this.nodeLayer.className = "topo-node-layer";

    this.minimap = document.createElement("div");
    this.minimap.className = "topo-minimap";
    this.minimap.title = "Global navigation";
    this.minimap.style.width = `${this.minimapWidth}px`;
    this.minimap.style.height = `${this.minimapHeight}px`;

    this.minimapSvg = document.createElementNS(SVG_NS, "svg");
    this.minimapSvg.classList.add("topo-minimap-svg");
    this.minimap.appendChild(this.minimapSvg);

    this.debugPanel = document.createElement("div");
    this.debugPanel.className = "topo-debug-panel";
    this.debugPanel.hidden = !this.debugPanelEnabled;

    this.selectionMarquee = document.createElement("div");
    this.selectionMarquee.className = "topo-selection-marquee";
    this.selectionMarquee.hidden = true;

    this.controlsHost = document.createElement("div");
    this.controlsHost.className = "topo-controls-host";

    this.viewportEl.append(this.edgeCanvas, this.svg, this.nodeLayer);
    this.root.append(this.viewportEl, this.selectionMarquee, this.controlsHost, this.minimap, this.debugPanel);
    this.root.classList.toggle("has-minimap", this.minimapEnabled);
    this.root.classList.toggle("has-controls", this.controlsEnabled);
    this.root.classList.toggle("has-debug-panel", this.debugPanelEnabled);
    this.root.classList.toggle("is-selection-enabled", this.selectionEnabled);
    this.root.classList.toggle("is-selection-mode-area", this.selectionMode === "area");
    this.container.append(this.root);
    if (this.controlsEnabled) {
      this.controls = new FlowControls({
        container: this.controlsHost,
        graph: this,
        actions: this.controlActions,
        orientation: this.controlOrientation,
        className: this.controlClassName,
        zoomStep: this.controlZoomStep,
      });
    }
    this.bindMinimapEvents();
    this.renderDebugPanel();
  }

  bindCanvasEvents() {
    let dragging = false;
    let areaDragging = false;
    let start = null;

    this.root.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".topo-controls-host, .topo-minimap, .topo-debug-panel")) return;
      if (event.target.closest(".topo-node") || event.target.closest(".topo-edge-hit")) return;
      if (this.shouldStartAreaSelection(event)) {
        areaDragging = true;
        start = {
          x: event.clientX,
          y: event.clientY,
          append: isAdditiveSelectionEvent(event),
        };
        this.areaSelection = start;
        this.root.setPointerCapture(event.pointerId);
        this.root.classList.add("is-area-selecting");
        this.updateSelectionMarquee(start, event);
        this.container.dispatchEvent(new CustomEvent("topo:selection-area-start", {
          detail: { point: this.toGraphPoint(event.clientX, event.clientY) },
          bubbles: true,
        }));
        this.handleCloseInfo?.();
        return;
      }
      dragging = true;
      start = { x: event.clientX, y: event.clientY, vx: this.viewport.x, vy: this.viewport.y };
      this.root.setPointerCapture(event.pointerId);
      this.root.classList.add("is-panning");
      this.handleCloseInfo?.();
    });

    this.root.addEventListener("pointermove", (event) => {
      if (areaDragging && start) {
        this.updateSelectionMarquee(start, event);
        return;
      }
      if (!dragging || !start) return;
      this.viewport.x = start.vx + event.clientX - start.x;
      this.viewport.y = start.vy + event.clientY - start.y;
      this.applyViewport();
    });

    const endDrag = (event) => {
      if (areaDragging && start) {
        const rect = this.getGraphRectFromClientPoints(start, event);
        const append = start.append;
        const cancelled = this.areaSelection?.cancelled;
        areaDragging = false;
        this.areaSelection = null;
        start = null;
        this.hideSelectionMarquee();
        this.root.classList.remove("is-area-selecting");
        try {
          this.root.releasePointerCapture(event.pointerId);
        } catch {
          // Pointer capture can already be released.
        }
        if (!cancelled) this.selectArea(rect, { append });
        return;
      }
      if (!dragging) return;
      dragging = false;
      start = null;
      try {
        this.root.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be released.
      }
      this.root.classList.remove("is-panning");
    };

    this.root.addEventListener("pointerup", endDrag);
    this.root.addEventListener("pointercancel", endDrag);

    this.root.addEventListener("wheel", (event) => {
      if (event.target.closest(".topo-controls-host, .topo-minimap, .topo-debug-panel")) return;
      event.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const nextZoom = clamp(
        this.viewport.zoom * Math.exp(-delta * this.zoomSensitivity),
        this.minZoom,
        this.maxZoom,
      );
      const graphPoint = {
        x: (event.clientX - rect.left - this.viewport.x) / this.viewport.zoom,
        y: (event.clientY - rect.top - this.viewport.y) / this.viewport.zoom,
      };
      this.viewport = {
        zoom: nextZoom,
        x: event.clientX - rect.left - graphPoint.x * nextZoom,
        y: event.clientY - rect.top - graphPoint.y * nextZoom,
      };
      this.applyViewport();
    }, { passive: false });
  }

  shouldStartAreaSelection(event) {
    return this.selectionEnabled && (this.selectionMode === "area" || event.shiftKey);
  }

  updateSelectionMarquee(start, event) {
    if (!this.selectionMarquee) return;
    const rect = this.root.getBoundingClientRect();
    const left = Math.min(start.x, event.clientX) - rect.left;
    const top = Math.min(start.y, event.clientY) - rect.top;
    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    Object.assign(this.selectionMarquee.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    this.selectionMarquee.hidden = false;
  }

  hideSelectionMarquee() {
    if (!this.selectionMarquee) return;
    this.selectionMarquee.hidden = true;
    Object.assign(this.selectionMarquee.style, {
      left: "0px",
      top: "0px",
      width: "0px",
      height: "0px",
    });
  }

  getGraphRectFromClientPoints(start, event) {
    const a = this.toGraphPoint(start.x, start.y);
    const b = this.toGraphPoint(event.clientX, event.clientY);
    return normalizeRect({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    });
  }

  toGraphPoint(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.viewport.x) / this.viewport.zoom,
      y: (clientY - rect.top - this.viewport.y) / this.viewport.zoom,
    };
  }

  handleGraphKeydown(event) {
    if (event.key !== "Escape") return;
    if (isEditableTarget(event.target)) return;
    if (this.areaSelection) {
      this.areaSelection.cancelled = true;
      this.hideSelectionMarquee();
      this.root?.classList.remove("is-area-selecting");
      return;
    }
    if (this.selectionEnabled && (this.selection.nodes.length || this.selection.edges.length)) this.clearSelection();
  }

  bindMinimapEvents() {
    let dragging = false;

    const start = (event) => {
      if (!this.minimapEnabled || !this.nodes.length) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      this.isMinimapDragging = true;
      this.minimap.setPointerCapture(event.pointerId);
      this.minimap.classList.add("is-dragging");
      this.navigateFromMinimap(event);
    };

    const move = (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      this.navigateFromMinimap(event);
    };

    const end = (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
      this.isMinimapDragging = false;
      this.minimap.classList.remove("is-dragging");
      try {
        this.minimap.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be released by the browser.
      }
    };

    this.minimap.addEventListener("pointerdown", start);
    this.minimap.addEventListener("pointermove", move);
    this.minimap.addEventListener("pointerup", end);
    this.minimap.addEventListener("pointercancel", end);
    this.minimap.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  }

  navigateFromMinimap(event) {
    const transform = this.getMinimapTransform();
    if (!transform) return;

    const rect = this.minimap.getBoundingClientRect();
    const graphPoint = {
      x: transform.bounds.x + (event.clientX - rect.left - transform.offsetX) / transform.scale,
      y: transform.bounds.y + (event.clientY - rect.top - transform.offsetY) / transform.scale,
    };
    const hostRect = this.container.getBoundingClientRect();
    this.viewport = {
      ...this.viewport,
      x: hostRect.width / 2 - graphPoint.x * this.viewport.zoom,
      y: hostRect.height / 2 - graphPoint.y * this.viewport.zoom,
    };
    this.applyViewport();
  }

  renderDebugPanel() {
    if (!this.debugPanel || !this.debugPanelEnabled) return;
    const stats = this.lastRenderStats || {};
    const metrics = this.debugMetrics || {};
    const validation = stats.validation || metrics.lastValidation || null;
    const rows = [
      ["connection", metrics.connectionStatus || metrics.status || "-"],
      ["messageRate", formatDebugValue(metrics.messageRate, "/s")],
      ["queue", metrics.queueSize ?? metrics.lastQueueSize ?? "-"],
      ["version", metrics.currentGraphVersion ?? metrics.snapshotVersion ?? metrics.version ?? "-"],
      ["flush", formatDebugValue(metrics.flushDuration, "ms")],
      ["layout", formatDebugValue(stats.layoutMeta?.durationMs ?? stats.layoutDurationMs ?? stats.durationMs, "ms")],
      ["render", formatDebugValue(stats.durationMs, "ms")],
      ["patch", formatDebugValue(stats.patchDurationMs, "ms")],
      ["dropped", metrics.droppedUpdates ?? metrics.droppedMessages ?? "-"],
      ["worker", stats.layoutMeta?.worker === true ? "on" : stats.layoutMeta?.fallbackReason ? "fallback" : "off"],
      ["validation", validation ? formatValidationSummary(validation) : "-"],
    ];
    const recentErrors = metrics.lastErrors || validation?.errors || [];
    this.debugPanel.innerHTML = `
      <div class="topo-debug-title">Realtime Debug</div>
      <div class="topo-debug-grid">
        ${rows.map(([label, value]) => `
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        `).join("")}
      </div>
      ${recentErrors.length ? `<div class="topo-debug-errors">${escapeHtml(recentErrors.slice(-2).join(" | "))}</div>` : ""}
    `;
  }

  render() {
    this.root.classList.toggle("no-animate", !this.animate);
    this.root.classList.toggle("is-performance", this.performanceMode);
    this.renderNodes();
    this.renderEdges();
    this.applyViewport();
  }

  renderNodeUpdates(ids = []) {
    this.renderNodes(ids);
  }

  renderNodes(nodeIds = null) {
    const targetIds = nodeIds == null ? null : new Set(nodeIds);
    const isPartialRender = Boolean(targetIds);
    if (!isPartialRender) {
      if (this.nodeAnimationFrame) cancelAnimationFrame(this.nodeAnimationFrame);
      if (this.nodeAnimationTimer) clearTimeout(this.nodeAnimationTimer);
      const nextIds = new Set(this.nodes.map((node) => node.id));
      for (const [id, element] of this.nodeElementById.entries()) {
        if (nextIds.has(id)) continue;
        element.remove();
        this.nodeElementById.delete(id);
      }
    }

    const animation = isPartialRender ? null : this.pendingNodeAnimation;
    const animatedElements = [];
    const targetNodes = targetIds
      ? [...targetIds].map((id) => this.nodeById.get(id)).filter(Boolean)
      : this.nodes;

    for (const node of targetNodes) {
      const type = this.resolveNodeType(node);
      const isGroupNode = isParentNode(node, type);
      const tagName = isGroupNode ? "DIV" : "BUTTON";
      let element = this.nodeElementById.get(node.id);
      if (!element || element.tagName !== tagName) {
        element?.remove();
        element = this.createNodeElement(node, type, isGroupNode);
        this.nodeElementById.set(node.id, element);
      }
      element.__topoNode = node;
      if (!isPartialRender && this.nodeLayer.lastChild !== element) this.nodeLayer.appendChild(element);
      else if (!element.parentNode) this.nodeLayer.appendChild(element);
      const sizeChanged = this.updateNodeElement(element, node, { type, isGroupNode, animation, animatedElements });
      if (sizeChanged) {
        const connectedEdgeIds = this.getConnectedEdgeIds([node.id]);
        if (connectedEdgeIds.length) this.renderEdges(connectedEdgeIds);
        this.scheduleMinimapRender();
      }
    }
    if (animatedElements.length) this.playNodeAnimation(animatedElements, animation);
    if (!isPartialRender) this.pendingNodeAnimation = null;
    this.renderSelection({ force: true });
    this.renderHoverHighlight({ force: true });
  }

  createNodeElement(node, type, isGroupNode) {
    const element = document.createElement(isGroupNode ? "div" : "button");
    if (!isGroupNode) element.type = "button";
    element.dataset.nodeId = node.id;
    element.dataset.nodeType = type;
    element.addEventListener("pointerdown", (event) => {
      const currentNode = element.__topoNode;
      if (!currentNode) return;
      if (isParentNode(currentNode, this.resolveNodeType(currentNode))) return;
      this.startNodeDrag(event, currentNode, element);
    });
    element.addEventListener("pointerenter", () => this.activateHoverHighlight(element.dataset.nodeId));
    element.addEventListener("pointerleave", () => this.clearHoverHighlight());
    element.addEventListener("click", (event) => {
      const currentNode = element.__topoNode;
      if (!currentNode) return;
      const currentType = this.resolveNodeType(currentNode);
      event.stopPropagation();
      if (currentNode.data?.action?.disableClick || isParentNode(currentNode, currentType)) {
        this.handleCloseInfo?.();
        return;
      }
      if (this.suppressNodeClick === currentNode.id) {
        this.suppressNodeClick = null;
        return;
      }
      this.selectGraphItem("node", currentNode.id, event, currentNode);
    });
    return element;
  }

  updateNodeElement(element, node, { type, isGroupNode, animation, animatedElements }) {
    const size = getNodeBaseSize(node);
    const status = node.data?.status || "ok";
    const position = this.getNodeAbsolutePosition(node);
    element.className = `topo-node ${type} status-${status}`;
    element.dataset.nodeId = node.id;
    element.dataset.nodeType = type;
    element.style.width = `${size.width}px`;
    element.style.height = `${size.height}px`;
    element.style.opacity = "";
    element.style.setProperty("--node-accent", node.data?.color || getDomainColor(node.data?.domain, status));
    element.classList.toggle("is-static", node.draggable === false || isGroupNode);

    const startPosition = animation?.from.get(node.id);
    const canAnimateNode = Boolean(animation && (startPosition || animation.enterFrom));
    element.classList.remove("is-animating", "is-entering");
    element.style.transform = startPosition
      ? `translate(${startPosition.x}px, ${startPosition.y}px)`
      : `translate(${position.x}px, ${position.y}px)`;
    if (canAnimateNode && !startPosition) {
      element.style.opacity = "0";
      element.style.transform = `translate(${animation.enterFrom.x}px, ${animation.enterFrom.y}px) scale(0.94)`;
    }
    if (canAnimateNode) {
      element.classList.add(startPosition ? "is-animating" : "is-entering");
      animatedElements.push({ element, position, hasStart: Boolean(startPosition) });
    }

    const contentKey = getNodeContentKey(node, type, this.performanceMode);
    if (element.__topoContentKey !== contentKey) {
      element.innerHTML = renderNodeContent(node, type);
      element.__topoContentKey = contentKey;
    }
    if (this.isAgentLoop() && isAgentLoopDeletableNode(node, type)) {
      element.querySelector(".agent-node-delete")?.remove();
      const deleteControl = document.createElement("span");
      deleteControl.className = "agent-node-delete";
      deleteControl.title = "Delete node";
      deleteControl.textContent = "×";
      deleteControl.addEventListener("pointerdown", (event) => event.stopPropagation());
      deleteControl.addEventListener("click", (event) => {
        event.stopPropagation();
        this.deleteNode(node.id);
      });
      element.appendChild(deleteControl);
    }
    return isGroupNode ? this.clearMeasuredNodeSize(node, size) : this.syncRenderedNodeSize(element, node, size);
  }

  syncRenderedNodeSize(element, node, baseSize) {
    if (this.performanceMode) return this.clearMeasuredNodeSize(node, baseSize);
    element.style.width = `${baseSize.width}px`;
    element.style.height = `${baseSize.height}px`;
    const measuredWidth = Math.max(Number(baseSize.width) || 0, Math.ceil(element.scrollWidth));
    const measuredHeight = Math.max(Number(baseSize.height) || 0, Math.ceil(element.scrollHeight));
    const nextSize = {
      width: measuredWidth,
      height: measuredHeight,
    };
    const previousSize = node.__topoMeasuredSize || baseSize;
    const changed = Math.abs((Number(previousSize.width) || 0) - nextSize.width) >= 1
      || Math.abs((Number(previousSize.height) || 0) - nextSize.height) >= 1;
    const needsMeasuredSize = measuredWidth > (Number(baseSize.width) || 0)
      || measuredHeight > (Number(baseSize.height) || 0);

    if (needsMeasuredSize) {
      Object.defineProperty(node, "__topoMeasuredSize", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: nextSize,
      });
      element.style.width = `${nextSize.width}px`;
      element.style.height = `${nextSize.height}px`;
      return changed;
    }

    return this.clearMeasuredNodeSize(node, baseSize) || changed;
  }

  refreshMeasurements() {
    if (this.performanceMode) {
      this.renderEdges();
      this.scheduleMinimapRender();
      return false;
    }

    const changedNodeIds = [];
    for (const node of this.nodes) {
      const element = this.nodeElementById.get(node.id);
      if (!element) continue;
      const type = this.resolveNodeType(node);
      if (isParentNode(node, type)) continue;
      const changed = this.syncRenderedNodeSize(element, node, getNodeBaseSize(node));
      if (changed) changedNodeIds.push(node.id);
    }

    if (changedNodeIds.length) {
      const connectedEdgeIds = this.getConnectedEdgeIds(changedNodeIds);
      if (connectedEdgeIds.length) this.renderEdges(connectedEdgeIds);
      this.scheduleMinimapRender();
      return true;
    }

    this.renderEdgeGeometryUpdates(this.edges.map((edge) => edge.id));
    return false;
  }

  clearMeasuredNodeSize(node, baseSize = getNodeBaseSize(node)) {
    const previousSize = node.__topoMeasuredSize;
    if (!previousSize) return false;
    delete node.__topoMeasuredSize;
    return Math.abs((Number(previousSize.width) || 0) - (Number(baseSize.width) || 0)) >= 1
      || Math.abs((Number(previousSize.height) || 0) - (Number(baseSize.height) || 0)) >= 1;
  }

  renderEdgeUpdates(ids = []) {
    if (this.performanceMode) this.renderEdgeGeometryUpdates(ids);
    else this.renderEdges(ids);
  }

  getConnectedEdgeIds(nodeIds = []) {
    const idSet = nodeIds instanceof Set ? nodeIds : new Set(nodeIds);
    if (!idSet.size) return [];
    const edgeIds = new Set();
    for (const nodeId of idSet) {
      for (const edgeId of this.edgeIdsByNodeId.get(nodeId) || []) edgeIds.add(edgeId);
    }
    return [...edgeIds];
  }

  shouldUseCanvasEdges() {
    return Boolean(
      this.canvasEdges
      && this.performanceMode
      && !this.isAgentLoop()
      && this.edges.length >= this.canvasEdgeThreshold,
    );
  }

  renderEdges(edgeIds = null) {
    if (this.shouldUseCanvasEdges()) {
      this.root.classList.add("is-canvas-edges");
      this.clearSvgEdges(edgeIds);
      this.scheduleCanvasEdgeRender();
      this.renderSelection({ force: true });
      this.renderHoverHighlight({ force: true });
      return;
    }

    this.root.classList.remove("is-canvas-edges");
    this.clearEdgeCanvas();
    this.ensureEdgeDefs();
    const targetIds = edgeIds == null ? null : new Set(edgeIds);
    const isPartialRender = Boolean(targetIds);
    if (!isPartialRender) {
      for (const [id, element] of this.edgeElementById.entries()) {
        if (this.edgeById.has(id)) continue;
        element.remove();
        this.edgeElementById.delete(id);
      }
    }

    const nodeById = this.nodeById;
    const edgeById = this.edgeById;
    const shouldRenderLabel = this.edgeLabelsVisible && !(this.performanceMode && this.edges.length > this.performanceEdgeLabelLimit);
    const targetEdges = targetIds
      ? [...targetIds].map((id) => edgeById.get(id)).filter(Boolean)
      : this.edges;

    for (const id of targetIds || []) {
      if (edgeById.has(id)) continue;
      this.edgeElementById.get(id)?.remove();
      this.edgeElementById.delete(id);
    }

    for (const edge of targetEdges) {
      const previousElement = this.edgeElementById.get(edge.id);
      previousElement?.remove();
      const element = this.createEdgeElement(edge, nodeById, shouldRenderLabel);
      if (!element) {
        this.edgeElementById.delete(edge.id);
        continue;
      }
      this.edgeElementById.set(edge.id, element);
      this.edgeLayer.appendChild(element);
    }
    this.renderSelection({ force: true });
    this.renderHoverHighlight({ force: true });
  }

  clearSvgEdges(edgeIds = null) {
    if (edgeIds == null) {
      for (const element of this.edgeElementById.values()) element.remove();
      this.edgeElementById.clear();
      return;
    }
    for (const id of edgeIds) {
      this.edgeElementById.get(id)?.remove();
      this.edgeElementById.delete(id);
    }
  }

  scheduleCanvasEdgeRender() {
    if (!this.edgeCanvas || this.edgeCanvasFrame) return;
    this.edgeCanvasFrame = requestAnimationFrame(() => {
      this.edgeCanvasFrame = null;
      this.renderCanvasEdges();
    });
  }

  clearEdgeCanvas() {
    if (!this.edgeCanvas) return;
    const context = this.edgeCanvas.getContext("2d");
    context?.clearRect(0, 0, this.edgeCanvas.width, this.edgeCanvas.height);
  }

  renderCanvasEdges() {
    if (!this.edgeCanvas) return;
    if (!this.shouldUseCanvasEdges()) {
      this.clearEdgeCanvas();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    const dpr = Math.max(1, Math.min(Number(this.canvasEdgePixelRatio) || 1, window.devicePixelRatio || 1));
    const canvasWidth = Math.ceil(width * dpr);
    const canvasHeight = Math.ceil(height * dpr);
    if (this.edgeCanvas.width !== canvasWidth || this.edgeCanvas.height !== canvasHeight) {
      this.edgeCanvas.width = canvasWidth;
      this.edgeCanvas.height = canvasHeight;
      this.edgeCanvas.style.width = `${width}px`;
      this.edgeCanvas.style.height = `${height}px`;
    }

    const context = this.edgeCanvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = this.performanceMode ? 1.35 : 2;

    const rankDir = this.layout.options.rankDir || "LR";
    const nodeBoxById = this.getViewportNodeBoxMap();
    const groups = new Map();
    const margin = 96;
    for (const edge of this.edges) {
      const sourceBox = nodeBoxById.get(edge.source);
      const targetBox = nodeBoxById.get(edge.target);
      if (!sourceBox || !targetBox) continue;
      const screenGeometry = buildEdgeGeometry(
        viewportBoxToGeometryNode(sourceBox),
        viewportBoxToGeometryNode(targetBox),
        rankDir,
        edge,
      );
      if (!isEdgeGeometryVisible(screenGeometry, width, height, margin)) continue;
      const status = edge.data?.status || "ok";
      if (!groups.has(status)) groups.set(status, []);
      groups.get(status).push(screenGeometry);
    }

    for (const [status, geometries] of groups.entries()) {
      context.beginPath();
      context.strokeStyle = getEdgeCanvasColor(status);
      context.globalAlpha = status === "ok" ? 0.78 : 0.92;
      for (const geometry of geometries) {
        context.moveTo(geometry.from.x, geometry.from.y);
        context.bezierCurveTo(
          geometry.c1.x,
          geometry.c1.y,
          geometry.c2.x,
          geometry.c2.y,
          geometry.to.x,
          geometry.to.y,
        );
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  getViewportNodeBoxMap() {
    const containerRect = this.container.getBoundingClientRect();
    const boxes = new Map();
    for (const [id, node] of this.nodeById.entries()) {
      const element = this.nodeElementById.get(id);
      if (element) {
        const rect = element.getBoundingClientRect();
        boxes.set(id, {
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        });
        continue;
      }
      const position = this.getNodeAbsolutePosition(node);
      const size = getNodeSize(node);
      boxes.set(id, {
        x: position.x * this.viewport.zoom + this.viewport.x,
        y: position.y * this.viewport.zoom + this.viewport.y,
        width: size.width * this.viewport.zoom,
        height: size.height * this.viewport.zoom,
      });
    }
    return boxes;
  }

  ensureEdgeDefs() {
    if (this.edgeDefs?.parentNode === this.edgeLayer) return;
    this.edgeDefs = document.createElementNS(SVG_NS, "defs");
    this.edgeDefs.innerHTML = `<marker id="${this.edgeMarkerId}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="currentColor"></path></marker>`;
    this.edgeLayer.prepend(this.edgeDefs);
  }

  createEdgeElement(edge, nodeById, shouldRenderLabel) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return null;
    const edgeType = this.resolveEdgeType(edge);
    const edgeShape = getEdgeShape(edgeType);
    const path = resolveEdgePath(edgeShape, {
      source: this.getRenderedNode(source),
      target: this.getRenderedNode(target),
      rankDir: this.layout.options.rankDir || "LR",
      edge,
      routing: edge.data?.routing || this.edgeRouting,
    });

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("topo-edge");
    group.dataset.edgeId = edge.id;
    group.dataset.edgeType = edgeType;
    group.__topoEdge = edge;
    if (edge.data?.color) group.style.color = edge.data.color;
    if (edgeShape?.className) group.classList.add(...toClassList(edgeShape.className));
    if ((edge.data?.parallelTotal || 1) > 1) {
      group.classList.add("is-parallel-edge");
      group.dataset.parallelTotal = String(edge.data.parallelTotal);
    }

    const visible = document.createElementNS(SVG_NS, "path");
    visible.setAttribute("d", path.d);
    visible.classList.add("topo-edge-path", `status-${edge.data?.status || "ok"}`);
    const gradientId = this.ensureEdgeGradient(edge, path);
    if (gradientId) visible.setAttribute("stroke", `url(#${gradientId})`);
    if (edgeShape?.pathClassName) visible.classList.add(...toClassList(edgeShape.pathClassName));
    const markerEnd = edge.markerEnd === false || edge.data?.markerEnd === false || edgeShape?.markerEnd === false
      ? ""
      : edge.markerEnd || edge.data?.markerEnd || edgeShape?.markerEnd || `url(#${this.edgeMarkerId})`;
    if (markerEnd) visible.setAttribute("marker-end", markerEnd);
    applySvgAttributes(visible, edgeShape?.pathAttributes, edge);

    const hit = document.createElementNS(SVG_NS, "path");
    hit.setAttribute("d", path.d);
    hit.classList.add("topo-edge-hit");
    hit.addEventListener("click", (event) => {
      const currentEdge = group.__topoEdge || edge;
      event.stopPropagation();
      this.selectGraphItem("edge", currentEdge.id, event, currentEdge);
    });

    group.append(visible, hit);
    if (edge.data?.targetDot !== false) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.classList.add("topo-edge-target-dot");
      dot.setAttribute("cx", String(path.target?.x ?? 0));
      dot.setAttribute("cy", String(path.target?.y ?? 0));
      dot.setAttribute("r", String(edge.data?.targetDotRadius || 3.4));
      if (edge.data?.targetColor) dot.setAttribute("fill", edge.data.targetColor);
      group.appendChild(dot);
    }
    const edgeLabel = typeof edgeShape?.labelFormatter === "function"
      ? edgeShape.labelFormatter(edge)
      : edge.label;
    if (edgeLabel && shouldRenderLabel) {
      const label = document.createElementNS(SVG_NS, "text");
      label.classList.add("topo-edge-label");
      label.setAttribute("x", String(path.label.x));
      label.setAttribute("y", String(path.label.y));
      label.textContent = edgeLabel;
      group.appendChild(label);
    }
    if (this.isAgentLoop()) {
      group.appendChild(this.createAgentEdgeAction(edge, path));
    }
    return group;
  }

  ensureEdgeGradient(edge, path) {
    if (!edge.data?.gradient || !edge.data?.sourceColor || !edge.data?.targetColor || !this.edgeDefs || !path.from || !path.to) return "";
    const id = `edge-gradient-${this.instanceId}-${cssSafeId(edge.id)}`;
    let gradient = this.edgeDefs.querySelector(`[data-edge-gradient-id="${id}"]`);
    let start;
    let end;
    if (!gradient) {
      gradient = document.createElementNS(SVG_NS, "linearGradient");
      gradient.setAttribute("id", id);
      gradient.setAttribute("data-edge-gradient-id", id);
      gradient.setAttribute("gradientUnits", "userSpaceOnUse");
      start = document.createElementNS(SVG_NS, "stop");
      start.setAttribute("offset", "0%");
      end = document.createElementNS(SVG_NS, "stop");
      end.setAttribute("offset", "100%");
      gradient.append(start, end);
      this.edgeDefs.appendChild(gradient);
    } else {
      const stops = gradient.querySelectorAll("stop");
      start = stops[0];
      end = stops[1];
    }
    gradient.setAttribute("x1", String(path.from.x));
    gradient.setAttribute("y1", String(path.from.y));
    gradient.setAttribute("x2", String(path.target?.x ?? path.to.x));
    gradient.setAttribute("y2", String(path.target?.y ?? path.to.y));
    start?.setAttribute("stop-color", edge.data.sourceColor);
    end?.setAttribute("stop-color", edge.data.targetColor);
    return id;
  }

  createAgentEdgeAction(edge, path) {
    const action = document.createElementNS(SVG_NS, "g");
    action.classList.add("topo-edge-add");
    action.dataset.edgeId = edge.id;
    action.setAttribute("transform", `translate(${path.label.x}, ${path.label.y + 20})`);
    action.setAttribute("tabindex", "0");
    action.setAttribute("role", "button");
    action.setAttribute("aria-label", "Add operator");

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "12");
    circle.classList.add("topo-edge-add-circle");

    const text = document.createElementNS(SVG_NS, "text");
    text.classList.add("topo-edge-add-text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = "+";

    const handleAdd = async (event) => {
      event.stopPropagation();
      const customNode = await this.renderAddNodeModal?.({
        edge: cloneGraphItem(edge),
        graph: this.getGraph(),
      });
      if (customNode === false) return;
      await this.insertNodeOnEdge(edge.id, customNode || undefined);
    };

    action.append(circle, text);
    action.addEventListener("click", handleAdd);
    circle.addEventListener("click", handleAdd);
    action.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      await this.insertNodeOnEdge(edge.id);
    });
    return action;
  }

  async insertNodeOnEdge(edgeId, node = {}, { centerNodeId } = {}) {
    const edge = this.edgeById.get(edgeId);
    if (!edge) return null;

    const nextNode = this.createAgentLoopNode(edge, node);
    const sourceEdge = {
      ...cloneGraphItem(edge),
      id: `${edge.id}:to:${nextNode.id}`,
      target: nextNode.id,
      label: edge.data?.sourceLabel || "输入",
      data: {
        ...edge.data,
        status: edge.data?.status || "ok",
      },
    };
    const targetEdge = {
      ...cloneGraphItem(edge),
      id: `${nextNode.id}:to:${edge.target}`,
      source: nextNode.id,
      label: edge.data?.targetLabel || edge.label || "输出",
      data: {
        ...edge.data,
        status: edge.data?.status || "ok",
      },
    };
    const nodes = [...this.getNodes(), nextNode];
    const edges = this.getEdges().filter((item) => item.id !== edgeId).concat(sourceEdge, targetEdge);
    await this.setData({ nodes, edges, centerNodeId: centerNodeId || nextNode.id, clearStatus: true });
    this.container.dispatchEvent(new CustomEvent("topo:agentloop-insert", {
      detail: { edgeId, node: cloneGraphItem(nextNode), edges: [sourceEdge, targetEdge] },
      bubbles: true,
    }));
    return nextNode;
  }

  async deleteNode(id, { reconnect = true, centerNodeId } = {}) {
    const node = this.nodeById.get(id);
    if (!node) return null;
    const incoming = this.edges.filter((edge) => edge.target === id);
    const outgoing = this.edges.filter((edge) => edge.source === id);
    const nextNodes = this.getNodes().filter((item) => item.id !== id);
    const nextEdges = this.getEdges().filter((edge) => edge.source !== id && edge.target !== id);

    if (reconnect && incoming.length === 1 && outgoing.length === 1 && incoming[0].source !== outgoing[0].target) {
      nextEdges.push({
        id: `reconnect:${incoming[0].source}:to:${outgoing[0].target}:${this.agentLoopInsertCount}`,
        source: incoming[0].source,
        target: outgoing[0].target,
        label: outgoing[0].label || incoming[0].label || "连接",
        data: {
          ...outgoing[0].data,
          status: maxEdgeStatus([incoming[0], outgoing[0]]),
        },
      });
    }

    this.onDeleteNode?.(cloneGraphItem(node), { graph: this.getGraph() });
    await this.setData({ nodes: nextNodes, edges: nextEdges, centerNodeId, clearStatus: true });
    this.container.dispatchEvent(new CustomEvent("topo:agentloop-delete", {
      detail: { node: cloneGraphItem(node) },
      bubbles: true,
    }));
    return node;
  }

  createAgentLoopNode(edge, node = {}) {
    this.agentLoopInsertCount += 1;
    const id = node.id || `operator-${this.agentLoopInsertCount}`;
    return {
      id,
      type: node.type || "operatorNode",
      ...node,
      data: {
        title: "新增算子",
        subTitle: edge.label ? `插入 ${edge.label}` : "Agent step",
        icon: "OP",
        domain: "operator",
        group: "compute",
        status: "ok",
        color: "#0891b2",
        metric: { label: "输入", value: "1" },
        size: { width: 200, height: 78 },
        ...node.data,
      },
    };
  }

  startNodeDrag(event, node, element) {
    if (!this.nodeDraggable || event.button !== 0 || node.draggable === false || node.data?.isParent) return;
    event.stopPropagation();
    const startPosition = this.getNodeAbsolutePosition(node);
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      nodeX: startPosition.x,
      nodeY: startPosition.y,
      moved: false,
    };
    const connectedEdgeIds = this.getConnectedEdgeIds([node.id]);

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.clientX) / this.viewport.zoom;
      const dy = (moveEvent.clientY - start.clientY) / this.viewport.zoom;
      if (!start.moved && Math.hypot(dx, dy) < 3) return;
      start.moved = true;
      const nextAbsolutePosition = {
        x: Math.round(start.nodeX + dx),
        y: Math.round(start.nodeY + dy),
      };
      node.position = this.toStoredNodePosition(node, nextAbsolutePosition);
      const renderPosition = this.getNodeAbsolutePosition(node);
      element.classList.add("is-dragging");
      this.root.classList.add("is-node-dragging");
      element.style.transform = `translate(${renderPosition.x}px, ${renderPosition.y}px)`;
      if (!this.shouldUseCanvasEdges()) this.scheduleEdgeRender(connectedEdgeIds, { geometryOnly: true });
      this.markMinimapDirty();
    };

    const end = (endEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      try {
        element.releasePointerCapture(endEvent.pointerId);
      } catch {
        // Pointer capture can already be released by the browser on cancellation.
      }
      element.classList.remove("is-dragging");
      this.root.classList.remove("is-node-dragging");

      if (!start.moved) return;
      this.suppressNodeClick = node.id;
      window.setTimeout(() => {
        if (this.suppressNodeClick === node.id) this.suppressNodeClick = null;
      }, 0);
      this.renderEdges(connectedEdgeIds);
      this.scheduleMinimapRender();
      if (this.selectionEnabled) this.setSelection({ nodes: [node.id], edges: [], primary: { type: "node", id: node.id } });
      else this.setSelectedItem({ type: "node", id: node.id });
      this.handleNodeClick?.(node);
      this.container.dispatchEvent(new CustomEvent("topo:node-drag", {
        detail: { node: { ...cloneGraphItem(node), positionAbsolute: this.getNodeAbsolutePosition(node) } },
        bubbles: true,
      }));
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Non-primary pointers may not allow capture in every browser.
    }
  }

  scheduleEdgeRender(edgeIds = null, { geometryOnly = false } = {}) {
    if (edgeIds == null) {
      this.pendingEdgeRenderIds = null;
      this.pendingEdgeGeometryOnly = false;
    } else if (this.pendingEdgeRenderIds !== null) {
      for (const id of edgeIds) this.pendingEdgeRenderIds.add(id);
      this.pendingEdgeGeometryOnly = this.pendingEdgeGeometryOnly && geometryOnly;
    } else if (!this.edgeRenderFrame) {
      this.pendingEdgeRenderIds = new Set(edgeIds);
      this.pendingEdgeGeometryOnly = Boolean(geometryOnly);
    }

    if (this.edgeRenderFrame) {
      if (!geometryOnly) this.pendingEdgeGeometryOnly = false;
      return;
    }
    this.edgeRenderFrame = requestAnimationFrame(() => {
      this.edgeRenderFrame = null;
      const edgeIdsToRender = this.pendingEdgeRenderIds;
      const shouldOnlyUpdateGeometry = Boolean(edgeIdsToRender && this.pendingEdgeGeometryOnly);
      this.pendingEdgeRenderIds = null;
      this.pendingEdgeGeometryOnly = false;
      if (shouldOnlyUpdateGeometry) this.renderEdgeGeometryUpdates(edgeIdsToRender);
      else this.renderEdges(edgeIdsToRender);
    });
  }

  renderEdgeGeometryUpdates(edgeIds = []) {
    if (this.shouldUseCanvasEdges()) {
      this.scheduleCanvasEdgeRender();
      return;
    }
    const missingEdgeIds = [];
    for (const edgeId of edgeIds) {
      const edge = this.edgeById.get(edgeId);
      const element = this.edgeElementById.get(edgeId);
      if (!edge || !element || !this.updateEdgeElementGeometry(element, edge)) {
        missingEdgeIds.push(edgeId);
      }
    }
    if (missingEdgeIds.length) this.renderEdges(missingEdgeIds);
  }

  updateEdgeElementGeometry(element, edge) {
    const source = this.nodeById.get(edge.source);
    const target = this.nodeById.get(edge.target);
    if (!source || !target) return false;
    const edgeType = this.resolveEdgeType(edge);
    const edgeShape = getEdgeShape(edgeType);
    const path = resolveEdgePath(edgeShape, {
      source: this.getRenderedNode(source),
      target: this.getRenderedNode(target),
      rankDir: this.layout.options.rankDir || "LR",
      edge,
      routing: edge.data?.routing || this.edgeRouting,
    });
    element.__topoEdge = edge;
    const visible = element.querySelector(".topo-edge-path");
    if (visible) {
      visible.setAttribute("d", path.d);
      setStatusClass(visible, edge.data?.status || "ok");
      const gradientId = this.ensureEdgeGradient(edge, path);
      if (gradientId) visible.setAttribute("stroke", `url(#${gradientId})`);
      else visible.removeAttribute("stroke");
    }
    element.querySelector(".topo-edge-hit")?.setAttribute("d", path.d);
    const dot = element.querySelector(".topo-edge-target-dot");
    if (dot) {
      dot.setAttribute("cx", String(path.target?.x ?? 0));
      dot.setAttribute("cy", String(path.target?.y ?? 0));
      if (edge.data?.targetColor) dot.setAttribute("fill", edge.data.targetColor);
      else dot.removeAttribute("fill");
    }
    const label = element.querySelector(".topo-edge-label");
    if (label) {
      label.setAttribute("x", String(path.label.x));
      label.setAttribute("y", String(path.label.y));
    }
    element.querySelector(".topo-edge-add")?.setAttribute("transform", `translate(${path.label.x}, ${path.label.y + 20})`);
    return true;
  }

  activateHoverHighlight(nodeId) {
    if (!this.hoverHighlight || this.performanceMode && this.nodes.length + this.edges.length > 8000) return;
    this.hoverState = this.computeHoverHighlight(nodeId, this.effectiveHoverHighlightDegree ?? this.hoverHighlightDegree);
    this.scheduleHoverRender();
  }

  clearHoverHighlight() {
    if (!this.hoverState) return;
    this.hoverState = null;
    this.scheduleHoverRender();
  }

  computeHoverHighlight(nodeId, degree = 1) {
    const relatedNodes = new Set([nodeId]);
    const relatedEdges = new Set();
    let frontier = new Set([nodeId]);
    const maxDegree = Math.max(0, Number(degree) || 0);

    for (let level = 0; level < maxDegree && frontier.size; level += 1) {
      const next = new Set();
      for (const frontierNodeId of frontier) {
        for (const edgeId of this.edgeIdsByNodeId.get(frontierNodeId) || []) {
          const edge = this.edgeById.get(edgeId);
          if (!edge) continue;
          relatedEdges.add(edge.id);
          if (!relatedNodes.has(edge.source)) next.add(edge.source);
          if (!relatedNodes.has(edge.target)) next.add(edge.target);
          relatedNodes.add(edge.source);
          relatedNodes.add(edge.target);
        }
      }
      frontier = next;
    }

    return { nodeId, relatedNodes, relatedEdges };
  }

  scheduleHoverRender() {
    if (this.hoverRenderFrame) return;
    this.hoverRenderFrame = requestAnimationFrame(() => {
      this.hoverRenderFrame = null;
      this.renderHoverHighlight();
    });
  }

  scheduleMinimapRender({ viewportOnly = false } = {}) {
    if (!this.minimapSvg) return;
    if (!this.minimapEnabled) {
      this.pendingMinimapRenderViewportOnly = false;
      return;
    }
    if (!viewportOnly) this.markMinimapDirty();
    const shouldOnlyUpdateViewport = viewportOnly && !this.minimapStaticDirty;
    if (this.minimapRenderFrame) {
      this.pendingMinimapRenderViewportOnly = this.pendingMinimapRenderViewportOnly && shouldOnlyUpdateViewport;
      return;
    }
    this.pendingMinimapRenderViewportOnly = shouldOnlyUpdateViewport;
    this.minimapRenderFrame = requestAnimationFrame(() => {
      this.minimapRenderFrame = null;
      const renderViewportOnly = this.pendingMinimapRenderViewportOnly && !this.minimapStaticDirty;
      this.pendingMinimapRenderViewportOnly = false;
      this.renderMinimap({ viewportOnly: renderViewportOnly });
    });
  }

  renderMinimap({ viewportOnly = false } = {}) {
    if (!this.minimapSvg) return;
    this.root.classList.toggle("has-minimap", this.minimapEnabled);
    if (!this.minimapEnabled || !this.nodes.length) {
      this.minimapSvg.innerHTML = "";
      this.minimapViewportElement = null;
      this.minimapTransform = null;
      this.markMinimapDirty();
      return;
    }

    if (viewportOnly && this.minimapViewportElement && this.minimapTransform) {
      this.updateMinimapViewport(this.minimapTransform);
      return;
    }

    const transform = this.getMinimapTransform();
    if (!transform) return;

    const { width, height, scale, offsetX, offsetY, bounds } = transform;
    this.minimapSvg.innerHTML = "";
    this.minimapViewportElement = null;
    this.minimapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML = `<filter id="${this.minimapShadowId}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#0f172a" flood-opacity="0.12"/></filter>`;
    this.minimapSvg.appendChild(defs);

    const nodeById = this.nodeById;
    if (this.edges.length <= this.minimapEdgeLimit) {
      const edgeLayer = document.createElementNS(SVG_NS, "g");
      edgeLayer.classList.add("topo-minimap-edges");
      for (const edge of this.edges) {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) continue;
        const sourceSize = getNodeSize(source);
        const targetSize = getNodeSize(target);
        const sourcePosition = this.getNodeAbsolutePosition(source);
        const targetPosition = this.getNodeAbsolutePosition(target);
        const line = document.createElementNS(SVG_NS, "line");
        line.classList.add("topo-minimap-edge");
        line.setAttribute("x1", String(offsetX + (sourcePosition.x + sourceSize.width / 2 - bounds.x) * scale));
        line.setAttribute("y1", String(offsetY + (sourcePosition.y + sourceSize.height / 2 - bounds.y) * scale));
        line.setAttribute("x2", String(offsetX + (targetPosition.x + targetSize.width / 2 - bounds.x) * scale));
        line.setAttribute("y2", String(offsetY + (targetPosition.y + targetSize.height / 2 - bounds.y) * scale));
        edgeLayer.appendChild(line);
      }
      this.minimapSvg.appendChild(edgeLayer);
    }

    const nodeLayer = document.createElementNS(SVG_NS, "g");
    nodeLayer.classList.add("topo-minimap-nodes");
    for (const node of this.nodes) {
      const size = getNodeSize(node);
      const position = this.getNodeAbsolutePosition(node);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.classList.add("topo-minimap-node");
      rect.setAttribute("x", String(offsetX + (position.x - bounds.x) * scale));
      rect.setAttribute("y", String(offsetY + (position.y - bounds.y) * scale));
      rect.setAttribute("width", String(Math.max(2, size.width * scale)));
      rect.setAttribute("height", String(Math.max(2, size.height * scale)));
      rect.setAttribute("rx", "1.5");
      rect.setAttribute("fill", node.data?.color || getDomainColor(node.data?.domain, node.data?.status || "ok"));
      if (!this.performanceMode && this.nodes.length <= 1000) rect.setAttribute("filter", `url(#${this.minimapShadowId})`);
      nodeLayer.appendChild(rect);
    }
    this.minimapSvg.appendChild(nodeLayer);

    const viewportRect = document.createElementNS(SVG_NS, "rect");
    viewportRect.classList.add("topo-minimap-viewport");
    this.minimapViewportElement = viewportRect;
    this.minimapSvg.appendChild(viewportRect);
    this.minimapStaticDirty = false;
    this.minimapTransform = transform;
    this.updateMinimapViewport(transform);
  }

  updateMinimapViewport(transform = this.getMinimapTransform()) {
    if (!transform || !this.minimapViewportElement) return;
    const { scale, offsetX, offsetY, bounds } = transform;
    const viewport = this.getVisibleGraphRect();
    const viewportRect = this.minimapViewportElement;
    viewportRect.setAttribute("x", String(offsetX + (viewport.x - bounds.x) * scale));
    viewportRect.setAttribute("y", String(offsetY + (viewport.y - bounds.y) * scale));
    viewportRect.setAttribute("width", String(Math.max(8, viewport.width * scale)));
    viewportRect.setAttribute("height", String(Math.max(8, viewport.height * scale)));
    viewportRect.setAttribute("rx", "2.5");
  }

  getMinimapTransform() {
    if (!this.nodes.length || !this.minimap) return null;
    const rect = this.minimap.getBoundingClientRect();
    const width = rect.width || this.minimapWidth;
    const height = rect.height || this.minimapHeight;
    const bounds = this.getBounds();
    if (!bounds.width || !bounds.height) return null;

    const padding = 10;
    const scale = Math.min((width - padding * 2) / bounds.width, (height - padding * 2) / bounds.height);
    if (!Number.isFinite(scale) || scale <= 0) return null;

    return {
      width,
      height,
      scale,
      bounds,
      offsetX: (width - bounds.width * scale) / 2,
      offsetY: (height - bounds.height * scale) / 2,
    };
  }

  getVisibleGraphRect() {
    const rect = this.container.getBoundingClientRect();
    return {
      x: -this.viewport.x / this.viewport.zoom,
      y: -this.viewport.y / this.viewport.zoom,
      width: rect.width / this.viewport.zoom,
      height: rect.height / this.viewport.zoom,
    };
  }

  renderHoverHighlight({ force = false } = {}) {
    const state = this.hoverState;
    const hasState = Boolean(state);
    this.root.classList.toggle("has-hover-highlight", hasState);

    const previous = this.renderedHover || { nodes: new Set(), edges: new Set() };
    const nextNodes = hasState ? state.relatedNodes : new Set();
    const nextEdges = hasState ? state.relatedEdges : new Set();

    for (const id of previous.nodes) {
      if (!force && nextNodes.has(id)) continue;
      this.nodeElementById.get(id)?.classList.remove("is-hover-related");
    }
    for (const id of previous.edges) {
      if (!force && nextEdges.has(id)) continue;
      this.edgeElementById.get(id)?.classList.remove("is-hover-related");
    }
    for (const id of nextNodes) {
      if (!force && previous.nodes.has(id)) continue;
      this.nodeElementById.get(id)?.classList.add("is-hover-related");
    }
    for (const id of nextEdges) {
      if (!force && previous.edges.has(id)) continue;
      this.edgeElementById.get(id)?.classList.add("is-hover-related");
    }

    this.renderedHover = {
      nodes: new Set(nextNodes),
      edges: new Set(nextEdges),
    };
  }

  renderSelection({ force = false } = {}) {
    const previous = this.renderedSelection || { nodes: new Set(), edges: new Set(), primary: null };
    const nextNodes = new Set(this.selectionEnabled ? this.selection?.nodes || [] : []);
    const nextEdges = new Set(this.selectionEnabled ? this.selection?.edges || [] : []);
    const nextPrimary = this.selected ? { ...this.selected } : null;

    for (const id of previous.nodes) {
      if (!force && nextNodes.has(id)) continue;
      this.nodeElementById.get(id)?.classList.remove("is-multi-selected");
    }
    for (const id of previous.edges) {
      if (!force && nextEdges.has(id)) continue;
      this.edgeElementById.get(id)?.classList.remove("is-multi-selected");
    }
    if (previous.primary && (force || !arePrimarySelectionsEqual(previous.primary, nextPrimary))) {
      this.getGraphElement(previous.primary.type, previous.primary.id)?.classList.remove("is-selected");
    }

    if (this.selectionEnabled) {
      for (const id of nextNodes) {
        if (!force && previous.nodes.has(id)) continue;
        this.nodeElementById.get(id)?.classList.add("is-multi-selected");
      }
      for (const id of nextEdges) {
        if (!force && previous.edges.has(id)) continue;
        this.edgeElementById.get(id)?.classList.add("is-multi-selected");
      }
    }
    if (nextPrimary) {
      const selectedElement = this.getGraphElement(nextPrimary.type, nextPrimary.id);
      selectedElement?.classList.add("is-selected");
      if (this.selectionEnabled) selectedElement?.classList.add("is-multi-selected");
    }

    this.renderedSelection = {
      nodes: nextNodes,
      edges: nextEdges,
      primary: nextPrimary,
    };
  }

  getGraphElement(type, id) {
    if (type === "node") return this.nodeElementById.get(id);
    if (type === "edge") return this.edgeElementById.get(id);
    return null;
  }

  applyViewport() {
    const value = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.zoom})`;
    const deferredEdges = this.markViewportInteraction();
    this.svg.style.transform = value;
    this.nodeLayer.style.transform = value;
    if (this.shouldUseCanvasEdges() && !deferredEdges) this.scheduleCanvasEdgeRender();
    this.scheduleMinimapRender({ viewportOnly: true });
    this.container.dispatchEvent(new CustomEvent("topo:viewport", {
      detail: { ...this.viewport },
      bubbles: true,
    }));
  }

  markViewportInteraction() {
    if (!this.hideEdgesOnViewportMove || !this.performanceMode || this.nodes.length + this.edges.length < this.performanceTotalElementLimit) return false;
    this.root.classList.add("is-viewport-moving");
    if (this.viewportInteractionTimer) clearTimeout(this.viewportInteractionTimer);
    this.viewportInteractionTimer = window.setTimeout(() => {
      this.viewportInteractionTimer = null;
      this.root.classList.remove("is-viewport-moving");
      if (this.shouldUseCanvasEdges()) this.scheduleCanvasEdgeRender();
    }, this.viewportInteractionSettleMs);
    return true;
  }

  graphPointToViewport(point) {
    return {
      x: point.x * this.viewport.zoom + this.viewport.x,
      y: point.y * this.viewport.zoom + this.viewport.y,
    };
  }

  getBounds(nodes = this.nodes) {
    if (!nodes.length) return { x: 0, y: 0, width: 1, height: 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const size = getNodeSize(node);
      const position = this.getNodeAbsolutePosition(node);
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + size.width);
      maxY = Math.max(maxY, position.y + size.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  captureNodePositions() {
    return new Map(this.nodes.map((node) => [node.id, {
      position: this.getNodeAbsolutePosition(node),
      size: getNodeSize(node),
    }]));
  }

  createNodeAnimation(previousPositions, { centerNodeId, disableAnimate } = {}) {
    if (disableAnimate || !this.animate || this.performanceMode || !previousPositions.size) return null;
    const from = new Map();
    let changed = false;
    for (const node of this.nodes) {
      const previous = previousPositions.get(node.id);
      if (!previous) continue;
      const next = this.getNodeAbsolutePosition(node);
      if (Math.abs(previous.position.x - next.x) > 1 || Math.abs(previous.position.y - next.y) > 1) {
        from.set(node.id, previous.position);
        changed = true;
      }
    }
    const centerPosition = centerNodeId ? previousPositions.get(centerNodeId)?.position : null;
    const hasNewNodes = this.nodes.some((node) => !previousPositions.has(node.id));
    if (!changed && !hasNewNodes) return null;
    return {
      from,
      enterFrom: centerPosition || [...previousPositions.values()][0]?.position || { x: 0, y: 0 },
      duration: this.config.nodeAnimationDuration ?? 280,
    };
  }

  playNodeAnimation(animatedElements, animation) {
    this.root.classList.add("is-node-animating");
    this.nodeAnimationFrame = requestAnimationFrame(() => {
      this.nodeAnimationFrame = null;
      for (const item of animatedElements) {
        item.element.style.transform = `translate(${item.position.x}px, ${item.position.y}px)`;
        item.element.style.opacity = "1";
        if (!item.hasStart) item.element.style.transform = `translate(${item.position.x}px, ${item.position.y}px) scale(1)`;
      }
      this.scheduleEdgeRender();
      this.scheduleMinimapRender();
    });
    this.nodeAnimationTimer = window.setTimeout(() => {
      this.nodeAnimationTimer = null;
      this.root.classList.remove("is-node-animating");
      this.root.querySelectorAll(".topo-node.is-animating, .topo-node.is-entering").forEach((element) => {
        element.classList.remove("is-animating", "is-entering");
        element.style.opacity = "";
      });
      this.container.dispatchEvent(new CustomEvent("topo:node-animation", {
        detail: { count: animatedElements.length },
        bubbles: true,
      }));
    }, animation.duration + 40);
  }

  resolveNodeType(node) {
    if (node.type) return node.type;
    if (node.data?.isParent) return "labeledGroupNode";
    return this.nodeType || "cardNode";
  }

  resolveEdgeType(edge) {
    return edge.type || edge.data?.edgeType || edge.data?.shape || "default";
  }

  getNodeAbsolutePosition(node, visited = new Set()) {
    const position = node?.position || { x: 0, y: 0 };
    if (!node?.parentId || visited.has(node.id)) {
      return { x: Number(position.x) || 0, y: Number(position.y) || 0 };
    }
    visited.add(node.id);
    const parent = this.nodeById.get(node.parentId);
    if (!parent) return { x: Number(position.x) || 0, y: Number(position.y) || 0 };
    const parentPosition = this.getNodeAbsolutePosition(parent, visited);
    return {
      x: parentPosition.x + (Number(position.x) || 0),
      y: parentPosition.y + (Number(position.y) || 0),
    };
  }

  getRenderedNode(node) {
    const rendered = {
      ...node,
      position: this.getNodeAbsolutePosition(node),
    };
    if (node.__topoMeasuredSize) {
      Object.defineProperty(rendered, "__topoMeasuredSize", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: node.__topoMeasuredSize,
      });
    }
    return rendered;
  }

  toStoredNodePosition(node, absolutePosition) {
    if (!node.parentId) return absolutePosition;
    const parent = this.nodeById.get(node.parentId);
    if (!parent) return absolutePosition;
    const parentPosition = this.getNodeAbsolutePosition(parent);
    return {
      x: absolutePosition.x - parentPosition.x,
      y: absolutePosition.y - parentPosition.y,
    };
  }
}

export class CopilotTopoGraph extends NewTopoGraph {
  constructor(options = {}) {
    super({
      ...options,
      config: { ...options.config, type: "copilot" },
    });
  }
}

export class AgentLoopTopoGraph extends NewTopoGraph {
  constructor(options = {}) {
    super({
      ...options,
      config: { ...options.config, type: "agentloop" },
    });
  }
}

function renderNodeContent(node, type = "cardNode") {
  const customShape = getNodeShape(type);
  if (customShape) {
    const rendered = renderCustomNodeShape(customShape, node, type);
    if (rendered != null) return rendered;
  }
  return renderDefaultNodeContent(node, type);
}

function getNodeContentKey(node, type = "cardNode", performanceMode = false) {
  const data = node.data || {};
  if (performanceMode && !getNodeShape(type)) {
    return [
      type,
      node.id,
      data.title || data._fields?.title || "",
      data.subTitle || data.summary || data._fields?.summary || data.name || data.domain || "",
      data.icon || data.style?.iconClass || "",
      data.badge || data.alarm || "",
      data.label || "",
    ].join("|");
  }
  return JSON.stringify({
    type,
    id: node.id,
    data,
  });
}

function renderDefaultNodeContent(node, type = "cardNode") {
  if (type === "labeledGroupNode" || type === "groupNodeWithHandles") return renderGroupNodeContent(node, type);
  if (type === "cardLayerNode") return renderCardLayerNodeContent(node);
  if (["componentNode", "planNode", "operatorNode", "inputSourceNode", "sinkNode", "flowNode", "flowLayerNode", "agentRunNode", "agentStepNode", "toolCallNode", "mcpServerNode", "skillNode", "artifactNode", "contextNode"].includes(type)) {
    return renderRichNodeContent(node, type);
  }

  const data = node.data || {};
  const status = data.status || "ok";
  const metric = data.metric ? `<div class="node-metric"><span>${escapeHtml(data.metric.label)}</span><strong>${escapeHtml(data.metric.value)}</strong></div>` : "";
  const tags = (data.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `
    <div class="node-head">
      <span class="node-icon">${escapeHtml(data.icon || "N")}</span>
      <span class="node-status ${status}"></span>
    </div>
    <div class="node-title">${escapeHtml(data.title || node.id)}</div>
    <div class="node-subtitle">${escapeHtml(data.subTitle || data.domain || "")}</div>
    ${metric}
    <div class="node-tags">${tags}</div>
  `;
}

function renderCustomNodeShape(shape, node, type) {
  const renderer = typeof shape === "function" ? shape : shape.render;
  if (typeof renderer !== "function") return null;
  return renderer(node, {
    type,
    escapeHtml,
    renderMetric: renderNodeMetric,
    defaultRender: () => renderDefaultNodeContent(node, type),
  });
}

function isAgentLoopDeletableNode(node, type) {
  return type === "operatorNode" && node.data?.action?.disableDelete !== true;
}

function maxEdgeStatus(edges = []) {
  const weight = { ok: 0, warn: 1, critical: 2 };
  return edges.reduce((current, edge) => {
    const status = edge.data?.status || "ok";
    return (weight[status] ?? 0) > (weight[current] ?? 0) ? status : current;
  }, "ok");
}

function renderCardLayerNodeContent(node) {
  const data = node.data || {};
  const status = data.status || "ok";
  const descriptionItems = Array.isArray(data.descriptions)
    ? data.descriptions
    : data.description
      ? [data.description]
      : [];
  const descriptions = descriptionItems
    .slice(0, 3)
    .map((item) => `<div class="layer-description">${escapeHtml(item.label || item.name || item)}<strong>${escapeHtml(item.value || "")}</strong></div>`)
    .join("");
  const badge = data.badge || data.alarm || (status !== "ok" ? status : "");
  return `
    <div class="node-handle handle-top"></div>
    <div class="layer-node-head">
      <span class="node-icon">${escapeHtml(data.icon || data.style?.iconClass || "N")}</span>
      <div class="layer-node-title-wrap">
        <div class="node-title">${escapeHtml(data.title || node.id)}</div>
        <div class="node-subtitle">${escapeHtml(data.subTitle || data.name || data.domain || "")}</div>
      </div>
      ${badge ? `<span class="node-badge">${escapeHtml(badge)}</span>` : ""}
    </div>
    ${descriptions ? `<div class="layer-descriptions">${descriptions}</div>` : renderNodeMetric(data)}
    <div class="node-handle handle-bottom"></div>
  `;
}

function renderRichNodeContent(node, type) {
  const data = node.data || {};
  const title = data.title || data._fields?.title || node.id;
  const summary = data.summary || data._fields?.summary || data.subTitle || "";
  return `
    <div class="node-handle handle-top"></div>
    <div class="rich-node-head">
      <span class="node-icon">${escapeHtml(data.icon || data.style?.iconClass || type.slice(0, 2).toUpperCase())}</span>
      <div>
        <div class="node-title">${escapeHtml(title)}</div>
        <div class="node-subtitle">${escapeHtml(summary)}</div>
      </div>
    </div>
    ${renderNodeMetric(data)}
    <div class="node-handle handle-bottom"></div>
  `;
}

function renderGroupNodeContent(node, type) {
  const data = node.data || {};
  const label = data.label || data.title || node.id;
  return `
    <div class="group-node-frame">
      <div class="group-node-label">${escapeHtml(label)}</div>
      ${type === "groupNodeWithHandles" ? '<div class="node-handle handle-top"></div><div class="node-handle handle-bottom"></div>' : ""}
    </div>
  `;
}

function renderNodeMetric(data) {
  return data.metric
    ? `<div class="node-metric"><span>${escapeHtml(data.metric.label)}</span><strong>${escapeHtml(data.metric.value)}</strong></div>`
    : "";
}

function buildEdgePath(source, target, rankDir, edge = {}) {
  const routing = edge.data?.routing || edge.routing || "default";
  const geometry = routing === "flow" || routing === "umodel"
    ? buildFlowEdgeGeometry(source, target, edge)
    : buildEdgeGeometry(source, target, rankDir, edge);
  const second = geometry.segment2
    ? ` C ${geometry.segment2.c1.x} ${geometry.segment2.c1.y}, ${geometry.segment2.c2.x} ${geometry.segment2.c2.y}, ${geometry.segment2.to.x} ${geometry.segment2.to.y}`
    : "";
  return {
    d: `M ${geometry.from.x} ${geometry.from.y} C ${geometry.c1.x} ${geometry.c1.y}, ${geometry.c2.x} ${geometry.c2.y}, ${geometry.to.x} ${geometry.to.y}${second}`,
    from: geometry.from,
    label: geometry.label,
    target: geometry.segment2?.to || geometry.to,
    to: geometry.segment2?.to || geometry.to,
  };
}

function resolveEdgePath(edgeShape, context) {
  if (typeof edgeShape?.pathBuilder === "function") {
    const customPath = edgeShape.pathBuilder({
      ...context,
      getNodeSize,
      defaultPath: () => buildEdgePath(context.source, context.target, context.rankDir, context.edge),
    });
    if (typeof customPath === "string") return { d: customPath, label: buildEdgeLabel(context.source, context.target) };
    if (customPath?.d) return {
      d: customPath.d,
      label: customPath.label || buildEdgeLabel(context.source, context.target),
    };
  }
  return buildEdgePath(context.source, context.target, context.rankDir, {
    ...context.edge,
    routing: context.routing,
  });
}

function buildEdgeLabel(source, target) {
  const sourceSize = getNodeSize(source);
  const targetSize = getNodeSize(target);
  return {
    x: (source.position.x + sourceSize.width / 2 + target.position.x + targetSize.width / 2) / 2,
    y: (source.position.y + sourceSize.height / 2 + target.position.y + targetSize.height / 2) / 2 - 8,
  };
}

function buildEdgeGeometry(source, target, rankDir, edge = {}) {
  const sourceSize = getNodeSize(source);
  const targetSize = getNodeSize(target);
  const parallelOffset = Number(edge.data?.parallelOffset || 0);

  if (rankDir === "TB") {
    const baseFrom = {
      x: source.position.x + sourceSize.width / 2,
      y: source.position.y + sourceSize.height,
    };
    const baseTo = {
      x: target.position.x + targetSize.width / 2,
      y: target.position.y,
    };
    const normal = getNormal(baseTo.x - baseFrom.x, baseTo.y - baseFrom.y);
    const from = offsetPoint(baseFrom, normal, parallelOffset);
    const to = offsetPoint(baseTo, normal, parallelOffset);
    const mid = (from.y + to.y) / 2;
    return {
      from,
      c1: { x: from.x, y: mid },
      c2: { x: to.x, y: mid },
      to,
      label: { x: (from.x + to.x) / 2, y: mid - 8 },
    };
  }

  const sourceCenter = {
    x: source.position.x + sourceSize.width / 2,
    y: source.position.y + sourceSize.height / 2,
  };
  const targetCenter = {
    x: target.position.x + targetSize.width / 2,
    y: target.position.y + targetSize.height / 2,
  };
  const from = getAnchorPoint(source, sourceSize, targetCenter);
  const to = getAnchorPoint(target, targetSize, sourceCenter);
  const sx = from.x;
  const sy = from.y;
  const tx = to.x;
  const ty = to.y;
  const dx = tx - sx;
  const dy = ty - sy;
  const normal = getNormal(dx, dy);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const bend = Math.max(70, Math.hypot(dx, dy) * 0.34);
  const c1 = horizontal ? { x: sx + Math.sign(dx || 1) * bend, y: sy } : { x: sx, y: sy + Math.sign(dy || 1) * bend };
  const c2 = horizontal ? { x: tx - Math.sign(dx || 1) * bend, y: ty } : { x: tx, y: ty - Math.sign(dy || 1) * bend };
  const shiftedFrom = offsetPoint({ x: sx, y: sy }, normal, parallelOffset);
  const shiftedTo = offsetPoint({ x: tx, y: ty }, normal, parallelOffset);
  const shiftedC1 = offsetPoint(c1, normal, parallelOffset);
  const shiftedC2 = offsetPoint(c2, normal, parallelOffset);
  return {
    from: shiftedFrom,
    c1: shiftedC1,
    c2: shiftedC2,
    to: shiftedTo,
    label: { x: (shiftedFrom.x + shiftedTo.x) / 2, y: (shiftedFrom.y + shiftedTo.y) / 2 - 8 },
  };
}

function buildFlowEdgeGeometry(source, target, edge = {}) {
  const sourceSize = getNodeSize(source);
  const targetSize = getNodeSize(target);
  const sourceCenter = {
    x: source.position.x + sourceSize.width / 2,
    y: source.position.y + sourceSize.height / 2,
  };
  const targetCenter = {
    x: target.position.x + targetSize.width / 2,
    y: target.position.y + targetSize.height / 2,
  };
  const direction = targetCenter.x >= sourceCenter.x ? 1 : -1;
  const parallelOffset = Number(edge.data?.parallelOffset || 0);
  const sourceOffset = Number(edge.data?.sourceOffset || 0);
  const targetOffset = Number(edge.data?.targetOffset || 0);
  const from = {
    x: direction > 0 ? source.position.x + sourceSize.width : source.position.x,
    y: sourceCenter.y + sourceOffset,
  };
  const to = {
    x: direction > 0 ? target.position.x : target.position.x + targetSize.width,
    y: targetCenter.y + targetOffset,
  };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const normal = getNormal(dx, dy);
  const shiftedFrom = offsetPoint(from, normal, parallelOffset);
  const shiftedTo = offsetPoint(to, normal, parallelOffset);
  const distance = Math.max(1, Math.abs(dx));
  const bend = clamp(distance * 0.42, 42, Math.max(42, distance * 0.48));
  const yBend = clamp(Math.abs(dy) * 0.08, 0, 22) * Math.sign(dy || 1);
  const c1 = {
    x: from.x + direction * bend,
    y: from.y + yBend,
  };
  const c2 = {
    x: to.x - direction * bend,
    y: to.y - yBend,
  };
  const shiftedC1 = offsetPoint(c1, normal, parallelOffset);
  const shiftedC2 = offsetPoint(c2, normal, parallelOffset);

  return {
    from: shiftedFrom,
    c1: shiftedC1,
    c2: shiftedC2,
    to: shiftedTo,
    label: { x: (shiftedC1.x + shiftedC2.x) / 2, y: (shiftedFrom.y + shiftedTo.y) / 2 - 8 },
  };
}

function viewportBoxToGeometryNode(box) {
  return {
    position: { x: box.x, y: box.y },
    data: { size: { width: box.width, height: box.height } },
  };
}

function isEdgeGeometryVisible(geometry, width, height, margin = 0) {
  const points = [geometry.from, geometry.c1, geometry.c2, geometry.to];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return maxX >= -margin
    && minX <= width + margin
    && maxY >= -margin
    && minY <= height + margin;
}

function getNormal(dx, dy) {
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: -dy / length,
    y: dx / length,
  };
}

function offsetPoint(point, normal, offset) {
  if (!offset) return point;
  return {
    x: Math.round((point.x + normal.x * offset) * 10) / 10,
    y: Math.round((point.y + normal.y * offset) * 10) / 10,
  };
}

function getAnchorPoint(node, size, toward) {
  const center = {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: center.x + Math.sign(dx || 1) * size.width / 2,
      y: center.y,
    };
  }
  return {
    x: center.x,
    y: center.y + Math.sign(dy || 1) * size.height / 2,
  };
}

function getDomainColor(domain, status) {
  const colors = {
    external: "#64748b",
    loadbalancer: "#0ea5e9",
    ecs: "#2563eb",
    redis: "#16a34a",
    rds: "#dc2626",
    log: "#7c3aed",
    alert: "#d97706",
    gateway: "#0891b2",
    function: "#9333ea",
    queue: "#ea580c",
  };
  return colors[domain] || colors[status] || "#2563eb";
}

function getEdgeCanvasColor(status = "ok") {
  const colors = {
    ok: "#8ba4bd",
    warn: "#d9822b",
    critical: "#d64545",
    running: "#0064c8",
  };
  return colors[status] || colors.ok;
}

function setStatusClass(element, status = "ok") {
  if (!element?.classList) return;
  for (const name of [...element.classList]) {
    if (name.startsWith("status-")) element.classList.remove(name);
  }
  element.classList.add(`status-${status}`);
}

function getRelatedData(focusId, nodes, edges, { degree = 1, direction = "both" } = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (!nodeById.has(focusId)) return { nodes: [], edges: [] };
  const edgeIdsByNodeId = new Map();
  const edgeById = new Map();
  for (const edge of edges) {
    if (!edge?.id) continue;
    edgeById.set(edge.id, edge);
    for (const nodeId of [edge.source, edge.target]) {
      if (!nodeId) continue;
      if (!edgeIdsByNodeId.has(nodeId)) edgeIdsByNodeId.set(nodeId, new Set());
      edgeIdsByNodeId.get(nodeId).add(edge.id);
    }
  }

  const relatedNodes = new Set([focusId]);
  const relatedEdges = new Set();
  let frontier = new Set([focusId]);
  const maxDegree = Math.max(1, Number(degree) || 1);

  for (let level = 0; level < maxDegree && frontier.size; level += 1) {
    const next = new Set();
    const candidateEdgeIds = new Set();
    for (const frontierNodeId of frontier) {
      for (const edgeId of edgeIdsByNodeId.get(frontierNodeId) || []) candidateEdgeIds.add(edgeId);
    }
    for (const edgeId of candidateEdgeIds) {
      const edge = edgeById.get(edgeId);
      if (!edge) continue;
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

function disableExpandAction(node) {
  return {
    ...cloneGraphItem(node),
    data: {
      ...node.data,
      action: {
        ...node.data?.action,
        enableExpand: false,
      },
    },
  };
}

function isParentNode(node, type) {
  return Boolean(node?.data?.isParent || type === "labeledGroupNode" || type === "groupNodeWithHandles");
}

function mergeNodePatch(node, patch) {
  return {
    ...node,
    ...patch,
    data: patch.data ? { ...node.data, ...patch.data } : node.data,
    position: patch.position ? { ...patch.position } : node.position,
    style: patch.style ? { ...node.style, ...patch.style } : node.style,
  };
}

function mergeEdgePatch(edge, patch) {
  return {
    ...edge,
    ...patch,
    data: patch.data ? { ...edge.data, ...patch.data } : edge.data,
  };
}

function createValidationResult(nodes = [], edges = []) {
  return {
    valid: true,
    hasWarnings: false,
    errors: [],
    warnings: [],
    nodes: nodes.map((node) => cloneGraphItem(node)),
    edges: edges.map((edge) => cloneGraphItem(edge)),
    duplicateNodes: 0,
    duplicateEdges: 0,
    invalidEdges: 0,
    invalidStatuses: 0,
    missingTitles: 0,
    cyclicParents: 0,
    unknownNodeTypes: 0,
  };
}

function createGraphInstanceId() {
  graphInstanceSeed += 1;
  return `graph-${graphInstanceSeed}`;
}

function normalizeGraphItemList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value instanceof Map) return [...value.values()].filter(Boolean);
  if (value instanceof Set) return [...value].filter(Boolean);
  if (typeof value === "object") return Object.entries(value).map(([id, item]) => ({ id, ...(item || {}) }));
  return [];
}

function normalizeIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value instanceof Set) return [...value].filter(Boolean);
  if (value instanceof Map) return [...value.keys()].filter(Boolean);
  return [value].filter(Boolean);
}

function normalizePatchList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value instanceof Map) {
    return [...value.entries()].map(([id, patch]) => ({ id, ...(patch || {}) }));
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([id, patch]) => ({ id, ...(patch || {}) }));
  }
  return [];
}

function patchFromRealtimeItem(item = {}) {
  const { data, id, patch, position, replace, style, ...rest } = item;
  return {
    ...rest,
    ...(patch || {}),
    ...(data ? { data } : {}),
    ...(position ? { position } : {}),
    ...(style ? { style } : {}),
  };
}

function cloneSelection(selection = {}) {
  return {
    nodes: [...(selection.nodes || [])],
    edges: [...(selection.edges || [])],
    primary: selection.primary ? { ...selection.primary } : null,
  };
}

function areSelectionsEqual(left = {}, right = {}) {
  return arrayEqual(left.nodes || [], right.nodes || [])
    && arrayEqual(left.edges || [], right.edges || [])
    && (left.primary?.type || "") === (right.primary?.type || "")
    && (left.primary?.id || "") === (right.primary?.id || "");
}

function arePrimarySelectionsEqual(left = null, right = null) {
  return (left?.type || "") === (right?.type || "")
    && (left?.id || "") === (right?.id || "");
}

function arrayEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function resolvePrimarySelection(selection = {}) {
  if (selection.nodes?.length) return { type: "node", id: selection.nodes[0] };
  if (selection.edges?.length) return { type: "edge", id: selection.edges[0] };
  return null;
}

function hasSelection(selection = {}) {
  return Boolean(selection.nodes?.length || selection.edges?.length);
}

function normalizeRect(rect = {}) {
  const x = Number(rect.x) || 0;
  const y = Number(rect.y) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function doesNodeRectIntersect(node, rect, resolvePosition) {
  const position = resolvePosition(node);
  const size = getNodeSize(node);
  return rectsIntersect(rect, {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  });
}

function rectsIntersect(left, right) {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y;
}

function segmentIntersectsRect(a, b, rect) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  return segmentsIntersect(a, b, topLeft, topRight)
    || segmentsIntersect(a, b, topRight, bottomRight)
    || segmentsIntersect(a, b, bottomRight, bottomLeft)
    || segmentsIntersect(a, b, bottomLeft, topLeft);
}

function pointInRect(point, rect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function segmentsIntersect(a, b, c, d) {
  const orientationA = orientation(a, b, c);
  const orientationB = orientation(a, b, d);
  const orientationC = orientation(c, d, a);
  const orientationD = orientation(c, d, b);

  if (orientationA !== orientationB && orientationC !== orientationD) return true;
  if (orientationA === 0 && pointOnSegment(c, a, b)) return true;
  if (orientationB === 0 && pointOnSegment(d, a, b)) return true;
  if (orientationC === 0 && pointOnSegment(a, c, d)) return true;
  if (orientationD === 0 && pointOnSegment(b, c, d)) return true;
  return false;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(point, a, b) {
  return point.x <= Math.max(a.x, b.x) + 0.000001
    && point.x >= Math.min(a.x, b.x) - 0.000001
    && point.y <= Math.max(a.y, b.y) + 0.000001
    && point.y >= Math.min(a.y, b.y) - 0.000001;
}

function matchesSelectionCriteria(item, kind, criteria = {}) {
  if (typeof criteria.predicate === "function" && criteria.predicate(item, kind)) return true;
  const data = item.data || {};
  const tagValues = Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [];
  if (matchesCriteriaValue(item.id, criteria.ids, criteria.id)) return true;
  if (kind === "node" && matchesCriteriaValue(item.id, criteria.nodeIds, criteria.nodeId)) return true;
  if (kind === "edge" && matchesCriteriaValue(item.id, criteria.edgeIds, criteria.edgeId)) return true;
  if (matchesCriteriaValue(item.type, criteria.types, criteria.type)) return true;
  if (matchesCriteriaValue(data.domain, criteria.domains, criteria.domain)) return true;
  if (matchesCriteriaValue(data.status, criteria.statuses, criteria.status)) return true;
  if (matchesCriteriaValue(data.group, criteria.groups, criteria.group)) return true;
  if (matchesCriteriaList(tagValues, criteria.tags, criteria.tag)) return true;
  if (kind === "edge" && (
    matchesCriteriaValue(item.source, criteria.sources, criteria.source)
    || matchesCriteriaValue(item.target, criteria.targets, criteria.target)
  )) {
    return true;
  }
  return false;
}

function matchesCriteriaValue(value, plural, singular) {
  const values = normalizeCriteriaValues(plural, singular);
  if (!values.length) return false;
  return values.some((item) => String(value ?? "") === String(item));
}

function matchesCriteriaList(itemValues, plural, singular) {
  const values = normalizeCriteriaValues(plural, singular);
  if (!values.length) return false;
  const normalizedItems = new Set(itemValues.map((item) => String(item)));
  return values.some((item) => normalizedItems.has(String(item)));
}

function normalizeCriteriaValues(plural, singular) {
  const values = [];
  if (Array.isArray(plural)) values.push(...plural);
  else if (plural instanceof Set) values.push(...plural);
  else if (plural != null) values.push(plural);
  if (singular != null) values.push(singular);
  return values.filter((value) => value != null && value !== "");
}

function isAdditiveSelectionEvent(event) {
  if (!event) return false;
  return event.ctrlKey || event.metaKey;
}

function isEditableTarget(target) {
  if (!target) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function formatDebugValue(value, suffix = "") {
  if (value == null || value === "") return "-";
  if (Number.isFinite(value)) return `${Math.round(value * 10) / 10}${suffix}`;
  return String(value);
}

function formatValidationSummary(validation = {}) {
  const errorCount = validation.errors?.length
    ?? ((validation.duplicateNodes || 0) + (validation.duplicateEdges || 0) + (validation.invalidEdges || 0));
  const warningCount = validation.warnings?.length
    ?? ((validation.invalidStatuses || 0) + (validation.missingTitles || 0) + (validation.cyclicParents || 0) + (validation.unknownNodeTypes || 0));
  if (!errorCount && !warningCount) return "ok";
  return `${errorCount}e/${warningCount}w`;
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

function toClassList(value) {
  return String(value || "")
    .split(/\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function applySvgAttributes(element, attributes, edge) {
  const resolved = typeof attributes === "function" ? attributes(edge) : attributes;
  if (!resolved || typeof resolved !== "object") return;
  Object.entries(resolved).forEach(([name, value]) => {
    if (value == null || value === false) return;
    element.setAttribute(name, String(value));
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function cssSafeId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
