export type TopologyStatus = "pending" | "running" | "ok" | "warn" | "critical" | (string & {});
export type TopologyDirection = "upstream" | "downstream" | "both";
export type TopologyContextScope = "visible" | "selected" | "neighborhood" | "custom";
export type TopologyContextIncludeMode = "explicit" | "connectedEdges" | "oneHop" | "visible";
export type TopologySelectionMode = "default" | "area";
export type TopologySelectionKind = "node" | "edge";
export type RealtimeTopologyMessageType = "snapshot" | "nodePatch" | "edgePatch" | "topologyPatch";
export type TopologyDataTransport = "manual" | "websocket" | "sse" | "polling";
export type TopologyConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "stale" | "offline";
export type AgentActivityKind = "run" | "step" | "tool" | "mcp" | "skill" | "artifact" | "context";
export type AgentActivityStatus = "pending" | "running" | "ok" | "warn" | "critical";
export type AgentActivityEventType =
  | "agent.run.started"
  | "agent.run.completed"
  | "agent.run.failed"
  | "agent.step.started"
  | "agent.step.completed"
  | "agent.step.failed"
  | "agent.tool.started"
  | "agent.tool.completed"
  | "agent.tool.failed"
  | "agent.mcp.requested"
  | "agent.mcp.completed"
  | "agent.mcp.failed"
  | "agent.skill.used"
  | "agent.artifact.created"
  | "agent.context.used";
export type ChatTopologyBlockKind = "topology" | "activity-trace";

export interface TopologyPoint {
  x: number;
  y: number;
}

export interface TopologyViewport extends TopologyPoint {
  zoom: number;
}

export interface TopologyMetric {
  label?: string;
  value?: string | number;
  [key: string]: unknown;
}

export interface TopologyNodeData {
  title?: string;
  label?: string;
  name?: string;
  subTitle?: string;
  summary?: string;
  domain?: string;
  group?: string;
  icon?: string;
  color?: string;
  status?: TopologyStatus;
  metric?: TopologyMetric;
  tags?: string[];
  size?: { width?: number; height?: number } | [number, number];
  isParent?: boolean;
  action?: Record<string, unknown>;
  descriptions?: Array<string | { label?: string; name?: string; value?: string | number }>;
  datasets?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TopologyNode {
  id: string;
  type?: string;
  data?: TopologyNodeData;
  position?: TopologyPoint;
  parentId?: string;
  extent?: "parent" | string;
  expandParent?: boolean;
  draggable?: boolean;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TopologyEdgeData {
  status?: TopologyStatus;
  latency?: string | number;
  traffic?: string | number;
  edgeType?: string;
  shape?: string;
  parallelTotal?: number;
  parallelOffset?: number;
  [key: string]: unknown;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  markerEnd?: string | false;
  data?: TopologyEdgeData;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TopologyGraphData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TopologySelectionItem {
  type: TopologySelectionKind;
  id: string;
}

export interface TopologySelection {
  nodes: string[];
  edges: string[];
  primary?: TopologySelectionItem | null;
}

export interface TopologySelectionCriteria {
  id?: string;
  ids?: string[] | Set<string>;
  nodeId?: string;
  nodeIds?: string[] | Set<string>;
  edgeId?: string;
  edgeIds?: string[] | Set<string>;
  type?: string;
  types?: string[] | Set<string>;
  domain?: string;
  domains?: string[] | Set<string>;
  status?: TopologyStatus;
  statuses?: TopologyStatus[] | Set<TopologyStatus>;
  tag?: string;
  tags?: string[] | Set<string>;
  group?: string;
  groups?: string[] | Set<string>;
  source?: string;
  sources?: string[] | Set<string>;
  target?: string;
  targets?: string[] | Set<string>;
  predicate?: (item: TopologyNode | TopologyEdge, kind: TopologySelectionKind) => boolean;
  [key: string]: unknown;
}

export interface TopologyContextOptions {
  scope?: TopologyContextScope;
  includeMode?: TopologyContextIncludeMode;
  ids?: string[];
  degree?: number;
  direction?: TopologyDirection;
  includeEdges?: boolean;
  includeViewport?: boolean;
  includeMetrics?: boolean;
  maxNodes?: number;
  maxEdges?: number;
  redaction?: {
    allowFields?: string[];
    denyFields?: string[];
  };
  format?: "json" | "markdown" | "both";
  [key: string]: unknown;
}

export interface TopologyContextEnvelope {
  schema: "opentopox.agent-context.v1";
  createdAt: string;
  source: {
    library: "opentopox";
    graphType: string;
    layout?: string;
    version?: string;
  };
  scope: {
    type: TopologyContextScope;
    includeMode?: TopologyContextIncludeMode;
    selected?: TopologySelectionItem[];
    visibleRect?: { x: number; y: number; width: number; height: number };
    degree?: number;
    direction?: string;
  };
  viewport?: TopologyViewport;
  summary: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    originalNodeCount?: number;
    originalEdgeCount?: number;
    truncated: boolean;
    redactedFields: string[];
  };
}

export interface SerializedTopologyContext {
  envelope: TopologyContextEnvelope;
  json: string;
  markdown: string;
}

export interface CopyTopologyContextResult {
  copied: boolean;
  text: string;
  context: TopologyContextEnvelope;
  error?: unknown;
}

export interface AgentActivityReference {
  id?: string;
  schema?: string;
  type?: string;
  name?: string;
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  nodeCount?: number;
  edgeCount?: number;
  size?: number;
  durationMs?: number;
  truncated?: boolean;
  [key: string]: unknown;
}

export interface AgentActivityEvent {
  schema: "opentopox.agent-event.v1";
  id: string;
  type: AgentActivityEventType;
  kind: AgentActivityKind;
  runId: string;
  stepId?: string;
  parentId?: string;
  targetId?: string;
  name?: string;
  summary?: string;
  inputSummary?: string;
  outputSummary?: string;
  status: AgentActivityStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  error?: { message: string; code?: string };
  contextRef?: AgentActivityReference;
  artifactRef?: AgentActivityReference;
  toolRef?: AgentActivityReference;
  mcpRef?: AgentActivityReference;
  skillRef?: AgentActivityReference;
  meta?: Record<string, unknown>;
}

export interface AgentActivityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  event: AgentActivityEvent;
}

export interface AgentActivityIngestResult {
  valid: boolean;
  validation: AgentActivityValidationResult;
  event: AgentActivityEvent;
  patch: TopologyGraphPatch & { addedNodes: TopologyNode[]; updatedNodes: TopologyNode[]; addedEdges: TopologyEdge[]; updatedEdges: TopologyEdge[]; removedNodeIds: string[]; removedEdgeIds: string[] };
  message?: RealtimeTopologyMessage;
  graph?: TopologyGraphData;
}

export interface ChatTopologyBlockPayload {
  schema: "opentopox.chat-topology-block.v1";
  kind: ChatTopologyBlockKind;
  title?: string;
  summary?: string;
  runId?: string;
  graph: TopologyGraphData;
  events?: AgentActivityEvent[];
  activityRefs?: string[];
  view: {
    compact: boolean;
    readonly: boolean;
    maxHeight: number;
    maxNodes: number;
    maxEdges: number;
    theme?: string;
    hoverHighlight?: boolean;
    animate?: boolean;
  };
  meta?: Record<string, unknown>;
}

export interface ChatTopologyBlockValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  payload: ChatTopologyBlockPayload;
}

export interface TopologyPatchItem<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  data?: Partial<TData>;
  patch?: Record<string, unknown>;
  position?: TopologyPoint;
  style?: Record<string, unknown>;
  replace?: boolean;
  removeFields?: string[];
  [key: string]: unknown;
}

export interface TopologyGraphPatch {
  nodePatches?: Array<TopologyPatchItem<TopologyNodeData>> | Record<string, Partial<TopologyPatchItem<TopologyNodeData>>> | Map<string, Partial<TopologyPatchItem<TopologyNodeData>>>;
  edgePatches?: Array<TopologyPatchItem<TopologyEdgeData>> | Record<string, Partial<TopologyPatchItem<TopologyEdgeData>>> | Map<string, Partial<TopologyPatchItem<TopologyEdgeData>>>;
  addedNodes?: TopologyNode[];
  addNodes?: TopologyNode[];
  updatedNodes?: Array<Partial<TopologyNode> & { id: string }>;
  updateNodes?: Array<Partial<TopologyNode> & { id: string }>;
  removedNodeIds?: string[];
  removeNodeIds?: string[];
  addedEdges?: TopologyEdge[];
  addEdges?: TopologyEdge[];
  updatedEdges?: Array<Partial<TopologyEdge> & { id: string }>;
  updateEdges?: Array<Partial<TopologyEdge> & { id: string }>;
  removedEdgeIds?: string[];
  removeEdgeIds?: string[];
  options?: Partial<SetDataOptions> & Record<string, unknown>;
  [key: string]: unknown;
}

export interface SetDataOptions {
  nodes?: TopologyNode[];
  edges?: TopologyEdge[];
  centerNodeId?: string;
  clearStatus?: boolean;
  disableAnimate?: boolean;
  preserveOrigin?: boolean;
  preserveViewport?: boolean;
  autoFit?: boolean;
  silentSelection?: boolean;
}

export interface LayoutOptions {
  topoType?: "dot" | "fdp" | "layer" | "xyFlow" | "radial" | "grid" | "preset" | "entityFlow" | "worker" | "workerDot" | "workerFdp" | string;
  rankDir?: "LR" | "TB" | string;
  rankSep?: number;
  nodeSep?: number;
  clusterSpacing?: number;
  layerSpacing?: number;
  autoWorker?: boolean;
  useWorker?: boolean;
  workerNodeLimit?: number;
  workerTotalElementLimit?: number;
  workerTimeoutMs?: number;
  workerFallback?: boolean;
  [key: string]: unknown;
}

export interface RenderStats {
  nodes: number;
  edges: number;
  durationMs?: number;
  patchDurationMs?: number;
  performanceMode?: boolean;
  layout?: string;
  layoutVersion?: number;
  edgeLabelsVisible?: boolean;
  stale?: boolean;
  [key: string]: unknown;
}

export interface GraphApi {
  getData(): TopologyGraphData;
  getGraphData(): TopologyGraphData;
  getNodes(): TopologyNode[];
  getEdges(): TopologyEdge[];
  setData(data?: SetDataOptions): Promise<unknown>;
  setGroupData(data?: Record<string, unknown>): Promise<unknown>;
  updateGraphData(nodes?: TopologyNode[], edges?: TopologyEdge[], options?: Record<string, unknown>): Promise<unknown>;
  showOriginData(options?: Record<string, unknown>): Promise<unknown>;
  handleFocusNode(id: string, options?: { degree?: number; direction?: TopologyDirection; disableAnimate?: boolean }): Promise<unknown>;
  setLayout(options?: LayoutOptions, nodeType?: string): NewTopoGraph;
  setAnimateMode(enabled: boolean): void;
  setPerformanceMode(enabled: boolean): void;
  setEdgeLabelsVisible(enabled: boolean): void;
  areEdgeLabelsVisible(): boolean;
  setNodeDraggable(enabled: boolean): void;
  setHoverHighlight(enabled: boolean, options?: { degree?: number }): void;
  setMinimapVisible(enabled: boolean): void;
  isMinimapVisible(): boolean;
  setGridVisible(enabled: boolean): void;
  setDebugPanelVisible(enabled: boolean): void;
  isDebugPanelVisible(): boolean;
  updateDebugMetrics(metrics?: Record<string, unknown>): Record<string, unknown>;
  setTheme(theme: string): void;
  render(): void;
  fitView(options?: { padding?: number; nodes?: TopologyNode[]; minZoom?: number; maxZoom?: number }): void;
  fitCenter(): void;
  zoomTo(zoom: number): void;
  focusNode(id: string): void;
  selectNode(id: string, options?: { emit?: boolean }): TopologyNode | null;
  getSelection(): TopologySelection;
  setSelection(selection: Partial<TopologySelection>, options?: { emit?: boolean; render?: boolean }): TopologySelection;
  toggleSelectionItem(item: TopologySelectionItem, options?: { emit?: boolean }): TopologySelection;
  clearSelection(options?: { emit?: boolean }): TopologySelection;
  selectArea(rect: { x: number; y: number; width: number; height: number }, options?: { append?: boolean; emit?: boolean; includeEdges?: boolean; edgeMode?: "intersect" | "connected" }): TopologySelection;
  selectVisible(options?: { append?: boolean; emit?: boolean; includeEdges?: boolean }): TopologySelection;
  invertSelection(options?: { scope?: "visible" | "all"; emit?: boolean; includeEdges?: boolean }): TopologySelection;
  selectByCriteria(criteria?: TopologySelectionCriteria, options?: { append?: boolean; emit?: boolean; visibleOnly?: boolean; includeEdges?: boolean }): TopologySelection;
  setSelectionEnabled(enabled: boolean): boolean;
  isSelectionEnabled(): boolean;
  setSelectionMode(mode: TopologySelectionMode): TopologySelectionMode;
  getSelectionMode(): TopologySelectionMode;
  getVisibleGraphData(options?: { visibleRect?: { x: number; y: number; width: number; height: number } }): TopologyGraphData;
  extractContext(options?: TopologyContextOptions & { format?: "json" }): TopologyContextEnvelope;
  extractContext(options?: TopologyContextOptions & { format: "markdown" }): string;
  extractContext(options?: TopologyContextOptions & { format: "both" }): SerializedTopologyContext;
  copyContext(options?: TopologyContextOptions & { text?: string }): Promise<CopyTopologyContextResult>;
  updateNode(id: string, patch: Partial<TopologyNode> | ((node: TopologyNode) => Partial<TopologyNode> | null | undefined)): TopologyNode | null;
  updateNodeData(id: string, patch: Partial<TopologyNodeData>): TopologyNode | null;
  updateEdge(id: string, patch: Partial<TopologyEdge> | ((edge: TopologyEdge) => Partial<TopologyEdge> | null | undefined)): TopologyEdge | null;
  updateEdgeData(id: string, patch: Partial<TopologyEdgeData>): TopologyEdge | null;
  patchGraphData(patch?: TopologyGraphPatch, options?: Partial<SetDataOptions>): unknown;
  getInternalNode(id: string): (TopologyNode & { measured?: { width: number; height: number } }) | null;
  getSelected(): { type: "node" | "edge"; id: string } | null;
  getViewport(): TopologyViewport;
  setViewport(viewport?: Partial<TopologyViewport>): void;
  isFullscreen(): boolean;
  setFullscreen(enabled: boolean): Promise<boolean>;
  toggleFullscreen(): Promise<boolean>;
  getRenderStats(): RenderStats;
  getContainer(): HTMLElement;
  getRootElement(): HTMLElement;
  [key: string]: unknown;
}

export interface NewTopoGraphOptions {
  container: HTMLElement;
  config?: LayoutOptions & {
    type?: string;
    graphType?: string;
    theme?: string;
    enableSelection?: boolean;
    selectionEnabled?: boolean;
    selectionMode?: TopologySelectionMode;
    nodeDraggable?: boolean;
    hoverHighlight?: boolean;
    hoverHighlightDegree?: number;
    minimap?: boolean;
    controls?: boolean;
    controlsEnabled?: boolean;
    controlActions?: string[];
    controlOrientation?: "horizontal" | "vertical" | string;
    controlClassName?: string;
    controlZoomStep?: number;
    grid?: boolean;
    debugPanel?: boolean;
    autoPerformanceMode?: boolean;
    performanceNodeLimit?: number;
    performanceTotalElementLimit?: number;
    hideEdgesOnViewportMove?: boolean;
    viewportInteractionSettleMs?: number;
    canvasEdges?: boolean;
    canvasEdgeThreshold?: number;
    canvasEdgePixelRatio?: number;
    validateData?: boolean;
    allowedNodeTypes?: string[] | Set<string>;
    throwOnInvalid?: boolean;
    onValidation?: (validation: ValidationResult, detail?: Record<string, unknown>) => void;
    onValidationError?: (validation: ValidationResult, detail?: Record<string, unknown>) => void;
    [key: string]: unknown;
  };
  style?: Partial<CSSStyleDeclaration> | Record<string, string | number>;
  className?: string;
  onLoad?: () => void;
  handleNodeClick?: (node: TopologyNode) => void;
  handleEdgeClick?: (edge: TopologyEdge) => void;
  handleCloseInfo?: () => void;
  renderAddNodeModal?: (context: { edge: TopologyEdge; graph: GraphApi }) => Promise<TopologyNode | false | undefined> | TopologyNode | false | undefined;
  onDeleteNode?: (node: TopologyNode, context: { graph: GraphApi }) => void;
}

export declare class NewTopoGraph {
  constructor(options: NewTopoGraphOptions);
  getGraph(): GraphApi;
  getData(): TopologyGraphData;
  getNodes(): TopologyNode[];
  getEdges(): TopologyEdge[];
  setLayout(options?: LayoutOptions, nodeType?: string): this;
  setData(data?: SetDataOptions): Promise<unknown>;
  setGroupData(data?: Record<string, unknown>): Promise<unknown>;
  getSelection(): TopologySelection;
  setSelection(selection: Partial<TopologySelection>, options?: { emit?: boolean; render?: boolean }): TopologySelection;
  clearSelection(options?: { emit?: boolean }): TopologySelection;
  selectArea(rect: { x: number; y: number; width: number; height: number }, options?: { append?: boolean; emit?: boolean; includeEdges?: boolean; edgeMode?: "intersect" | "connected" }): TopologySelection;
  selectVisible(options?: { append?: boolean; emit?: boolean; includeEdges?: boolean }): TopologySelection;
  invertSelection(options?: { scope?: "visible" | "all"; emit?: boolean; includeEdges?: boolean }): TopologySelection;
  selectByCriteria(criteria?: TopologySelectionCriteria, options?: { append?: boolean; emit?: boolean; visibleOnly?: boolean; includeEdges?: boolean }): TopologySelection;
  setSelectionEnabled(enabled: boolean): boolean;
  isSelectionEnabled(): boolean;
  extractContext(options?: TopologyContextOptions): TopologyContextEnvelope | string | SerializedTopologyContext;
  copyContext(options?: TopologyContextOptions & { text?: string }): Promise<CopyTopologyContextResult>;
  destroy(): void;
}

export declare class CopilotTopoGraph extends NewTopoGraph {}
export declare class AgentLoopTopoGraph extends NewTopoGraph {}

export declare class TopoLayout {
  constructor(options?: { options?: LayoutOptions });
  options: LayoutOptions;
  execute(data?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; innerFunc?: Record<string, unknown>; clearStatus?: boolean }): Promise<unknown>;
  executeSync(data?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; innerFunc?: Record<string, unknown>; clearStatus?: boolean }): unknown;
  groupLayout(data?: Record<string, unknown>): unknown;
  cancelWorkerLayout(reason?: string): boolean;
}

export interface RealtimeTopologyMessage<TPayload = Record<string, unknown>> {
  protocol?: string;
  type: RealtimeTopologyMessageType;
  version: string | number;
  seq: number;
  serverTime: string;
  source: string;
  traceId?: string;
  payload: TPayload;
  meta?: Record<string, unknown>;
}

export interface TopologyGraphStoreSnapshot {
  version: string | number;
  currentGraphVersion: string | number;
  snapshotVersion: string | number;
  selectedId: string;
  viewport: TopologyViewport | null;
  connectionStatus: TopologyConnectionStatus;
  nodeCount: number;
  edgeCount: number;
  metrics: Record<string, number>;
  lastErrors: string[];
  lastWarnings: string[];
  [key: string]: unknown;
}

export declare class TopologyGraphStore {
  constructor(options?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; version?: string | number; selectedId?: string; viewport?: TopologyViewport | null; connectionStatus?: TopologyConnectionStatus });
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  subscribe(type: string, listener: (event: Record<string, unknown>) => void): () => void;
  bindAdapter(adapter: TopologyDataAdapter): () => void;
  applyMessage(message: RealtimeTopologyMessage | string, context?: Record<string, unknown>): unknown;
  replace(data?: TopologyGraphData & { version?: string | number; meta?: Record<string, unknown> }, options?: Record<string, unknown>): unknown;
  getData(): TopologyGraphData;
  getNodes(): TopologyNode[];
  getEdges(): TopologyEdge[];
  getSnapshot(): TopologyGraphStoreSnapshot;
}

export interface TopologyDataAdapterStatus {
  status: TopologyConnectionStatus;
  transport: TopologyDataTransport;
  connected: boolean;
  messageCount: number;
  droppedMessages: number;
  messageLag: number | null;
  messageRate: number;
  [key: string]: unknown;
}

export declare class TopologyDataAdapter {
  constructor(options?: Record<string, unknown>);
  connect(): Promise<this>;
  disconnect(options?: { status?: TopologyConnectionStatus }): this;
  reconnect(): Promise<this>;
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  subscribe(type: string, listener: (event: Record<string, unknown>) => void): () => void;
  ingest(raw: RealtimeTopologyMessage | string, context?: Record<string, unknown>): unknown;
  getStatus(): TopologyDataAdapterStatus;
}

export declare class TopologyUpdateScheduler {
  constructor(options?: { graph?: NewTopoGraph | GraphApi | null; store?: TopologyGraphStore | null; flushIntervalMs?: number; maxQueueSize?: number; defaultSetDataOptions?: Partial<SetDataOptions>; [key: string]: unknown });
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  subscribe(type: string, listener: (event: Record<string, unknown>) => void): () => void;
  bindAdapter(adapter: TopologyDataAdapter): () => void;
  enqueueMessage(message: RealtimeTopologyMessage, meta?: Record<string, unknown>): Record<string, unknown>;
  enqueueGraphPatch(patch: TopologyGraphPatch, meta?: Record<string, unknown>): Record<string, unknown>;
  flush(): Promise<Record<string, unknown>>;
  getMetrics(): Record<string, unknown>;
  destroy(): void;
}

export declare class AgentActivityAdapter {
  constructor(options?: { source?: string; version?: string | number; failureBubbleStatus?: AgentActivityStatus });
  subscribe(listener: (event: Record<string, unknown>) => void): () => void;
  ingest(input: Partial<AgentActivityEvent> | string, options?: Record<string, unknown>): AgentActivityIngestResult;
  ingestMany(events?: Array<Partial<AgentActivityEvent> | string>, options?: Record<string, unknown>): { results: AgentActivityIngestResult[]; graph: TopologyGraphData };
  createPatchFromEvent(event: Partial<AgentActivityEvent>): TopologyGraphPatch;
  createRealtimePatchMessage(patch: TopologyGraphPatch, event?: Partial<AgentActivityEvent>): RealtimeTopologyMessage;
  getGraphData(): TopologyGraphData;
  reset(): void;
}

export declare const REALTIME_TOPOLOGY_PROTOCOL: string;
export declare const REALTIME_TOPOLOGY_MESSAGE_TYPES: Record<string, RealtimeTopologyMessageType>;
export declare const REALTIME_TOPOLOGY_PATCH_OPERATIONS: Record<string, string>;
export declare const TOPOLOGY_DATA_TRANSPORTS: Record<string, TopologyDataTransport>;
export declare const TOPOLOGY_DATA_ADAPTER_STATUS: Record<string, TopologyConnectionStatus>;
export declare const TOPOLOGY_DATA_ADAPTER_EVENTS: Record<string, string>;
export declare const TOPOLOGY_GRAPH_STORE_EVENTS: Record<string, string>;
export declare const TOPOLOGY_GRAPH_STORE_STATUS: Record<string, TopologyConnectionStatus>;
export declare const TOPOLOGY_UPDATE_SCHEDULER_EVENTS: Record<string, string>;
export declare const TOPOLOGY_CONTEXT_SCHEMA: "opentopox.agent-context.v1";
export declare const AGENT_ACTIVITY_EVENT_SCHEMA: "opentopox.agent-event.v1";
export declare const AGENT_ACTIVITY_EVENT_TYPES: Record<string, AgentActivityEventType>;
export declare const AGENT_ACTIVITY_KINDS: Record<string, AgentActivityKind>;
export declare const AGENT_ACTIVITY_STATUSES: Record<string, AgentActivityStatus>;
export declare const AGENT_ACTIVITY_NODE_TYPES: Record<string, string>;
export declare const AGENT_ACTIVITY_EDGE_TYPES: Record<string, string>;
export declare const CHAT_TOPOLOGY_BLOCK_SCHEMA: "opentopox.chat-topology-block.v1";
export declare const CHAT_TOPOLOGY_BLOCK_KINDS: Record<string, ChatTopologyBlockKind>;

export declare function createTopologyDataAdapter(options?: Record<string, unknown>): TopologyDataAdapter;
export declare function createTopologyGraphStore(options?: ConstructorParameters<typeof TopologyGraphStore>[0]): TopologyGraphStore;
export declare function createTopologyUpdateScheduler(options?: ConstructorParameters<typeof TopologyUpdateScheduler>[0]): TopologyUpdateScheduler;
export declare function createAgentActivityEvent(input?: Partial<AgentActivityEvent> | string): AgentActivityEvent;
export declare function normalizeAgentActivityEvent(input?: Partial<AgentActivityEvent> | string): AgentActivityEvent;
export declare function validateAgentActivityEvent(input?: Partial<AgentActivityEvent> | string, options?: Record<string, unknown>): AgentActivityValidationResult;
export declare function inferActivityKind(type?: string): AgentActivityKind | "";
export declare function inferActivityStatus(type?: string): AgentActivityStatus;
export declare function sanitizeActivityMeta(meta?: Record<string, unknown>): Record<string, unknown>;
export declare function createAgentActivityAdapter(options?: ConstructorParameters<typeof AgentActivityAdapter>[0]): AgentActivityAdapter;
export declare function buildAgentActivityTopology(events?: Array<Partial<AgentActivityEvent> | string>, options?: ConstructorParameters<typeof AgentActivityAdapter>[0]): TopologyGraphData;
export declare function createAgentActivityTopologyPatch(event?: Partial<AgentActivityEvent> | string, options?: ConstructorParameters<typeof AgentActivityAdapter>[0]): TopologyGraphPatch;
export declare function createChatTopologyBlockPayload(input?: Partial<ChatTopologyBlockPayload> | string): ChatTopologyBlockPayload;
export declare function validateChatTopologyBlockPayload(input?: Partial<ChatTopologyBlockPayload> | string, options?: Record<string, unknown>): ChatTopologyBlockValidationResult;
export declare function renderAgentTopologyBlock(container: HTMLElement, payload: Partial<ChatTopologyBlockPayload> | string, options?: Record<string, unknown>): { payload: ChatTopologyBlockPayload; validation: ChatTopologyBlockValidationResult; container: HTMLElement; graph: NewTopoGraph; ready: Promise<unknown>; destroy(): void; update(nextInput: Partial<ChatTopologyBlockPayload> | string): Promise<unknown> };
export declare function createTopologyContext(options?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; selection?: TopologySelection; visibleRect?: { x: number; y: number; width: number; height: number }; viewport?: TopologyViewport; source?: Record<string, unknown>; options?: TopologyContextOptions }): TopologyContextEnvelope;
export declare function resolveContextGraph(options?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; selection?: TopologySelection; visibleRect?: { x: number; y: number; width: number; height: number }; scope?: TopologyContextScope; includeMode?: TopologyContextIncludeMode; degree?: number; direction?: TopologyDirection }): TopologyGraphData;
export declare function getVisibleGraphData(options?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; visibleRect?: { x: number; y: number; width: number; height: number } }): TopologyGraphData;
export declare function formatTopologyContextAsMarkdown(context: TopologyContextEnvelope): string;
export declare function serializeTopologyContext(context: TopologyContextEnvelope, options?: { format?: "json" | "markdown" | "both" }): TopologyContextEnvelope | string | SerializedTopologyContext;
export declare function createRealtimeTopologyMessage(options?: Partial<RealtimeTopologyMessage>): RealtimeTopologyMessage;
export declare function createRealtimeTopologySnapshot(options?: { nodes?: TopologyNode[]; edges?: TopologyEdge[]; payload?: Record<string, unknown>; [key: string]: unknown }): RealtimeTopologyMessage;
export declare function createRealtimeNodePatch(options?: { patches?: Array<TopologyPatchItem<TopologyNodeData>>; payload?: Record<string, unknown>; [key: string]: unknown }): RealtimeTopologyMessage;
export declare function createRealtimeEdgePatch(options?: { patches?: Array<TopologyPatchItem<TopologyEdgeData>>; payload?: Record<string, unknown>; [key: string]: unknown }): RealtimeTopologyMessage;
export declare function createRealtimeTopologyPatch(options?: Partial<TopologyGraphPatch> & Record<string, unknown>): RealtimeTopologyMessage;
export declare function normalizeRealtimeTopologyMessage(input: RealtimeTopologyMessage | string): RealtimeTopologyMessage;
export declare function validateRealtimeTopologyMessage(message: RealtimeTopologyMessage | string, options?: Record<string, unknown>): { valid: boolean; errors: string[]; warnings: string[]; message: RealtimeTopologyMessage };
export declare function shouldAcceptRealtimeTopologyMessage(message: RealtimeTopologyMessage | string, cursor?: Record<string, unknown>, options?: Record<string, unknown>): { accept: boolean; reason?: string; validation?: Record<string, unknown>; cursor?: Record<string, unknown> };
export interface ValidationResult {
  valid: boolean;
  hasWarnings: boolean;
  errors: string[];
  warnings: string[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  [key: string]: unknown;
}

export declare function validateGraphData(nodes?: TopologyNode[], edges?: TopologyEdge[], options?: Record<string, unknown>): ValidationResult;

export declare function register(name: string, value?: unknown): () => void;
export declare function registerNodeShape(type: string, shape: unknown): () => void;
export declare function registerEdgeShape(type: string, shape: unknown): () => void;
export declare function getNodeShape(type: string): unknown;
export declare function getEdgeShape(type: string): unknown;
export declare function parseDotGraph(dotSource?: string, options?: { nodeType?: string }): TopologyGraphData;
export declare function registerLayoutExecutor(type: string, executor: (...args: unknown[]) => unknown): () => void;
export declare function unregisterLayoutExecutor(type: string): void;
export declare function getRegisteredLayoutExecutors(): string[];

export declare const FlowToolbar: any;
export declare const FlowLegend: any;
export declare const FlowControls: any;
export declare const Toolbar: any;
export declare const ContextMenu: any;
export declare const Tooltip: any;
export declare const TopologyDetailDrawer: any;
export declare const StandardTopologyGraph: any;
export declare const LayeredTopologyGraph: any;
export declare const SpatialTopologyGraph: any;
export declare const FlowTopologyGraph: any;
export declare const createTopologyGraph: any;
export declare const selectTopologyGraph: any;
export declare const registerTopologyShape: any;
export declare const buildCloudResourceTopology: any;
export declare const buildCloudResourceTopologyFromQuery: any;
export declare const buildGlobalEntityTopology: any;
export declare const createCloudResourceQueryProvider: any;
export declare const createResourceBatchSelection: any;
export declare const normalizeCloudResourceQueryResult: any;
export declare const paginateResources: any;
export declare const filterTopologyData: any;
export declare const getDataByNodeGroup: any;
export declare const getParallelEdgeKey: any;
export declare const mergeParallelEdges: any;
export declare const processParallelEdges: any;
export declare const DEFAULT_EXPAND_LIMIT: number;
export declare const DEFAULT_MAX_RENDER_NODES: number;
export declare const buildTopologyDetailModel: any;
export declare const createEntityTopologyView: any;
export declare const resolveEdgeMetricTitle: any;
export declare const toggleGroupId: any;
