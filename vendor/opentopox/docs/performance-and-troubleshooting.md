# 性能阈值与故障排查

本文档给应用开发者一个上线前的性能基线、排查路径和实时更新 API 使用示例。

## 推荐阈值

| 场景 | 建议阈值 | 说明 |
| --- | --- | --- |
| 首屏 500 节点 / 1x 边 | 1.5s 内完成首屏渲染 | 使用示例页和 `benchmark:topology` 记录本机基线 |
| 1000 节点 / 1x 边 | 自动开启性能模式前后都应可交互 | 边标签可降级关闭 |
| 3000 节点 / 3x 边 | 优先保证拖拽、缩放和 patch 不阻塞 | 建议关闭动画和边标签 |
| 10Hz 指标更新 | P95 patch 小于 16ms | 只更新节点/边 `data`，避免触发布局 |
| 1Hz 结构变更 | P95 patch 小于 50ms | 小批量增删用 light structure patch |
| 长任务 | 单次交互不应持续出现 50ms+ 长任务 | 浏览器基准会输出 long task 计数 |

阈值是默认建议，不是硬编码断言。业务侧应结合设备、浏览器、数据规模和页面复杂度设定自己的发布门槛。

## 基准命令

Node 核心路径：

```sh
npm run benchmark:topology
```

浏览器大图验证页：

```sh
npm run serve
```

然后打开 <http://127.0.0.1:5177/examples/performance-large-graph/>。该页面默认生成 5,000 个节点和 10,000 条关系，提供 Pan Test、Patch Test、Fit 和 Minimap 控制，也可在控制台调用：

```js
await window.__opentopoxPerf.runFullValidation();
window.__opentopoxPerf.getSummary();
```

Node 基准用于验证布局、数据层和调度器核心路径；浏览器页面用于验证首屏渲染、增量 patch、鼠标拖拽/视口移动和长帧计数。

## 通用交互优化

以下优化不是大图专用，在几十到几百节点的低数量级场景也默认生效：

- 节点、关系、父子关系会维护运行时索引，避免点击、聚焦、拖动和 patch 时反复线性查找。
- 节点拖动和轻量 patch 只更新受影响节点及关联关系，避免重绘无关边。
- hover 和 selection 使用前后状态 diff 更新 class，避免每次交互扫描全部 DOM。
- `fitView({ nodes })`、框选 connected 边和 `handleFocusNode()` 走索引/邻接路径，避免嵌套查找或每一跳扫描全量边。
- minimap 在视口移动时只更新 viewport 框，只有数据或布局变化时才重建静态内容。

Canvas 边层、交互期隐藏边层和性能模式下跳过节点尺寸测量属于大图降载策略，由对应阈值或性能模式控制。

## Graph Store 设计

`TopologyGraphStore` 是实时链路的权威数据层，不直接操作 DOM。

职责：

- 保存当前 `nodes` 和 `edges`。
- 应用 `snapshot` 替换全量数据。
- 应用 `nodePatch`、`edgePatch` 和 `topologyPatch`。
- 用版本和序号避免旧消息覆盖新状态。
- 通过 `validateGraphData()` 过滤破坏性数据。
- 输出 `getData()` 给 `NewTopoGraph.setData()`。

推荐链路：

```js
const store = createTopologyGraphStore();
const scheduler = createTopologyUpdateScheduler({
  graph: topo,
  store,
  flushIntervalMs: 160,
});

scheduler.bindAdapter(adapter);
```

这样做的好处是：连接层、数据层、批处理层、渲染层各自独立，断线重连和乱序消息不会直接污染图实例。

## Patch API 示例

只更新指标和状态：

```js
graph.patchGraphData({
  nodePatches: [{
    id: "service-a",
    data: {
      status: "warn",
      metric: { label: "P95", value: "186 ms" },
    },
  }],
}, {
  preserveViewport: true,
  autoFit: false,
});
```

更新边指标：

```js
graph.patchGraphData({
  edgePatches: [{
    id: "service-a-db",
    data: {
      status: "critical",
      latency: "420 ms",
    },
  }],
});
```

小规模结构变更：

```js
graph.patchGraphData({
  addedNodes: [{
    id: "canary-a",
    type: "cardNode",
    data: {
      title: "Canary",
      status: "ok",
      metric: { label: "RPS", value: "120" },
    },
  }],
  addedEdges: [{
    id: "service-a-canary-a",
    source: "service-a",
    target: "canary-a",
    label: "shadow",
  }],
}, {
  preserveViewport: true,
  autoFit: false,
});
```

需要完整重排时再使用：

```js
await graph.setData({
  nodes,
  edges,
  clearStatus: true,
  preserveViewport: false,
  autoFit: true,
});
```

## 常见问题

### 高频更新后视口跳动

检查 `TopologyUpdateScheduler` 或 `patchGraphData()` 是否传入：

```js
{
  preserveViewport: true,
  autoFit: false,
  silentSelection: true,
}
```

### 指标更新导致布局重算

优先使用 `nodePatches` 和 `edgePatches`，不要为纯指标变化调用 `setData()`。

### 边标签太多导致卡顿

设置：

```js
new NewTopoGraph({
  config: {
    performanceEdgeLabelLimit: 80,
    autoPerformanceMode: true,
  },
});
```

大图下框架会自动关闭过量边标签。

### 大图拖动画布时 SVG 边绘制压力过高

性能模式下，大图边默认会切到 Canvas 边层，避免为 10k 级关系常驻创建大量 SVG DOM。视口移动和节点拖拽期间也会临时隐藏边层，停止移动后自动恢复，以保证拖拽/平移优先达到交互帧率。可按需调整：

```js
new NewTopoGraph({
  config: {
    canvasEdges: true,
    canvasEdgeThreshold: 2000,
    hideEdgesOnViewportMove: true,
    viewportInteractionSettleMs: 220,
  },
});
```

如果业务必须保留 SVG 边 DOM 或自定义 SVG 边交互，可关闭 Canvas 边层，或调高切换阈值：

```js
new NewTopoGraph({
  config: {
    canvasEdges: false,
    // 或 canvasEdgeThreshold: 8000,
    hideEdgesOnViewportMove: false,
  },
});
```

Canvas 模式下关系仍会绘制在节点之间，但 `.topo-edge` SVG 元素数量会降为 0；这是预期行为，适合只需要展示连线、不依赖单条 SVG 边 DOM 事件的大图场景。

### 消息乱序或旧数据覆盖新数据

确保后端输出稳定的：

- `version`
- `seq`
- `serverTime`
- `source`

`TopologyDataAdapter` 会根据 cursor 丢弃 stale 消息。

### 断线后恢复慢

检查：

- `reconnectDelayMs`
- `reconnectMaxDelayMs`
- `maxReconnectAttempts`
- 服务端是否支持按 cursor 补数据

恢复后建议服务端先发 `snapshot`，再继续发 patch。

### 自定义节点出现 XSS 风险

参考 [security-guidelines.md](./security-guidelines.md)，不要把未可信字段直接拼进 HTML。

## 发布前验收

推荐合并前至少保留最近一次结果：

- `npm run check`
- `npm run benchmark:topology`
- `npm_config_cache=.cache/npm npm pack --dry-run`

如项目后续补充浏览器或视觉回归脚本，其输出也应作为 PR 评论或发布记录保存。
