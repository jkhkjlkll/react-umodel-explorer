# OpenTopoX

<p align="center">
  <strong>For AI-Ready Observability Topology</strong>
</p>

<p align="center">
  Build realtime, explainable, and agent-friendly topology views for modern cloud-native systems.
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#简体中文">简体中文</a>
</p>

---

## English

OpenTopoX is an **AI-ready observability topology framework** for developers building realtime topology views across services, cloud resources, traces, runtime states, and incident propagation paths.

It is not only a topology graph for human operators. OpenTopoX turns fragmented observability signals into a structured, interactive, and explainable system context that both developers and AI Agents can understand.

The npm package name is `opentopox`.

### Why OpenTopoX?

Modern observability is moving beyond dashboards, metrics, logs, and alert lists.

In complex AI / Cloud-Native systems, developers and AI Agents need to understand:

- How services depend on each other
- Where incidents start and how they propagate
- Which upstream and downstream components are affected
- What the current blast radius looks like
- What should be inspected next

OpenTopoX transforms isolated signals into a relationship-based topology view, enabling faster troubleshooting, impact analysis, and intelligent diagnosis.

### AI-Ready Features

#### Agentic Observability

OpenTopoX is designed for **Agentic Observability**.

Instead of exposing isolated metrics or alerts, it organizes nodes, edges, resources, states, traces, Agent activity, and realtime changes into topology graphs. This allows AI Agents to reason over system structure, dependency paths, incident propagation, and runtime context.

With OpenTopoX, agents can understand:

- Service dependencies
- Failure propagation paths
- Risky nodes and affected areas
- Runtime topology changes
- Relationship-aware observability context
- Lightweight Agent activity events and readonly AI Chat topology blocks

#### Agent Bridge

OpenTopoX provides an **Agent Bridge** that exposes frontend topology context to AI Agents.

Agent Bridge can provide agents with:

- Current visible topology scope
- Selected nodes, services, resources, or links
- Neighbor nodes and upstream/downstream relationships
- Node states, edge states, and incident signals
- Redacted topology context for safe handoff
- Markdown and JSON context for clipboard or host-app integration

This makes the topology view not just a visualization layer, but an AI-readable system context layer.

### Core Capabilities

- Native DOM/SVG topology rendering with Bezier edges, labels, directional markers, minimap, themes, and large-graph performance controls.
- No bundled third-party graph rendering, layout, or application framework runtime.
- Built-in layouts: `dot`, `fdp`, `layer`, `xyFlow`, `radial`, `grid`, `entityFlow`, and `preset`.
- Runtime graph API for data updates, viewport control, selection, focus, filtering, and incremental patch application.
- Agent Bridge context extraction for visible views, selected nodes/edges, neighborhood expansion, redaction, and clipboard handoff.
- Agentic Topology Observability helpers for lightweight Agent activity events, realtime topology patches, and readonly AI Chat topology blocks.
- Realtime topology protocol helpers, WebSocket/SSE/polling/manual adapters, graph store, batching scheduler, and stale-message guards.
- Optional UI helpers for toolbar controls, legends, context menus, tooltips, detail drawers, and shape registration.
- TypeScript declarations for the public ESM entry.

### How It Works

OpenTopoX uses a standard topology data model and a native rendering pipeline.

```text
TopologyDataAdapter
  -> TopologyGraphStore
  -> TopologyUpdateScheduler
  -> NewTopoGraph getGraph() API
```

Core data model:

```text
nodes   -> topology entities
edges   -> topology relationships
patches -> realtime incremental updates
```

### Install

When published as a package:

```sh
npm install opentopox
```

For local development from this repository:

```sh
npm install
npm run check
```

### Quick Start

```js
import { NewTopoGraph } from "opentopox";
import "opentopox/style.css";

const topo = new NewTopoGraph({
  container: document.querySelector("#graph"),
  config: {
    theme: "neutral",
    nodeDraggable: true,
    minimap: true,
    grid: true,
  },
});

const graph = topo.getGraph();

graph.setLayout({
  topoType: "dot",
  rankDir: "LR",
});

await graph.setData({
  nodes: [
    {
      id: "api",
      type: "cardLayerNode",
      data: {
        title: "API Service",
        domain: "service",
        status: "ok",
      },
    },
    {
      id: "db",
      type: "cardLayerNode",
      data: {
        title: "Database",
        domain: "database",
        status: "warn",
      },
    },
  ],
  edges: [
    {
      id: "api-db",
      source: "api",
      target: "db",
      label: "queries",
      data: {
        latency: "28ms",
      },
    },
  ],
});
```

Direct source-path usage also works for static examples:

```html
<link rel="stylesheet" href="./src/framework/topology.css" />
<script type="module">
  import { NewTopoGraph } from "./src/framework/index.js";
</script>
```

### Realtime Updates

```js
import {
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyDataAdapter,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
} from "opentopox";

const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET,
  url: "wss://example.com/topology",
});

const store = createTopologyGraphStore();
const scheduler = createTopologyUpdateScheduler({
  graph: topo,
  store,
  flushIntervalMs: 160,
  maxQueueSize: 1000,
});

scheduler.bindAdapter(adapter);

await adapter.connect();
```

### Agent Bridge Example

```js
import { ContextMenu, FlowToolbar, NewTopoGraph } from "opentopox";

const topo = new NewTopoGraph({
  container,
  config: {
    minimap: true,
    enableSelection: true,
    selectionMode: "default",
  },
});

const graph = topo.getGraph();

new FlowToolbar({
  container: document.querySelector("#toolbar"),
  graph,
  enableContextCopy: true,
  enableAreaSelection: true,
  contextOptions: {
    scope: "selected",
    includeMode: "connectedEdges",
    maxNodes: 80,
    maxEdges: 160,
  },
});

new ContextMenu({
  container,
  graph,
  enableContextCopy: true,
  contextOptions: {
    scope: "selected",
    includeMode: "connectedEdges",
  },
});

const context = graph.extractContext({
  scope: graph.getSelection().nodes.length ? "selected" : "visible",
  includeMode: "oneHop",
  format: "both",
});
```

### Agentic Observability Example

```js
import {
  NewTopoGraph,
  createAgentActivityAdapter,
  createTopologyUpdateScheduler,
} from "opentopox";

const topo = new NewTopoGraph({
  container,
  config: {
    type: "agentTrace",
    nodeDraggable: false,
    minimap: true,
  },
});

const adapter = createAgentActivityAdapter({ source: "my-agent" });
const scheduler = createTopologyUpdateScheduler({ graph: topo });

function ingestAgentEvent(event) {
  const result = adapter.ingest(event);
  if (result.valid) scheduler.enqueueGraphPatch(result.patch);
}

ingestAgentEvent({
  type: "agent.run.started",
  runId: "run-20260521",
  name: "Fix topology issue",
});
```

### Public API Surface

OpenTopoX keeps one recommended API path for each integration task:

- Use `NewTopoGraph` for the main DOM/SVG topology renderer.
- Use `createTopologyGraph()` and preset graph classes for common topology entry points.
- Use `registerNodeShape()` and `registerEdgeShape()` for custom rendering.
- Use `registerTopologyShape(kind, type, shape)` only as a compatibility helper around the node/edge shape registry.
- Use realtime protocol, adapter, store, and scheduler helpers together when consuming streaming topology updates.

Common imports:

```js
import {
  NewTopoGraph,
  StandardTopologyGraph,
  LayeredTopologyGraph,
  SpatialTopologyGraph,
  FlowTopologyGraph,
  createTopologyGraph,
  selectTopologyGraph,
  registerNodeShape,
  registerEdgeShape,
  TopoLayout,
  registerLayoutExecutor,
  FlowToolbar,
  FlowLegend,
  ContextMenu,
  Tooltip,
  TopologyDetailDrawer,
  FlowControls,
  Toolbar,
  buildCloudResourceTopology,
  buildCloudResourceTopologyFromQuery,
  buildGlobalEntityTopology,
  createCloudResourceQueryProvider,
  createResourceBatchSelection,
  normalizeCloudResourceQueryResult,
  paginateResources,
  createEntityTopologyView,
  buildTopologyDetailModel,
  filterTopologyData,
  getDataByNodeGroup,
  processParallelEdges,
  mergeParallelEdges,
  createTopologyContext,
  formatTopologyContextAsMarkdown,
  createRealtimeTopologySnapshot,
  createRealtimeNodePatch,
  createRealtimeEdgePatch,
  createRealtimeTopologyPatch,
  validateRealtimeTopologyMessage,
  shouldAcceptRealtimeTopologyMessage,
  createTopologyDataAdapter,
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
  createAgentActivityAdapter,
  createChatTopologyBlockPayload,
  renderAgentTopologyBlock,
  register,
} from "opentopox";
```

Compatibility import for older preset-style integrations:

```js
import { registerTopologyShape } from "opentopox";

registerTopologyShape("node", "service-card", {
  render(node) {
    return `<strong>${node.data?.title || node.id}</strong>`;
  },
});
```

The full export list is defined by `src/framework/index.js` and `src/framework/index.d.ts`.

### Repository Layout

```txt
src/framework/               Framework source
docs/                        Public integration, security, and runtime docs
examples/                    Browser examples
tests/unit/                  Node.js unit tests
benchmarks/                  Local performance benchmarks
scripts/build-package.mjs    Dist package builder
```

Generated artifacts, local captures, screenshots, credentials, and private research notes should not be committed to this repository.

### Development

Build the publishable package:

```sh
npm run build
```

Run syntax checks, unit tests, and a package build:

```sh
npm run check
```

Run only unit tests:

```sh
npm run test:unit
```

Run the topology benchmark:

```sh
npm run benchmark:topology
```

Benchmark sizes can be adjusted locally:

```sh
TOPOLOGY_BENCH_SIZES=500,1000 TOPOLOGY_BENCH_EDGE_MULTIPLIERS=1 npm run benchmark:topology
```

### Documentation

- [Usage Guide](./USAGE.md)
- [Developer Guide](./DEVELOPER_GUIDE.md)
- [Security Guidelines](./docs/security-guidelines.md)
- [Realtime Protocol](./docs/realtime-topology-protocol.md)
- [Realtime Runtime](./docs/realtime-topology-runtime.md)
- [Performance And Troubleshooting](./docs/performance-and-troubleshooting.md)
- [Topology Data Adapter](./docs/topology-data-adapter.md)

### Local Examples

```sh
npm run serve
```

Then open:

```txt
http://127.0.0.1:5177/examples/minimal-realtime/
```

Example entry points:

- `examples/basic-usage/`
- `examples/cloud-resource-topology/`
- `examples/preset-entry/`
- `examples/minimal-realtime/`

### Publication Boundary

OpenTopoX is published from this directory only. Sibling workspaces or extraction projects, such as local demos, captures, or migration notes, are not part of the OpenTopoX repository or npm package.

### Community

- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Maintainers](./MAINTAINERS.md)

### License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

---

## 简体中文

OpenTopoX 是一个面向可观测开发者的 **AI-ready 可观测拓扑框架**，用于构建服务、云资源、链路、运行状态与异常传播关系的实时拓扑视图。

它不仅是一张“给人看的拓扑图”，更是一层面向 AI Agent 的结构化运行上下文。OpenTopoX 可以将零散的可观测信号转化为可交互、可解释、可实时更新的系统现场，让开发者和 Agent 都能理解系统正在发生什么。

npm 包名为 `opentopox`。

### 为什么选择 OpenTopoX？

AI 时代的可观测系统，不应只停留在 Dashboard、指标曲线、日志和告警列表。

在复杂的AI / 云原生系统中，开发者和 AI Agent 都需要理解：

- 服务之间如何依赖
- 异常从哪里开始传播
- 哪些上下游组件受到影响
- 当前影响半径有多大
- 下一步应该检查哪个节点

OpenTopoX 将孤立信号转化为关系化拓扑视图，让故障排查、影响分析和智能诊断从“看数据”升级为“理解系统”。

### AI Ready 核心特性

#### Agentic Observability

OpenTopoX 面向 **Agentic Observability** 设计。

它不是简单展示指标或告警，而是将节点、边、资源、状态、链路、Agent 活动与实时变化组织成拓扑图。AI Agent 可以基于系统结构理解服务依赖、故障传播路径、风险节点和运行态上下文。

通过 OpenTopoX，Agent 可以理解：

- 服务依赖关系
- 故障传播路径
- 风险节点与影响范围
- 实时拓扑变化
- 关系化可观测上下文
- 轻量 Agent 活动事件与只读 AI Chat 拓扑块

#### Agent Bridge

OpenTopoX 提供 **Agent Bridge** 能力，用于将前端拓扑现场暴露给 AI Agent。

Agent Bridge 可以向 Agent 提供：

- 当前可见拓扑范围
- 用户选中的服务、资源、节点或链路
- 邻居节点与上下游关系
- 节点状态、边状态与异常信号
- 可脱敏的拓扑上下文
- 可用于剪切板或宿主应用集成的 Markdown 与 JSON context

这让拓扑图不只是可视化展示层，而是 AI Agent 可读取、可理解、可推理的系统上下文层。

### 核心能力

- 使用原生 DOM/SVG 渲染拓扑节点、Bezier 连线、标签、方向箭头、小地图、主题和大图性能模式。
- 不内置第三方图渲染、布局或应用框架运行时。
- 内置 `dot`、`fdp`、`layer`、`xyFlow`、`radial`、`grid`、`entityFlow`、`preset` 布局。
- 提供运行时图 API，支持数据更新、视口控制、选择、聚焦、过滤和增量 patch。
- 提供 Agent Bridge 上下文提取能力，支持可见视图、选中节点/边、邻居扩展、脱敏和剪切板传递。
- 提供 Agentic Topology Observability 能力，支持轻量 Agent 活动事件、实时拓扑 patch 和 AI Chat 只读拓扑块。
- 提供实时拓扑协议工具、WebSocket/SSE/polling/manual 适配器、Graph Store、批处理调度器和旧消息防护。
- 提供可选 UI 组件，包括工具栏、图例、右键菜单、Tooltip、详情抽屉和 shape 注册。
- 提供公开 ESM 入口的 TypeScript 声明。

### 工作方式

OpenTopoX 基于标准拓扑数据模型和原生渲染链路构建实时拓扑能力。

```text
TopologyDataAdapter
  -> TopologyGraphStore
  -> TopologyUpdateScheduler
  -> NewTopoGraph getGraph() API
```

核心数据模型：

```text
nodes   -> 拓扑实体
edges   -> 拓扑关系
patches -> 实时增量更新
```

### 安装

发布到 npm 后可使用：

```sh
npm install opentopox
```

本地开发：

```sh
npm install
npm run check
```

### 快速开始

```js
import { NewTopoGraph } from "opentopox";
import "opentopox/style.css";

const topo = new NewTopoGraph({
  container: document.querySelector("#graph"),
  config: {
    theme: "neutral",
    nodeDraggable: true,
    minimap: true,
    grid: true,
  },
});

const graph = topo.getGraph();

graph.setLayout({
  topoType: "dot",
  rankDir: "LR",
});

await graph.setData({
  nodes: [
    {
      id: "api",
      type: "cardLayerNode",
      data: {
        title: "API Service",
        domain: "service",
        status: "ok",
      },
    },
    {
      id: "db",
      type: "cardLayerNode",
      data: {
        title: "Database",
        domain: "database",
        status: "warn",
      },
    },
  ],
  edges: [
    {
      id: "api-db",
      source: "api",
      target: "db",
      label: "queries",
      data: {
        latency: "28ms",
      },
    },
  ],
});
```

静态示例或源码方式接入时，也可以直接使用源码路径：

```html
<link rel="stylesheet" href="./src/framework/topology.css" />
<script type="module">
  import { NewTopoGraph } from "./src/framework/index.js";
</script>
```

### 实时更新

```js
import {
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyDataAdapter,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
} from "opentopox";

const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET,
  url: "wss://example.com/topology",
});

const store = createTopologyGraphStore();
const scheduler = createTopologyUpdateScheduler({
  graph: topo,
  store,
  flushIntervalMs: 160,
  maxQueueSize: 1000,
});

scheduler.bindAdapter(adapter);

await adapter.connect();
```

### Agent Bridge 示例

```js
import { ContextMenu, FlowToolbar, NewTopoGraph } from "opentopox";

const topo = new NewTopoGraph({
  container,
  config: {
    minimap: true,
    enableSelection: true,
    selectionMode: "default",
  },
});

const graph = topo.getGraph();

new FlowToolbar({
  container: document.querySelector("#toolbar"),
  graph,
  enableContextCopy: true,
  enableAreaSelection: true,
  contextOptions: {
    scope: "selected",
    includeMode: "connectedEdges",
    maxNodes: 80,
    maxEdges: 160,
  },
});

new ContextMenu({
  container,
  graph,
  enableContextCopy: true,
  contextOptions: {
    scope: "selected",
    includeMode: "connectedEdges",
  },
});

const context = graph.extractContext({
  scope: graph.getSelection().nodes.length ? "selected" : "visible",
  includeMode: "oneHop",
  format: "both",
});
```

### Agentic Observability 示例

```js
import {
  NewTopoGraph,
  createAgentActivityAdapter,
  createTopologyUpdateScheduler,
} from "opentopox";

const topo = new NewTopoGraph({
  container,
  config: {
    type: "agentTrace",
    nodeDraggable: false,
    minimap: true,
  },
});

const adapter = createAgentActivityAdapter({ source: "my-agent" });
const scheduler = createTopologyUpdateScheduler({ graph: topo });

function ingestAgentEvent(event) {
  const result = adapter.ingest(event);
  if (result.valid) scheduler.enqueueGraphPatch(result.patch);
}

ingestAgentEvent({
  type: "agent.run.started",
  runId: "run-20260521",
  name: "Fix topology issue",
});
```

### 公共 API 口径

OpenTopoX 为每类接入任务保留一个推荐路径：

- 主渲染器使用 `NewTopoGraph`。
- 常见拓扑入口使用 `createTopologyGraph()` 和预设图类。
- 自定义渲染优先使用 `registerNodeShape()` 和 `registerEdgeShape()`。
- `registerTopologyShape(kind, type, shape)` 仅作为兼容便捷入口，本质上转发到节点/边 shape 注册表。
- 实时拓扑更新使用 protocol、adapter、store 和 scheduler 组合。

常用导入：

```js
import {
  NewTopoGraph,
  StandardTopologyGraph,
  LayeredTopologyGraph,
  SpatialTopologyGraph,
  FlowTopologyGraph,
  createTopologyGraph,
  selectTopologyGraph,
  registerNodeShape,
  registerEdgeShape,
  TopoLayout,
  registerLayoutExecutor,
  FlowToolbar,
  FlowLegend,
  ContextMenu,
  Tooltip,
  TopologyDetailDrawer,
  FlowControls,
  Toolbar,
  buildCloudResourceTopology,
  buildCloudResourceTopologyFromQuery,
  buildGlobalEntityTopology,
  createCloudResourceQueryProvider,
  createResourceBatchSelection,
  normalizeCloudResourceQueryResult,
  paginateResources,
  createEntityTopologyView,
  buildTopologyDetailModel,
  filterTopologyData,
  getDataByNodeGroup,
  processParallelEdges,
  mergeParallelEdges,
  createTopologyContext,
  formatTopologyContextAsMarkdown,
  createRealtimeTopologySnapshot,
  createRealtimeNodePatch,
  createRealtimeEdgePatch,
  createRealtimeTopologyPatch,
  validateRealtimeTopologyMessage,
  shouldAcceptRealtimeTopologyMessage,
  createTopologyDataAdapter,
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
  createAgentActivityAdapter,
  createChatTopologyBlockPayload,
  renderAgentTopologyBlock,
  register,
} from "opentopox";
```

兼容旧版 preset 风格集成：

```js
import { registerTopologyShape } from "opentopox";

registerTopologyShape("node", "service-card", {
  render(node) {
    return `<strong>${node.data?.title || node.id}</strong>`;
  },
});
```

完整导出清单以 `src/framework/index.js` 和 `src/framework/index.d.ts` 为准。

### 仓库结构

```txt
src/framework/               框架源码
docs/                        公开接入、安全和运行时文档
examples/                    浏览器示例
tests/unit/                  Node.js 单元测试
benchmarks/                  本地性能基准
scripts/build-package.mjs    发布包构建脚本
```

不要提交生成物、本地截图、访问凭据、私有链接、抓包文件或私有调研记录。

### 开发

构建可发布包：

```sh
npm run build
```

执行语法检查、单元测试和发布包构建：

```sh
npm run check
```

仅运行单元测试：

```sh
npm run test:unit
```

运行拓扑性能基准：

```sh
npm run benchmark:topology
```

可在本地调整基准规模：

```sh
TOPOLOGY_BENCH_SIZES=500,1000 TOPOLOGY_BENCH_EDGE_MULTIPLIERS=1 npm run benchmark:topology
```

### 文档

- [使用文档](./USAGE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [安全接入约束](./docs/security-guidelines.md)
- [实时协议](./docs/realtime-topology-protocol.md)
- [实时运行时链路](./docs/realtime-topology-runtime.md)
- [性能与故障排查](./docs/performance-and-troubleshooting.md)
- [实时接入适配器](./docs/topology-data-adapter.md)

### 本地示例

```sh
npm run serve
```

然后打开：

```txt
http://127.0.0.1:5177/examples/minimal-realtime/
```

示例入口：

- `examples/basic-usage/`
- `examples/cloud-resource-topology/`
- `examples/preset-entry/`
- `examples/minimal-realtime/`

### 发布边界

OpenTopoX 只从当前目录发布。旁路工作区、完整 demo、截图产物、迁移记录或提取过程目录不属于 OpenTopoX 独立仓库和 npm 包。

### 社区

- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Maintainers](./MAINTAINERS.md)

### 许可证

MIT 许可证。详见 [LICENSE](./LICENSE) 和 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
