# 实时拓扑运行时链路

本文档说明实时拓扑运行时的推荐组合方式：

```txt
TopologyDataAdapter
  -> TopologyGraphStore
  -> TopologyUpdateScheduler
  -> NewTopoGraph getGraph() API
```

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `RealtimeTopologyProtocol` | 定义 `snapshot`、`nodePatch`、`edgePatch`、`topologyPatch` 协议与顺序判断 |
| `TopologyDataAdapter` | 统一 WebSocket/SSE/polling/manual 输入，输出有效协议消息 |
| `TopologyGraphStore` | 维护权威 `nodeMap`/`edgeMap`，合并快照和 patch，保留最后可用拓扑 |
| `TopologyUpdateScheduler` | 批处理高频消息，合并同 ID 更新，执行背压，驱动图 API |
| `NewTopoGraph` | 提供 `setData()`、`patchGraphData()`、`updateNodeData()`、`updateEdgeData()` 等渲染 API |

## 推荐接入

```js
import {
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyDataAdapter,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
} from "./src/framework/index.js";

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

## 更新路径

| 消息类型 | Store 行为 | Graph 行为 |
| --- | --- | --- |
| `snapshot` | 替换权威图数据 | `setData({ preserveViewport: true, autoFit: false })` |
| `nodePatch` | 合并节点 data/patch | `patchGraphData({ nodePatches })` |
| `edgePatch` | 合并边 data/patch | `patchGraphData({ edgePatches })` |
| `topologyPatch` | 应用节点/边增删改 | `setData({ preserveViewport: true, autoFit: false })` |

## 状态与指标

`adapter.getStatus()`：

- `status`
- `messageLag`
- `messageRate`
- `messageCount`
- `droppedMessages`
- `lastMessageAt`

`store.getSnapshot()`：

- `connectionStatus`
- `currentGraphVersion`
- `nodeCount`
- `edgeCount`
- `lastErrors`

`scheduler.getMetrics()`：

- `queueSize`
- `flushDuration`
- `flushedBatches`
- `droppedUpdates`
- `lastFlushAt`

`topo.getGraph().getRenderStats()`：

- `durationMs`
- `patchDurationMs`
- `layoutVersion`
- `nodes`
- `edges`

## 视口稳定

实时链路默认使用：

```js
{
  preserveViewport: true,
  autoFit: false,
  silentSelection: true,
  disableAnimate: true
}
```

首次加载、用户手动点击 fit、切换数据集、聚焦实体、恢复全量拓扑时，再显式使用自动适配视图。
