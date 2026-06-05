# OpenTopoX 使用文档

本文档面向接入方，说明如何把 `src/framework/` 作为一个完整、独立的拓扑图框架集成到业务项目中。内部架构和实现细节见 [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)。

## 1. 框架边界

`src/framework/` 是独立框架产物，包含渲染、布局、交互、实体拓扑建模、详情抽屉、云资源查询适配和预设图入口能力。

框架不依赖：

- `src/demo/`
- `src/styles.css`
- 第三方图渲染运行时
- 具体后端 SDK 或业务查询接口

业务项目需要自己负责数据来源、权限、跳转、指标查询、筛选状态和页面布局。框架只消费标准化的 `nodes`、`edges`、布局配置和可选 provider。

## 2. 必备文件

作为源码方式接入时，至少需要保留：

```txt
src/framework/
  index.js
  NewTopoGraph.js
  LegacyTopoGraph.js
  TopoLayout.js
  layout.worker.js
  topology.css
  FlowToolbar.js
  FlowLegend.js
  FlowControls.js
  ContextMenu.js
  Tooltip.js
  TopologyDetailDrawer.js
  Registry.js
  CloudResourceTopologyAdapter.js
  TopologyDataUtils.js
  EntityTopologyModel.js
```

`layout.worker.js` 用于 Worker 布局模式，`topology.css` 是框架独立样式入口。

## 3. 安装与导入

### 3.1 作为包导入

当前仓库根目录已经提供 package exports。如果项目通过 monorepo、workspace 或 Git 依赖引用本仓库，可以按包名导入：

```js
import { NewTopoGraph, FlowToolbar } from "opentopox";
import "opentopox/style.css";
```

`package.json` 暴露了这些入口：

```json
{
  ".": "./src/framework/index.js",
  "./react": "./src/framework/react.js",
  "./style.css": "./src/framework/topology.css",
  "./framework/*": "./src/framework/*"
}
```

### 3.2 React 可选适配入口

OpenTopoX 核心框架不依赖 React。React 项目可以选择性导入 `opentopox/react`，由适配组件负责创建、更新和销毁 `NewTopoGraph` 实例：

```jsx
import { useMemo, useRef } from "react";
import { OpenTopoXGraph } from "opentopox/react";
import "opentopox/style.css";

export function TopologyPanel({ nodes, edges }) {
  const graphRef = useRef(null);
  const data = useMemo(() => ({ nodes, edges }), [nodes, edges]);

  return (
    <OpenTopoXGraph
      ref={graphRef}
      containerStyle={{ width: "100%", height: 640 }}
      config={{ theme: "neutral", minimap: true, grid: true }}
      layout={{ topoType: "preset", rankDir: "LR" }}
      data={data}
      autoFit
      onNodeClick={(node) => console.log("node", node)}
      onEdgeClick={(edge) => console.log("edge", edge)}
      onViewportChange={(viewport) => console.log("viewport", viewport)}
      onError={(error) => console.error("OpenTopoX failed", error)}
      onGraphReady={({ graph }) => graph.fitView({ padding: 0.18 })}
    />
  );
}
```

也可以使用 `useOpenTopoXGraph()` 获取同样的 ref 和命令式方法。只有导入 `opentopox/react` 的项目需要安装 React；纯 DOM/SVG 接入仍然只使用 `opentopox` 主入口。

### 3.3 直接使用源码路径

如果只是把 `src/framework/` 拷贝到宿主项目，可以使用相对路径：

```html
<link rel="stylesheet" href="./src/framework/topology.css" />

<script type="module">
  import { NewTopoGraph } from "./src/framework/index.js";
</script>
```

### 3.4 容器尺寸

框架会填满容器。宿主必须给容器一个稳定高度：

```html
<div id="topologyGraph"></div>
```

```css
#topologyGraph {
  width: 100%;
  height: 640px;
  min-height: 360px;
}
```

## 4. 最小可运行示例

```js
import { NewTopoGraph } from "./src/framework/index.js";

const topo = new NewTopoGraph({
  container: document.querySelector("#topologyGraph"),
  config: {
    theme: "neutral",
    nodeDraggable: true,
    minimap: true,
    grid: true,
  },
  handleNodeClick(node) {
    console.log("node", node);
  },
  handleEdgeClick(edge) {
    console.log("edge", edge);
  },
  handleCloseInfo() {
    console.log("canvas clicked");
  },
});

const graph = topo.getGraph();

graph.setLayout({
  topoType: "dot",
  rankDir: "LR",
  rankSep: 220,
  nodeSep: 64,
});

await graph.setData({
  centerNodeId: "app",
  nodes: [
    {
      id: "app",
      type: "cardLayerNode",
      data: {
        title: "应用服务",
        subTitle: "production",
        icon: "APP",
        domain: "service",
        group: "app",
        status: "ok",
        layer: 1,
        metric: { label: "QPS", value: "12.8k" },
        tags: ["core", "online"],
      },
    },
    {
      id: "db",
      type: "cardLayerNode",
      data: {
        title: "订单数据库",
        icon: "DB",
        domain: "database",
        group: "data",
        status: "warn",
        layer: 2,
      },
    },
  ],
  edges: [
    {
      id: "app-db",
      source: "app",
      target: "db",
      label: "读写",
      data: {
        status: "warn",
        latency: "28ms",
        traffic: "320MB/s",
      },
    },
  ],
});
```

页面卸载时销毁实例：

```js
topo.destroy();
```

## 5. 数据模型

### 5.1 节点

节点最小结构：

```js
{
  id: "service-a",
  data: {
    title: "Service A"
  }
}
```

常用字段：

```js
{
  id: "service-a",
  type: "cardLayerNode",
  position: { x: 120, y: 80 },
  data: {
    title: "Service A",
    subTitle: "primary",
    icon: "SVC",
    domain: "service",
    group: "business",
    status: "ok",
    color: "#2563eb",
    layer: 1,
    rank: 1,
    size: { width: 220, height: 96 },
    metric: { label: "health", value: "99.9%" },
    descriptions: [
      { label: "Region", value: "cn-hangzhou" }
    ],
    datasets: {
      owner: "ops",
      namespace: "prod"
    },
    tags: ["core", "prod"]
  }
}
```

常用节点类型：

| 类型 | 用途 |
| --- | --- |
| `cardNode` | 默认卡片节点 |
| `cardLayerNode` | 带层级信息的实体卡片 |
| `componentNode` | 组件或模块节点 |
| `planNode` | 计划或流程节点 |
| `operatorNode` | AgentLoop 算子节点 |
| `inputSourceNode` | AgentLoop 输入节点 |
| `sinkNode` | AgentLoop 输出节点 |
| `labeledGroupNode` | 分组父节点 |
| `groupNodeWithHandles` | 带连接点的分组父节点 |

### 5.2 边

边最小结构：

```js
{
  id: "a-b",
  source: "a",
  target: "b"
}
```

常用字段：

```js
{
  id: "a-b",
  source: "a",
  target: "b",
  label: "调用",
  data: {
    status: "ok",
    latency: "18ms",
    traffic: "120MB/s",
    metricTitle: "{sourceName} 到 {targetName} 的 {label} 关系"
  }
}
```

`source` 和 `target` 必须对应节点 `id`。节点或边的 `data.status` 推荐使用 `ok`、`warn`、`critical`。

## 6. 创建图实例

```js
const topo = new NewTopoGraph({
  container,
  className: "my-topology",
  style: { minHeight: "560px" },
  config: {
    theme: "neutral",
    nodeDraggable: true,
    hoverHighlight: true,
    hoverHighlightDegree: 1,
    minimap: true,
    grid: false,
    fitViewPadding: 0.15,
    performanceEdgeLabelLimit: 80,
  },
  onLoad() {},
  handleNodeClick(node, context) {},
  handleEdgeClick(edge, context) {},
  handleCloseInfo() {},
});
```

常用 `config`：

| 配置 | 说明 |
| --- | --- |
| `theme` | 主题名，内置 `neutral`、`aurora`、`severity` |
| `nodeDraggable` | 是否允许拖拽节点 |
| `hoverHighlight` | 是否启用 hover 关系高亮 |
| `hoverHighlightDegree` | hover 高亮关系层数 |
| `minimap` | 是否显示小地图 |
| `grid` | 是否显示网格 |
| `fitViewPadding` | 自动适配视图时的留白比例 |
| `performanceEdgeLabelLimit` | 超过多少条边后自动隐藏边标签 |
| `allowedNodeTypes` | 额外允许的自定义节点类型；已通过 `registerNodeShape()` 注册的类型会自动纳入校验 |
| `throwOnInvalid` | 数据校验失败时直接抛错，而不是继续使用清洗后的数据渲染 |

## 7. 布局

通过 `graph.setLayout()` 设置布局，再调用 `setData()`：

```js
graph.setLayout({
  topoType: "dot",
  rankDir: "LR",
  rankSep: 260,
  nodeSep: 72,
});

await graph.setData({ nodes, edges });
```

支持的布局类型：

| `topoType` | 说明 |
| --- | --- |
| `dot` | 默认方向布局，适合依赖、调用链和层级拓扑 |
| `fdp` | 力导向近似布局，适合网状关系 |
| `dagre` | 内置 Dagre-like executor |
| `graphvizDot` | DOT source 解析布局入口 |
| `graphvizFdp` | FDP DOT source 解析布局入口 |
| `worker` / `workerDot` / `workerFdp` | 使用 Web Worker 计算布局 |
| `layer` | 按 `layer` 字段分层 |
| `xyFlow` | 生成 rank 父容器的流程布局 |
| `radial` | 放射布局 |
| `grid` | 网格布局 |
| `entityFlow` | 实体拓扑流式布局 |
| `preset` | 使用节点已有 `position` |

Worker 布局默认通过同目录的 `layout.worker.js` 加载。打包项目如果需要自定义 worker 产物路径，可以传入 `workerUrl`；如果宿主希望完全控制 worker 创建逻辑，可以传入 `workerFactory`：

```js
graph.setLayout({
  topoType: "workerDot",
  workerUrl: "/assets/opentopox/layout.worker.js",
});

graph.setLayout({
  topoType: "workerDot",
  workerFactory: () => new Worker("/assets/opentopox/layout.worker.js", { type: "module" }),
});
```

使用 DOT source：

```js
graph.setLayout({
  topoType: "graphvizDot",
  dotSource: `
    digraph G {
      app -> api;
      api -> db;
    }
  `,
});

await graph.setData({ nodes: [], edges: [] });
```

注册外部布局 executor：

```js
import { registerLayoutExecutor } from "./src/framework/index.js";

registerLayoutExecutor("myLayout", async ({ nodes, edges, fallback }) => {
  const result = await runMyLayout(nodes, edges);
  return result || fallback();
});

graph.setLayout({ topoType: "myLayout" });
```

## 8. 运行时 API

`topo.getGraph()` 返回图控制 API。常用方法：

| 方法 | 说明 |
| --- | --- |
| `setData({ nodes, edges, centerNodeId })` | 设置图数据并重新布局 |
| `setGroupData({ mainGraph, subGraphs })` | 主图加多个子图组合布局 |
| `getData()` / `getGraphData()` | 获取当前节点和边 |
| `getNodes()` / `getEdges()` | 获取当前节点或边 |
| `updateGraphData(nodes, edges, options)` | 更新图数据 |
| `updateNode(id, patch)` | 更新单个节点 |
| `updateNodeData(id, patch)` | 更新单个节点 `data` |
| `selectNode(id)` | 选中节点 |
| `getSelection()` / `setSelection(selection)` | 读取或设置节点/边多选集合 |
| `selectArea(rect)` | 使用画布坐标框选节点和相交边 |
| `selectVisible()` / `invertSelection()` | 选择可见范围或对可见范围反选 |
| `selectByCriteria(criteria)` | 按 domain/status/tag/type/id 等条件批量选择 |
| `extractContext(options)` / `copyContext(options)` | 生成或复制 Agent context |
| `focusNode(id)` | 聚焦节点 |
| `handleFocusNode(id, options)` | 只展示节点上下游关系 |
| `showOriginData(options)` | 恢复原始拓扑 |
| `setLayout(options, nodeType)` | 设置布局和默认节点类型 |
| `fitView(options)` | 适配视图 |
| `fitCenter()` | 居中视图 |
| `zoomTo(zoom)` | 缩放到指定比例 |
| `getViewport()` / `setViewport(viewport)` | 读取或设置视口 |
| `setTheme(theme)` | 切换主题 |
| `setPerformanceMode(enabled)` | 切换性能模式 |
| `setEdgeLabelsVisible(enabled)` | 显示或隐藏边标签 |
| `setMinimapVisible(enabled)` | 显示或隐藏小地图 |
| `setGridVisible(enabled)` | 显示或隐藏网格 |
| `toggleFullscreen()` | 切换全屏 |
| `getRenderStats()` | 获取渲染统计 |

数据校验结果会通过 `topo:validation` 事件通知宿主。需要集中接入错误处理时，也可以在 `config` 中传入 `onValidation` 或 `onValidationError`。

上下游聚焦：

```js
await graph.handleFocusNode("app", {
  degree: 2,
  direction: "both",
});

await graph.showOriginData({ centerNodeId: "app" });
```

更新节点：

```js
graph.updateNodeData("app", {
  status: "critical",
  metric: { label: "error", value: "12%" },
});
```

## 9. 工具栏、图例和浮层组件

### 9.1 FlowToolbar

```html
<div id="toolbar"></div>
```

```js
import { FlowToolbar } from "./src/framework/index.js";

new FlowToolbar({
  container: document.querySelector("#toolbar"),
  graph: topo,
  enableReLayout: true,
  onLayoutChange(layout) {
    graph.setLayout({ topoType: layout, rankDir: "LR" });
    graph.setData({ ...graph.getData(), preserveOrigin: true });
  },
  handleReset() {
    graph.showOriginData();
  },
});
```

### 9.2 FlowControls

```js
import { FlowControls } from "./src/framework/index.js";

new FlowControls({
  container: document.querySelector("#controls"),
  graph,
  actions: ["fit", "zoom-out", "zoom-in", "center", "fullscreen"],
});
```

### 9.3 FlowLegend

```js
import { FlowLegend, filterTopologyData } from "./src/framework/index.js";

new FlowLegend({
  container: document.querySelector("#legend"),
  multi: true,
  items: [
    { key: "all", label: "全部", color: "#64748b" },
    { key: "service", label: "服务", color: "#2563eb" },
    { key: "database", label: "数据库", color: "#dc2626" },
  ],
  onChange(activeKeys) {
    const domains = activeKeys.includes("all") ? [] : activeKeys;
    const filtered = filterTopologyData({ nodes, edges, domains });
    graph.setData(filtered);
  },
});
```

### 9.4 ContextMenu 和 Tooltip

```js
import { ContextMenu, Tooltip } from "./src/framework/index.js";

new ContextMenu({
  container: graph.getContainer(),
  graph,
  items(context) {
    if (context.type === "node") {
      return [
        { label: "聚焦上下游", action: () => graph.handleFocusNode(context.id) },
        { label: "恢复全图", action: () => graph.showOriginData() },
      ];
    }
    return [{ label: "适配视图", action: () => graph.fitView() }];
  },
});

new Tooltip({
  container: graph.getContainer(),
  graph,
});
```

## 10. 详情抽屉

`TopologyDetailDrawer` 可以统一渲染节点、边、分组节点和聚合边详情。

```html
<aside id="detailDrawer"></aside>
```

```js
import {
  NewTopoGraph,
  TopologyDetailDrawer,
} from "./src/framework/index.js";

let drawer;

const topo = new NewTopoGraph({
  container: document.querySelector("#topologyGraph"),
  handleNodeClick(node) {
    drawer?.showItem(node, { type: "node" });
  },
  handleEdgeClick(edge) {
    drawer?.showItem(edge, { type: "edge" });
  },
  handleCloseInfo() {
    drawer?.showEmpty();
  },
});

const graph = topo.getGraph();

drawer = new TopologyDetailDrawer({
  container: document.querySelector("#detailDrawer"),
  getNodes: () => graph.getNodes(),
  getEdges: () => graph.getEdges(),
  context: {
    title: "业务拓扑",
  },
  onEdgeClick(edge) {
    drawer.showItem(edge, { type: "edge" });
  },
});
```

也可以只使用详情模型：

```js
import { buildTopologyDetailModel } from "./src/framework/index.js";

const detail = buildTopologyDetailModel({
  item: node,
  type: "node",
  nodes,
  edges,
});
```

## 11. 搜索、过滤和上下文保留

`filterTopologyData()` 支持节点、边、全文、分组、domain、状态过滤，并可保留关联上下文。

```js
import { filterTopologyData } from "./src/framework/index.js";

const result = filterTopologyData({
  nodes,
  edges,
  query: "order",
  domains: ["service", "database"],
  statuses: ["warn", "critical"],
  includeRelated: true,
  degree: 1,
});

await graph.setData({
  nodes: result.nodes,
  edges: result.edges,
  clearStatus: true,
});
```

返回值：

```js
{
  nodes,
  edges,
  matches: {
    nodeIds,
    edgeIds
  },
  invalidFilter
}
```

## 12. 实体分组、聚合边和数量限制

当节点数量很大时，可以先用 `createEntityTopologyView()` 做分组、展开限制和聚合边处理，再交给图渲染。

```js
import {
  createEntityTopologyView,
  toggleGroupId,
} from "./src/framework/index.js";

let expandedGroupIds = [];

function renderEntityTopology() {
  const view = createEntityTopologyView({
    nodes,
    edges,
    groupBy: (node) => node.data?.group,
    expandedGroupIds,
    groupMinSize: 4,
    expandLimit: 8,
    maxRenderNodes: 1200,
  });

  graph.setData({
    nodes: view.nodes,
    edges: view.edges,
    centerNodeId: view.nodes[0]?.id,
  });

  return view.meta;
}

function toggleGroup(groupId) {
  expandedGroupIds = toggleGroupId(expandedGroupIds, groupId);
  renderEntityTopology();
}
```

配合详情抽屉：

```js
const drawer = new TopologyDetailDrawer({
  container,
  getNodes: () => graph.getNodes(),
  getEdges: () => graph.getEdges(),
  onGroupToggle(groupId) {
    toggleGroup(groupId);
  },
  isGroupExpanded(groupId) {
    return expandedGroupIds.includes(groupId);
  },
});
```

## 13. 云资源拓扑接入

框架不绑定具体后端。宿主只需要把真实查询函数注入 provider。

```js
import {
  createCloudResourceQueryProvider,
  buildCloudResourceTopologyFromQuery,
} from "./src/framework/index.js";

const provider = createCloudResourceQueryProvider({
  async queryCloudResources(query) {
    return fetchCloudResources(query);
  },
  async queryGlobalEntities(query) {
    return fetchGlobalEntitySummary(query);
  },
});

const topology = await buildCloudResourceTopologyFromQuery({
  provider,
  query: {
    tenantId: "tenant-a",
    regionId: "cn-hangzhou",
    page: 1,
    pageSize: 20,
  },
  selectedIds: ["ecs-1", "rds-1"],
});

await graph.setData({
  nodes: topology.nodes,
  edges: topology.edges,
  centerNodeId: topology.nodes[0]?.id,
});

console.log(topology.meta.globalTopology);
console.log(topology.meta.batchSelection);
```

provider 返回数据可以是：

```js
{
  connectedResources: [],
  unconnectedResources: [],
  connections: [],
  globalTopology: { nodes: [], edges: [] },
  meta: {}
}
```

也可以用原始字段名，框架会做归一化：

- `connected` / `resources` / `nodes`
- `unconnected` / `pendingResources` / `pending`
- `connections` / `edges` / `relations`

## 14. 平行边处理

同一组 `source -> target` 多条边可以偏移显示或合并显示。

偏移显示：

```js
import { processParallelEdges } from "./src/framework/index.js";

const visibleEdges = processParallelEdges(edges, {
  mode: "offset",
  spacing: 32,
});

await graph.setData({ nodes, edges: visibleEdges });
```

合并显示：

```js
import { mergeParallelEdges } from "./src/framework/index.js";

const mergedEdges = mergeParallelEdges(edges, {
  labelFormatter(items) {
    return `${items.length} 条关系`;
  },
});
```

## 15. Agent Bridge

Agent Bridge 用于把用户在拓扑图中看到或选择的对象提取为 Agent context。交互选择默认不启用；需要在 `NewTopoGraph` 中显式设置 `enableSelection: true`，再按需开启工具栏或右键菜单入口。启用后的交互：

- 普通点击节点或边：单选。
- `Cmd/Ctrl + Click`：追加或取消选择，Control-click 触发右键菜单时也会保留追加选择语义。
- `Esc`：清空选择。
- 工具栏 `Select area` 或画布空白处 `Shift + Drag`：框选区域内节点，并选中穿过区域的边。
- 未选择对象时复制 context：默认提取当前可见视图。

```js
import { ContextMenu, FlowToolbar, NewTopoGraph } from "./src/framework/index.js";

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
  contextOptions: { scope: "selected", includeMode: "connectedEdges" },
});

container.addEventListener("topo:context-copy", (event) => {
  console.log(event.detail.copied, event.detail.context.summary);
});

// 也可以直接调用 API。没有选择对象时可改用 scope: "visible"。
await graph.copyContext({
  scope: graph.getSelection().nodes.length ? "selected" : "visible",
  includeMode: "oneHop",
});
```

常用 Agent Bridge API：

| 方法 | 说明 |
| --- | --- |
| `getSelection()` | 返回 `{ nodes, edges, primary }` |
| `setSelection(selection)` | 设置多选集合 |
| `toggleSelectionItem({ type, id })` | 追加或取消选择节点/边 |
| `clearSelection()` | 清空选择 |
| `selectArea(rect)` | 使用画布坐标框选节点和相交边 |
| `selectVisible()` | 选择当前视口内节点和边 |
| `invertSelection({ scope: "visible" })` | 对当前可见范围反选 |
| `selectByCriteria(criteria)` | 按 `domain`、`status`、`tag` 等条件批量选择 |
| `setSelectionMode("area")` | 进入框选模式 |
| `getVisibleGraphData()` | 获取当前视口内节点和内部边 |
| `extractContext(options)` | 生成 `opentopox.agent-context.v1` |
| `copyContext(options)` | 复制 Markdown + JSON context 到剪切板 |

`includeMode` 控制 context 如何从选择集合扩展：

| 模式 | 说明 |
| --- | --- |
| `explicit` | 只包含显式选择对象；选中边会补齐两端节点 |
| `connectedEdges` | 选中节点之间的内部边自动进入 context |
| `oneHop` | 在内部边基础上补齐一跳上下游 |
| `visible` | 使用当前可见视图 |

## 16. Agentic Topology Observability

Agentic Topology Observability 用于实时显示 Agent 自身活动，以及在 AI Chat 富文本中嵌入关键拓扑块。框架只传递轻量事件和引用，不在拓扑链路中传输完整 prompt、response、日志或 Agent context 正文。

### Agent 执行活动实时可视化

```js
import {
  createAgentActivityAdapter,
  createTopologyUpdateScheduler,
  NewTopoGraph,
} from "./src/framework/index.js";

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

ingestAgentEvent({
  type: "agent.tool.started",
  runId: "run-20260521",
  stepId: "inspect",
  targetId: "exec-1",
  name: "exec_command",
});
```

事件里只放轻量字段：

```js
{
  type: "agent.context.used",
  runId: "run-20260521",
  stepId: "inspect",
  targetId: "ctx-prod-topology",
  name: "Selected topology context",
  contextRef: {
    id: "ctx-prod-topology",
    summary: "12 nodes, 18 edges",
    nodeCount: 12,
    edgeCount: 18,
    truncated: false,
  },
}
```

`contextRef` 只表示“用过哪个 context”。完整 context 内容由使用者根据 `contextRef.id` 按需加载。

### AI Chat 富文本拓扑块

```js
import {
  createChatTopologyBlockPayload,
  renderAgentTopologyBlock,
} from "./src/framework/index.js";

const payload = createChatTopologyBlockPayload({
  kind: "activity-trace",
  title: "Agent activity",
  summary: "关键执行过程",
  events: agentEvents,
  view: {
    compact: true,
    readonly: true,
    maxHeight: 220,
  },
});

renderAgentTopologyBlock(messageElement, payload);
```

Chat block 默认只读、紧凑、固定高度。节点点击只派发 `topo:chat-topology-node`，宿主应用决定是否打开详情或按 ID 懒加载正文。

## 17. AgentLoop 和 Copilot 图

AgentLoop 图支持边上插入算子、删除算子和专用节点类型。

```js
import { AgentLoopTopoGraph } from "./src/framework/index.js";

const topo = new AgentLoopTopoGraph({
  container,
  config: {
    type: "agentloop",
    theme: "aurora",
  },
  renderAddNodeModal({ edge, graph }) {
    return {
      id: `operator-${Date.now()}`,
      type: "operatorNode",
      data: {
        title: "新算子",
        icon: "OP",
        status: "ok",
      },
    };
  },
  onDeleteNode(node) {
    console.log("delete", node.id);
  },
});
```

也可以在普通图实例中切换：

```js
graph.setGraphType("agentloop");
```

## 18. 预设图入口

需要按常见图类型快速创建实例时，可以使用轻量入口：

```js
import {
  createTopologyGraph,
  registerNodeShape,
  registerEdgeShape,
} from "./src/framework/index.js";

// 推荐：明确注册节点和边 shape。
registerNodeShape("service-card", {
  render(node) {
    return `<strong>${node.data?.title || node.id}</strong>`;
  },
});

registerEdgeShape("critical-edge", {
  className: "is-critical",
});

const topo = createTopologyGraph({
  type: "flow",
  container,
  config: {
    minimap: true,
    grid: true,
  },
});
```

`registerTopologyShape(kind, type, shape)` 也会被导出，用于兼容旧的预设图接入方式。新代码建议优先使用 `registerNodeShape()` 和 `registerEdgeShape()`，避免在文面上混淆节点和边的注册目标。

类型映射：

| 类型 | 当前类 |
| --- | --- |
| `entity` / `layered` | `LayeredTopologyGraph` |
| `standard` | `StandardTopologyGraph` |
| `map` / `spatial` | `SpatialTopologyGraph` |
| `flow` | `FlowTopologyGraph` |

## 19. 事件

框架会在容器上派发 DOM `CustomEvent`：

| 事件 | 说明 |
| --- | --- |
| `topo:render` | 渲染完成 |
| `topo:viewport` | 视口变化 |
| `topo:fullscreen` | 全屏状态变化 |
| `topo:node-drag` | 节点拖拽结束 |
| `topo:node-animation` | 节点动画完成 |
| `topo:selection-change` | 节点/边选择集合变化 |
| `topo:selection-mode-change` | 选择模式变化 |
| `topo:selection-area-start` | 开始框选 |
| `topo:selection-area-end` | 完成框选 |
| `topo:context-extract` | Agent context 已生成 |
| `topo:context-copy` | Agent context 已写入剪切板或返回 fallback |
| `topo:agentloop-insert` | AgentLoop 插入节点 |
| `topo:agentloop-delete` | AgentLoop 删除节点 |
| `topo:context-menu` | 右键菜单打开 |
| `topo:context-menu-action` | 右键菜单动作触发 |
| `topo:chat-topology-node` | Chat 拓扑块节点点击 |
| `topo:chat-topology-edge` | Chat 拓扑块边点击 |
| `topo:legend-change` | 图例筛选变化 |

示例：

```js
graph.getContainer().addEventListener("topo:render", (event) => {
  console.log(event.detail.stats);
});
```

## 19. 样式和主题

直接引入框架样式：

```html
<link rel="stylesheet" href="./src/framework/topology.css" />
```

或在打包项目中：

```js
import "opentopox/style.css";
```

主题通过根节点 class 和 CSS 变量实现：

```js
graph.setTheme("severity");
```

内置主题：

- `neutral`
- `aurora`
- `severity`

宿主可以覆盖 CSS 变量：

```css
.new-topo-graph {
  --topo-bg: #f8fafc;
  --topo-text: #172033;
  --topo-edge: #8aa2ba;
  --topo-selected: #2563eb;
}
```

## 20. 性能建议

- 大图优先使用 `workerDot`、`workerFdp`、`layer` 或 `entityFlow`。
- 节点超过业务可读范围时，先使用 `createEntityTopologyView()` 分组和限制数量。
- 边很多时开启 `graph.setEdgeLabelsVisible(false)` 或调低 `performanceEdgeLabelLimit`。
- 频繁筛选时复用原始 `nodes`、`edges`，只把过滤结果交给 `graph.setData()`。
- 页面销毁时调用 `topo.destroy()`，并销毁自行创建的 `ContextMenu`、`Tooltip`。

## 21. 常见问题

### 图不显示

检查容器是否有高度，并确认已经引入 `topology.css`。

### 边不显示

检查每条边的 `source` 和 `target` 是否能匹配到节点 `id`。

### Worker 布局失败

确认 `layout.worker.js` 和 `TopoLayout.js` 位于同一框架目录。框架默认会 fallback 到同步布局，除非设置了 `workerFallback: false`。

### 包名导入失败

包名导入需要项目通过 workspace、Git 依赖或其他方式解析到本仓库。直接打开静态 HTML 时，请使用源码相对路径导入。

### 业务查询怎么接入

不要把业务 SDK 写入框架。推荐使用 `createCloudResourceQueryProvider()` 或自行在业务层查询后转换为标准 `nodes`、`edges`。

## 22. 本仓库 Demo

本仓库包含两个验证入口：

- 框架能力 Demo：`index.html`
- 实体拓扑示例页面

本地启动：

```sh
python3 -m http.server 5177
```

打开：

- `http://127.0.0.1:5177/`
