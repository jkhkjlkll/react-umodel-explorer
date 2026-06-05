# OpenTopoX 开发者指南

OpenTopoX 是一个无第三方运行时依赖的可观测拓扑图渲染框架。它使用原生 DOM、SVG 和 JavaScript 实现节点渲染、连线渲染、布局计算、视口控制、对象拖拽、主题切换和大图性能模式。

这份文档只说明框架本身。

## 1. 核心能力

- 节点渲染：使用 DOM 节点卡片承载对象信息。
- 连线渲染：使用 SVG path 绘制 Bezier 曲线、箭头、命中区域和边标签。
- 布局引擎：支持 `dot`、`fdp`、`layer`、`xyFlow`、`radial`、`grid`、`entityFlow`、`preset`。
- 视口控制：支持画布平移、滚轮缩放、居中、适配视图、聚焦节点和小地图导航。
- 增量动画：数据变化时保留旧节点坐标，驱动节点平滑过渡和新增节点淡入。
- 对象交互：支持节点选择、边选择、节点拖拽、节点 hover 关系高亮、画布点击关闭详情。
- 主题系统：通过 CSS 变量和主题 class 切换视觉样式。
- 性能模式：支持大图下关闭动画、隐藏次要内容、隐藏边标签、保持线宽可见。
- 事件通知：渲染完成和节点拖拽结束会派发 DOM CustomEvent。

## 2. 框架模块

```txt
framework/
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
  RealtimeTopologyProtocol.js
  TopologyDataAdapter.js
  TopologyGraphStore.js
  TopologyUpdateScheduler.js
```

模块职责：

- `index.js`：统一导出框架类。
- `NewTopoGraph.js`：图实例、渲染层、交互层、视口层、主题和性能控制。
- `LegacyTopoGraph.js`：预设图入口类和通用 shape 注册辅助函数。
- `TopoLayout.js`：布局引擎，把节点和边转换为带坐标的节点集合。
- `topology.css`：框架独立样式入口，不包含 demo 外壳样式。
- `FlowToolbar.js`：可选工具栏，基于 `getGraph()` API 实现 fit、center、zoom、layout 切换。
- `FlowLegend.js`：可选图例组件，用于类型选中和过滤状态联动。
- `FlowControls.js`：轻量画布控件，提供 fit、zoom、center、fullscreen。
- `ContextMenu.js`：节点、边、画布右键菜单组件。
- `Tooltip.js`：节点和边 hover overlay 提示组件。
- `TopologyDetailDrawer.js`：框架级实体/边/分组详情抽屉组件。
- `Registry.js`：轻量 `register` 能力，用于 shape/plugin 注册入口。
- `CloudResourceTopologyAdapter.js`：云资源 connected/unconnected、查询 provider、全局实体拓扑、分页和批量选择的数据装配适配层。
- `TopologyDataUtils.js`：搜索、过滤和关联上下文保留工具。
- `EntityTopologyModel.js`：实体分组、展开限制、聚合边、详情模型和边指标标题模板。
- `RealtimeTopologyProtocol.js`：实时拓扑协议常量、消息创建器、校验器和顺序判断工具。
- `TopologyDataAdapter.js`：WebSocket、SSE、polling 和手动输入的实时消息接入适配器。
- `TopologyGraphStore.js`：实时拓扑权威状态、快照/patch 合并、数据校验和连接状态维护。
- `TopologyUpdateScheduler.js`：高频更新批处理、同 ID patch 合并、背压和图 API 调度。

框架还依赖一组 CSS class 约定，例如 `.new-topo-graph`、`.topo-node`、`.topo-svg`、`.topo-edge-path`。样式可以由宿主工程自行提供，也可以直接引入 `src/framework/topology.css`。

## 3. 架构

框架可以理解为四层：

```txt
宿主应用
  负责数据来源、筛选逻辑、详情面板、业务状态

控制 API
  NewTopoGraph.getGraph()
  暴露 setData / setLayout / fitView / zoomTo / setTheme 等方法

布局引擎
  TopoLayout
  根据 nodes / edges 和布局配置计算 node.position

渲染引擎
  NewTopoGraph
  DOM 渲染节点，SVG 渲染边，并同步应用 viewport transform
```

节点和边分层渲染：

```txt
.new-topo-graph
  .topo-viewport
    svg.topo-svg
      g
        g.topo-edge
          path.topo-edge-path
          path.topo-edge-hit
          text.topo-edge-label
    div.topo-node-layer
      button.topo-node
```

视口变换同时作用在 SVG 层和节点层：

```js
translate(viewport.x, viewport.y) scale(viewport.zoom)
```

这样可以保证平移和缩放时，节点与连线始终对齐。

## 4. 安装与导入

当前实现是浏览器 ES Module，并带有独立 package exports。推荐接入：

```js
import { NewTopoGraph } from "opentopox";
import "opentopox/style.css";
```

源码路径接入：

```js
import {
  NewTopoGraph,
  StandardTopologyGraph,
  FlowTopologyGraph,
  TopoLayout,
  FlowToolbar,
  FlowLegend,
  TopologyDetailDrawer,
  createEntityTopologyView,
  buildTopologyDetailModel,
  filterTopologyData,
} from "./framework/index.js";
```

导出项：

```js
export { AgentLoopTopoGraph, CopilotTopoGraph, NewTopoGraph } from "./NewTopoGraph.js";
export { StandardTopologyGraph, LayeredTopologyGraph, SpatialTopologyGraph, FlowTopologyGraph, createTopologyGraph, registerTopologyShape } from "./LegacyTopoGraph.js";
export { TopoLayout, createDagreLayoutExecutor, createDotLayoutExecutor, registerLayoutExecutor, createGraphvizLayoutExecutor, parseDotGraph } from "./TopoLayout.js";
export { FlowToolbar } from "./FlowToolbar.js";
export { FlowLegend } from "./FlowLegend.js";
export { FlowControls, Toolbar } from "./FlowControls.js";
export { ContextMenu } from "./ContextMenu.js";
export { Tooltip } from "./Tooltip.js";
export { TopologyDetailDrawer } from "./TopologyDetailDrawer.js";
export { register, registerNodeShape, registerEdgeShape } from "./Registry.js";
export { buildCloudResourceTopology, buildCloudResourceTopologyFromQuery, buildGlobalEntityTopology, createCloudResourceQueryProvider } from "./CloudResourceTopologyAdapter.js";
export { filterTopologyData, getDataByNodeGroup, processParallelEdges, mergeParallelEdges } from "./TopologyDataUtils.js";
export { createEntityTopologyView, buildTopologyDetailModel } from "./EntityTopologyModel.js";
export { createRealtimeTopologySnapshot, createRealtimeNodePatch, createRealtimeEdgePatch, createRealtimeTopologyPatch, validateRealtimeTopologyMessage, shouldAcceptRealtimeTopologyMessage } from "./RealtimeTopologyProtocol.js";
export { TopologyDataAdapter, createTopologyDataAdapter, TOPOLOGY_DATA_TRANSPORTS } from "./TopologyDataAdapter.js";
export { TopologyGraphStore, createTopologyGraphStore } from "./TopologyGraphStore.js";
export { TopologyUpdateScheduler, createTopologyUpdateScheduler } from "./TopologyUpdateScheduler.js";
```

## 5. 最小接入

宿主页面提供容器：

```html
<div id="graph"></div>
```

创建图实例：

```js
import { NewTopoGraph } from "./framework/index.js";

const topo = new NewTopoGraph({
  container: document.querySelector("#graph"),
  config: {
    theme: "neutral",
    nodeDraggable: true,
    performanceEdgeLabelLimit: 70,
  },
  handleNodeClick(node) {
    console.log("node selected", node);
  },
  handleEdgeClick(edge) {
    console.log("edge selected", edge);
  },
  handleCloseInfo() {
    console.log("canvas clicked");
  },
});

const graph = topo.getGraph();

graph.setLayout({
  topoType: "dot",
  rankDir: "LR",
  rankSep: 240,
  nodeSep: 52,
});

await graph.setData({
  nodes,
  edges,
});
```

## 6. 数据模型

### Node

最小节点：

```js
{
  id: "service-a",
  data: {
    title: "Service A",
    domain: "service",
    status: "ok"
  }
}
```

完整节点：

```js
{
  id: "database-a",
  data: {
    title: "Database A",
    subTitle: "primary",
    domain: "database",
    icon: "DB",
    status: "critical",
    layer: 3,
    rank: 3,
    color: "#dc2626",
    size: { width: 180, height: 68 },
    metric: { label: "connections", value: "92%" },
    tags: ["storage", "primary"],
    action: { fixed: true }
  }
}
```

字段说明：

- `id`：节点唯一 ID。
- `data.title`：节点主标题。
- `data.subTitle`：节点副标题。
- `data.domain`：对象类型，用于排序、颜色、展示。
- `data.icon`：节点图标文本。
- `data.status`：状态，建议使用 `ok`、`warn`、`critical`。
- `data.layer`：层级布局、网格排序、XY 布局使用。
- `data.rank`：有向布局、XY 布局使用。
- `data.color`：自定义节点强调色。
- `data.size`：自定义节点尺寸。
- `data.metric`：节点指标展示数据。
- `data.tags`：标签数组。
- `data.position`：`preset` 布局使用的业务坐标。
- `data.action.fixed`：是否在支持 fixed 的布局中保留已有坐标。

### Edge

最小连线：

```js
{
  id: "e-service-database",
  source: "service-a",
  target: "database-a"
}
```

完整连线：

```js
{
  id: "e-service-database",
  source: "service-a",
  target: "database-a",
  label: "SQL",
  data: {
    status: "warn",
    latency: "124 ms",
    traffic: "1.1k qps"
  }
}
```

字段说明：

- `id`：连线唯一 ID。
- `source`：源节点 ID。
- `target`：目标节点 ID。
- `label`：连线标签。
- `data.status`：状态，影响边颜色。
- `data`：可放任意业务元数据。

## 7. 构造参数

```js
new NewTopoGraph({
  container,
  config,
  style,
  className,
  onLoad,
  handleNodeClick,
  handleEdgeClick,
  handleCloseInfo,
});
```

参数说明：

- `container`：必填，图挂载容器。
- `config.theme`：初始主题。
- `config.nodeDraggable`：是否允许节点拖拽，默认 `true`。
- `config.performanceEdgeLabelLimit`：性能模式下自动隐藏边标签的边数量阈值。
- `style`：附加到根节点的内联样式。
- `className`：附加到根节点的 class。
- `onLoad`：实例初始化完成回调。
- `handleNodeClick(node)`：节点点击回调。
- `handleEdgeClick(edge)`：边点击回调。
- `handleCloseInfo()`：画布空白处点击回调。

## 8. 控制 API

所有运行时 API 都从 `getGraph()` 获取：

```js
const api = topo.getGraph();
```

### 数据

```js
await api.setData({
  nodes,
  edges,
  centerNodeId: "service-a",
  clearStatus: true,
  disableAnimate: false,
});

const data = api.getData();
```

`setData()` 会执行：

1. 调用当前布局引擎计算节点坐标。
2. 更新内部节点和边。
3. 渲染 SVG 边和 DOM 节点。
4. 记录渲染统计。
5. 派发 `topo:render`。
6. 自动 `fitView()` 或聚焦 `centerNodeId`。

`getData()` 会返回当前内部数据。节点拖拽后，返回的节点会包含最新 `position`。

### 布局

```js
api.setLayout({
  topoType: "grid",
  rankDir: "LR",
  rankSep: 150,
  nodeSep: 52,
  clusterSpacing: 320,
  layerSpacing: 72,
}, "cardNode");
```

支持布局：

- `dot`
- `fdp`
- `layer`
- `xyFlow`
- `radial`
- `grid`
- `entityFlow`
- `preset`

第二个参数 `nodeType` 会写入节点 class，目前主要用于样式区分。

### 视口

```js
api.fitView({ padding: 0.16 });
api.fitCenter();
api.zoomTo(1.2);
const viewport = api.getViewport();
```

`viewport` 结构：

```js
{
  x: 0,
  y: 0,
  zoom: 1
}
```

### 显示和交互

```js
api.setNodeDraggable(true);
api.setEdgeLabelsVisible(false);
api.setPerformanceMode(true);
api.setAnimateMode(false);
api.focusNode("service-a");
api.setHoverHighlight(true, { degree: 1 });
api.setMinimapVisible(true);
```

说明：

- `setNodeDraggable(enabled)`：启用或禁用对象拖拽。
- `setEdgeLabelsVisible(enabled)`：显示或隐藏边标签。
- `setPerformanceMode(enabled)`：开启性能模式，同时关闭动画。
- `setAnimateMode(enabled)`：单独控制动画。
- `focusNode(id)`：移动视口并选中指定节点。
- `setHoverHighlight(enabled, { degree })`：启用或禁用 hover 关系高亮，`degree` 表示向外扩展的关联层数。
- `setMinimapVisible(enabled)`：显示或隐藏右下角全局导航小地图。

### 小地图导航

构造实例时可以开启右下角全局导航视图：

```js
const topo = new NewTopoGraph({
  container,
  config: {
    minimap: true,
    minimapWidth: 220,
    minimapHeight: 150,
    minimapEdgeLimit: 1200
  }
});
```

小地图会根据当前 `nodes` / `edges` 自动绘制全局缩略图，并叠加当前视口矩形。用户可以在小地图上点击或拖动，主画布会以该位置为中心移动。

性能约定：

- 节点始终绘制为简化矩形。
- 边数量超过 `minimapEdgeLimit` 时，小地图只绘制节点，避免大图下生成过多 SVG line。
- 小地图只读取布局后的 `node.position`，不会参与布局计算。

### Hover 关系高亮

构造实例时可以开启节点 hover 高亮：

```js
const topo = new NewTopoGraph({
  container,
  config: {
    hoverHighlight: true,
    hoverHighlightDegree: 1
  }
});
```

行为规则：

- 鼠标进入节点时，框架从当前节点出发计算 `degree` 层邻接关系。
- 当前节点、邻接节点和邻接边会进入 `is-hover-related` 状态。
- 其它节点和边会进入 `is-hover-dimmed` 状态。
- 鼠标离开节点后清空 hover 状态。

默认 `degree` 为 `1`，即高亮当前实体和直接相连链路。样式由 `.has-hover-highlight`、`.is-hover-related`、`.is-hover-dimmed` 控制。

### 主题

```js
api.setTheme("aurora");
```

主题通过根节点 class 和 CSS 变量实现。框架会给根元素加上：

```txt
theme-aurora
```

宿主样式可以定义：

```css
:root[data-theme="aurora"] {
  --primary: #008f7a;
  --edge: #78a8a0;
}

.new-topo-graph.theme-aurora {
  background-image: radial-gradient(#ccebe5 1px, transparent 1px);
}
```

### 统计

```js
const stats = api.getRenderStats();
```

返回示例：

```js
{
  nodes: 2000,
  edges: 3000,
  durationMs: 38,
  performanceMode: true,
  layout: "grid",
  theme: "neutral"
}
```

## 9. 事件

### `topo:render`

`setData()` 完成后派发。

```js
container.addEventListener("topo:render", (event) => {
  console.log(event.detail);
});
```

事件数据：

```js
{
  nodes,
  edges,
  durationMs,
  performanceMode,
  layout,
  theme
}
```

### `topo:node-drag`

节点拖拽结束后派发。

```js
container.addEventListener("topo:node-drag", (event) => {
  const { node } = event.detail;
  console.log(node.id, node.position);
});
```

## 10. 布局原理

布局引擎的输入：

```js
{
  nodes,
  edges,
  innerFunc,
  clearStatus
}
```

布局引擎的输出：

```js
{
  nodes: positionedNodes,
  edges
}
```

核心约定：布局只负责生成 `node.position`，不直接操作 DOM。

### `dot`

有向分层布局。

处理过程：

1. 根据 `source -> target` 构建入度和出边表。
2. 从入度为 0 的节点开始拓扑遍历。
3. 子节点 rank 至少为父节点 rank + 1。
4. 每个 rank 内排序。
5. 按 `rankSep` 和 `nodeSep` 生成坐标。

适合调用链路、依赖关系、从左到右或从上到下的拓扑。

### `layer`

读取 `node.data.layer` 或 `node.data.rank`，按层分桶排布。

```js
{
  data: { layer: 2 }
}
```

适合宿主业务已经有明确层级的对象图。

### `xyFlow`

读取 `rank` 和 `layer`，按二维分组排布。

```js
{
  data: { rank: 2, layer: 4 }
}
```

适合已经有二维层级语义的拓扑。

### `radial`

根据 rank 计算半径，将每层节点分布到圆周上。

适合中心扩散型关系。

### `grid`

按 layer、domain、id 排序后放入网格。

它是大规模对象图的推荐布局，时间复杂度接近 O(n)。

### `entityFlow`

以一个中心实体为原点，根据有向边自动排布实体关系流。

```js
api.setLayout({
  topoType: "entityFlow",
  focusId: "service-a",
  columnSpacing: 285,
  rowSpacing: 42
});
```

布局规则：

- `focusId` 对应的中心实体放在中间列。
- 与中心实体同类型、并共享上游或下游的对象作为同级实体，放在中间列上下方。
- 能到达中心实体的上游对象放在左侧列。
- 从中心实体或同级实体出发可到达的下游对象放在右侧列。
- 上游节点上的旁路分支保留在上游列，避免被误放到中心列。
- 每一列根据相邻列的连接重心计算纵向位置，再用对象类型和标题做稳定排序。

这个布局不读取固定坐标，适合服务拓扑、资源依赖、调用链上下游、告警影响面等以“当前对象”为中心的关系图。

### `preset`

读取 `node.position` 或 `node.data.position` 作为节点坐标，只做整体归一化。

```js
{
  id: "service-a",
  data: {
    position: { x: 480, y: 220 }
  }
}
```

适合业务已经计算好关系流、泳道、地理位置或人工编排坐标的场景。

### `fdp`

简化力导向布局。

机制：

- 节点之间排斥。
- 连线提供弹簧力。
- 多轮迭代后得到稳定坐标。

注意：力导向布局存在节点两两排斥成本。当前实现中，节点数超过 600 时会自动降级为 `grid`，避免长时间阻塞浏览器。

## 11. 渲染原理

### 节点

节点渲染为 DOM：

```html
<button class="topo-node">
  ...
</button>
```

节点位置通过 transform 控制：

```js
element.style.transform = `translate(${x}px, ${y}px)`;
```

节点尺寸由 `getNodeSize(node)` 决定：

- 优先使用 `node.data.size`
- 其次使用 `node.style.size`
- 否则使用默认卡片尺寸

### 边

边渲染为 SVG：

```html
<svg class="topo-svg">
  <g class="topo-edge">
    <path class="topo-edge-path" />
    <path class="topo-edge-hit" />
    <text class="topo-edge-label"></text>
  </g>
</svg>
```

每条边包含：

- `.topo-edge-path`：可见线条。
- `.topo-edge-hit`：透明粗线，用于点击命中。
- `.topo-edge-label`：可选边标签。

边路径由源节点和目标节点的相对位置生成 Bezier 曲线。起点和终点会自动选择更合理的锚点。

### 大图 SVG 注意事项

大规模图中，SVG 的 path 坐标范围通常远大于 SVG 元素自身视口。如果 SVG 默认裁切，部分边会不可见。

建议样式：

```css
.topo-svg {
  overflow: visible;
}

.topo-edge-path,
.topo-edge-hit {
  vector-effect: non-scaling-stroke;
}
```

作用：

- `overflow: visible` 避免边被 SVG viewport 裁掉。
- `vector-effect: non-scaling-stroke` 保证缩放后线宽仍可见。

## 12. 拖拽原理

启用拖拽：

```js
api.setNodeDraggable(true);
```

拖拽过程：

1. 节点收到 `pointerdown`。
2. 框架记录鼠标起点、节点起点和当前 zoom。
3. `pointermove` 时根据 zoom 反算图坐标位移。
4. 更新 `node.position`。
5. 更新节点 transform。
6. 使用 `requestAnimationFrame` 节流重绘连线。
7. `pointerup` 后派发 `topo:node-drag`。

拖拽后，`getData()` 返回的是最新坐标。

## 13. 性能策略

推荐大图配置：

```js
api.setLayout({
  topoType: "grid",
  rankSep: 150,
  layerSpacing: 72,
});

api.setPerformanceMode(true);
api.setEdgeLabelsVisible(false);
```

当前框架针对大图做了这些优化：

- 边端点查找使用 `Map(id -> node)`。
- 性能模式关闭动画。
- 性能模式隐藏节点次要内容。
- 大量边时隐藏 SVG text 标签。
- SVG 线条使用 non-scaling stroke。
- 节点拖拽时用 `requestAnimationFrame` 节流边重绘。
- 超大图下 `fdp` 自动降级到 `grid`。

建议：

- 500 条边以上默认关闭边标签。
- 1000 个对象以上默认开启性能模式。
- 大图优先使用 `grid` 或业务自定义布局。
- 搜索、过滤、聚焦应由宿主应用负责，框架只负责渲染传入的数据。

## 14. 样式契约

框架会生成这些关键 class：

```txt
.new-topo-graph
.topo-viewport
.topo-svg
.topo-node-layer
.topo-node
.topo-edge
.topo-edge-path
.topo-edge-hit
.topo-edge-label
.is-selected
.is-performance
.is-draggable
.is-node-dragging
.theme-{name}
```

节点状态 class：

```txt
.status-ok
.status-warn
.status-critical
```

宿主工程可以通过这些 class 完全重写视觉表现。

## 15. 扩展节点渲染

当前节点内容由框架内部 `renderNodeContent(node)` 生成。

如果要将框架产品化，建议将节点渲染开放为构造参数：

```js
new NewTopoGraph({
  container,
  renderNode(node) {
    return `
      <div class="custom-node">
        <strong>${node.data.title}</strong>
      </div>
    `;
  },
});
```

当前版本可以先通过这些字段控制节点内容：

- `data.icon`
- `data.title`
- `data.subTitle`
- `data.metric`
- `data.color`
- `data.size`
- `data.status`

## 16. 扩展布局

在 `TopoLayout.execute()` 中加入新的 `topoType` 分支：

```js
if (topoType === "custom") {
  return this.customLayout({ nodes, edges });
}
```

实现新布局：

```js
customLayout({ nodes, edges }) {
  return {
    nodes: nodes.map((node, index) => ({
      ...node,
      position: {
        x: index * 160,
        y: 100,
      },
    })),
    edges,
  };
}
```

使用：

```js
api.setLayout({ topoType: "custom" });
await api.setData({ nodes, edges });
```

内置布局 executor：

```js
const dotSource = `
  digraph Demo {
    api [label="API", layer=1];
    db [label="DB", layer=2];
    api -> db [label="SQL"];
  }
`;
const dotGraph = parseDotGraph(dotSource);

api.setLayout({ topoType: "graphvizDot", dotSource });
await api.setData(dotGraph);
```

- `dagre`：内置 Dagre-like 分层布局 executor。
- `graphvizDot`：解析 DOT source 后走分层布局。
- `graphvizFdp`：解析 DOT source 后走力导向布局。
- `createGraphvizLayoutExecutor()`：用于宿主接入真实 Graphviz/Dagre 依赖并覆盖默认 executor。

## 17. 云资源查询 Provider

`CloudResourceTopologyAdapter.js` 可以直接消费静态资源，也可以通过 provider 对接通用资源查询、资源关系查询或云资源查询接口。provider 只约定输入输出，不绑定具体后端。

```js
import {
  buildCloudResourceTopologyFromQuery,
  createCloudResourceQueryProvider,
} from "./framework/index.js";

const provider = createCloudResourceQueryProvider({
  async getCloudResourceData({ workspace, regionId, spl }) {
    return {
      connectedResources,
      unconnectedResources,
      connections,
      meta: { workspace, regionId, spl },
    };
  },
  async queryGlobalEntities() {
    return { entityCountMap, entitySetMap, relations };
  },
});

const topology = await buildCloudResourceTopologyFromQuery({
  provider,
  query: { workspace, regionId, spl },
  page: 1,
  pageSize: 20,
  selectedIds: ["oss-raw"],
});

await api.setData(topology);
```

`buildCloudResourceTopologyFromQuery()` 会补齐 connected/unconnected 分页、全局实体拓扑、批量选择和查询上下文 meta。真实鉴权、接口请求、缓存失效策略仍由宿主的 provider 实现。

## 18. 实体拓扑模型

`EntityTopologyModel.js` 负责产品级实体拓扑数据装配，适合在业务层调用后再交给 `NewTopoGraph.setData()` 渲染。

```js
import { createEntityTopologyView } from "./framework/index.js";

const view = createEntityTopologyView({
  nodes,
  edges,
  enabled: true,
  groupBy: (node) => node.data.groupKey,
  expandedGroupIds: ["ecs-instances"],
  expandLimit: 4,
  maxRenderNodes: 1200,
});

await api.setData(view);
```

它会输出：

- `data.isGroupNode`：折叠或 overflow 组节点。
- `data.groupNodeIds`：组内原始实体 ID。
- `data.isGroupEdge`：聚合边。
- `data.aggregatedEdges`：聚合边中的原始边列表。
- `meta.hiddenNodeCount`：因为折叠、展开上限或渲染上限隐藏的实体数。

详情面板可以用 `buildTopologyDetailModel()` 统一生成节点、边、分组和聚合边的展示模型，也可以直接用 `TopologyDetailDrawer` 渲染实体属性、指标表、数据集、上下游关系、聚合边明细、平行边信息和分组实体表。边上的 `data.metricTitle` 支持 `{source}`、`{sourceName}`、`{target}`、`{targetName}`、`{label}`、`{status}` 等模板变量。

```js
const drawer = new TopologyDetailDrawer({
  container: document.querySelector("#detailsPanel"),
  getNodes: () => nodes,
  getEdges: () => edges,
  getContext: () => ({ workspace, timeRange, regionId }),
  onEdgeClick: (edge) => drawer.showItem(edge, { type: "edge" }),
});

drawer.showItem(selectedNode);
```

## 19. 组合布局

`TopoLayout.groupLayout()` 和 `NewTopoGraph.getGraph().setGroupData()` 用于主图 + 子图的组合布局。主图节点可以作为子图容器，框架会先对子图内部布局，再根据子图尺寸扩大主图容器。

```js
api.setLayout({
  topoType: "dot",
  rankDir: "LR",
  groupPadding: 36,
  subGraphRankDir: "TB",
});

await api.setGroupData({
  mainGraph: {
    nodes: [
      { id: "plan-a", type: "planNode", data: { title: "Plan A" } },
      { id: "plan-b", type: "planNode", data: { title: "Plan B" } },
    ],
    edges: [{ id: "main-a-b", source: "plan-a", target: "plan-b" }],
  },
  subGraphs: [
    {
      id: "plan-a",
      nodes: [{ id: "operator-a", type: "operatorNode", data: { title: "Operator A" } }],
      edges: [],
    },
  ],
});
```

返回的布局结果包含：

- `parent`：主图中承载子图的父容器节点。
- `nodes`：普通主图节点和所有带 `parentId` 的子图节点。
- `edges`：主图边与子图内部边。
- `fitViewNodes`：建议自动适配视图的主图节点集合。

## 20. 预设图入口

预设入口可以按常见拓扑场景映射到当前 DOM/SVG 图实现：`entity/layered -> LayeredTopologyGraph`、`standard -> StandardTopologyGraph`、`map/spatial -> SpatialTopologyGraph`、`flow -> FlowTopologyGraph`。框架不内置第三方图渲染运行时，shape/plugin 常用能力由轻量注册入口提供。

```js
import { createTopologyGraph } from "./framework/index.js";

const graphInstance = createTopologyGraph({
  type: "flow",
  container: document.querySelector("#graph"),
});

const api = graphInstance.getGraph();
api.registerNodeShape("serviceNode", (node, { escapeHtml }) => `
  <strong>${escapeHtml(node.data.title)}</strong>
`);
api.registerEdgeShape("pulseEdge", {
  pathClassName: "pulse-edge-path",
  labelFormatter: (edge) => `Flow ${edge.label}`,
});
api.getPluginInstance("grid").show();
```

`getPluginInstance("fullscreen" | "grid" | "minimap")` 返回轻量控制对象，覆盖 `request/exit`、`show/hide/toggle` 场景。自定义 shape 需要返回 HTML 字符串，复杂自定义节点可以由宿主实现为 DOM/CSS 或 SVG edge 样式。

公共文档推荐直接使用 `registerNodeShape()` 和 `registerEdgeShape()`。`registerTopologyShape(kind, type, shape)` 是旧预设入口的兼容封装，`kind === "edge"` 时转发到边 shape 注册，否则转发到节点 shape 注册。

已通过 `registerNodeShape()` 注册的节点类型会自动进入数据校验 allow-list；如果宿主只想声明类型而暂不注册渲染器，可以通过 `config.allowedNodeTypes` 补充允许列表。返回字符串的自定义 shape、Tooltip 内容和 FlowToolbar children 都按 trusted HTML 处理；如果内容来自用户输入，优先返回 DOM `Node` 并自行转义。

## 21. 可选工具栏

`FlowToolbar` 是可选模块。它不参与核心渲染，只是调用图实例 API：

```js
import { FlowToolbar } from "./framework/index.js";

new FlowToolbar({
  container: document.querySelector("#toolbar"),
  graph: topo,
  onLayoutChange(layout) {
    api.setLayout({ topoType: layout });
    api.setData(currentData);
  },
});
```

工具栏默认提供：

- fit view
- center
- zoom in
- zoom out
- fullscreen
- layout 切换

如果宿主应用有自己的 UI，可以不使用 `FlowToolbar`。

## 22. 常见问题

### 为什么边和节点会分层渲染？

DOM 更适合复杂节点内容，SVG 更适合绘制连线。两层共用同一个 viewport transform，以此保持对齐。

### 为什么大图默认建议隐藏边标签？

边标签是 SVG text。大量 text 会增加 DOM 节点、绘制成本和布局负担。大图中建议通过选中边后展示详情，而不是常驻显示所有标签。

### 为什么拖拽时要根据 zoom 反算位移？

屏幕移动距离不是图坐标移动距离。图被缩放后，拖拽位移需要除以当前 `viewport.zoom`，否则缩放状态下拖拽会过快或过慢。

### 为什么 `fdp` 不适合大图？

力导向布局通常包含节点两两排斥，节点数增长后成本很高。当前实现超过 600 个节点时会自动降级到 `grid`。

### 如何持久化拖拽后的坐标？

监听 `topo:node-drag`，把 `event.detail.node.position` 写回业务状态或服务端即可。

```js
container.addEventListener("topo:node-drag", (event) => {
  savePosition(event.detail.node.id, event.detail.node.position);
});
```

## 23. 接入建议

- 框架只负责渲染和交互，不应该承担业务数据查询。
- 宿主应用负责搜索、过滤、权限、详情面板、数据持久化。
- 小图优先使用 `dot`、`layer`、`radial`。
- 大图优先使用 `grid` 或业务自定义布局。
- 主题优先通过 CSS 变量实现。
- 复杂节点建议后续扩展为外部 `renderNode` 钩子。
- 需要保存用户拖拽位置时，监听 `topo:node-drag`。
