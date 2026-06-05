# 实时拓扑数据协议

本文档定义 OpenTopoX 的实时拓扑消息契约。`TopologyDataAdapter`、Graph Store、批处理调度器和布局版本控制都基于该协议实现。

框架已在 `src/framework/RealtimeTopologyProtocol.js` 提供协议常量、消息创建器、校验器和顺序判断工具。

## 设计目标

- 区分快照、节点轻量更新、边轻量更新和拓扑结构更新。
- 每条消息携带版本、序号、时间、来源和追踪信息。
- 支持乱序消息丢弃。
- 支持断线重连后的快照校准。
- 支持线上问题回放和诊断。

## Envelope

所有实时消息都使用同一层 envelope：

```js
{
  protocol: "topology.realtime.v1",
  type: "snapshot",
  version: 12,
  seq: 128,
  serverTime: "2026-05-16T14:00:00.000Z",
  source: "observability-api",
  traceId: "observability-api:12:128",
  payload: {},
  meta: {}
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `protocol` | 是 | 当前固定为 `topology.realtime.v1` |
| `type` | 是 | 消息类型 |
| `version` | 是 | 拓扑版本，可为数字或非空字符串 |
| `seq` | 是 | 单连接或单数据源内递增序号 |
| `serverTime` | 是 | 服务端发送时间，建议 ISO 字符串 |
| `source` | 是 | 数据来源 |
| `traceId` | 建议 | 排障和回放标识 |
| `payload` | 是 | 类型相关载荷 |
| `meta` | 否 | 额外诊断信息 |

## 消息类型

框架导出 `REALTIME_TOPOLOGY_MESSAGE_TYPES`：

```js
{
  SNAPSHOT: "snapshot",
  NODE_PATCH: "nodePatch",
  EDGE_PATCH: "edgePatch",
  TOPOLOGY_PATCH: "topologyPatch"
}
```

### `snapshot`

完整拓扑快照，用于首次加载、断线恢复或服务端要求重置本地状态。

```js
{
  protocol: "topology.realtime.v1",
  type: "snapshot",
  version: 12,
  seq: 1,
  serverTime: "2026-05-16T14:00:00.000Z",
  source: "observability-api",
  traceId: "observability-api:12:1",
  payload: {
    mode: "replace",
    nodes: [],
    edges: []
  }
}
```

使用创建器：

```js
import { createRealtimeTopologySnapshot } from "./src/framework/index.js";

const message = createRealtimeTopologySnapshot({
  version: 12,
  seq: 1,
  source: "observability-api",
  nodes,
  edges
});
```

### `nodePatch`

节点轻量更新。适合状态、指标、标题、标签等不需要重新布局的变化。

```js
{
  type: "nodePatch",
  version: 12,
  seq: 2,
  serverTime: "2026-05-16T14:00:01.000Z",
  source: "observability-api",
  traceId: "observability-api:12:2",
  payload: {
    patches: [
      {
        id: "service-a",
        data: {
          status: "critical",
          metric: { label: "error", value: "12%" }
        }
      }
    ]
  }
}
```

使用创建器：

```js
import { createRealtimeNodePatch } from "./src/framework/index.js";

const message = createRealtimeNodePatch({
  version: 12,
  seq: 2,
  source: "observability-api",
  patches: [
    {
      id: "service-a",
      data: {
        status: "critical",
        metric: { label: "error", value: "12%" }
      }
    }
  ]
});
```

### `edgePatch`

边轻量更新。适合链路状态、延迟、流量、标签等变化。

```js
{
  type: "edgePatch",
  version: 12,
  seq: 3,
  serverTime: "2026-05-16T14:00:02.000Z",
  source: "observability-api",
  traceId: "observability-api:12:3",
  payload: {
    patches: [
      {
        id: "edge-service-db",
        data: {
          status: "warn",
          latency: "180ms",
          traffic: "42 rps"
        }
      }
    ]
  }
}
```

### `topologyPatch`

拓扑结构更新。适合节点和边的新增、删除、重连或结构性属性变化。

```js
{
  type: "topologyPatch",
  version: 13,
  seq: 4,
  serverTime: "2026-05-16T14:00:03.000Z",
  source: "observability-api",
  traceId: "observability-api:13:4",
  payload: {
    addNodes: [],
    updateNodes: [],
    removeNodeIds: [],
    addEdges: [],
    updateEdges: [],
    removeEdgeIds: []
  }
}
```

结构变化通常会触发布局或局部布局，因此不应和普通指标更新混在同一个轻量 patch 中。

## 校验

使用 `validateRealtimeTopologyMessage()`：

```js
import { validateRealtimeTopologyMessage } from "./src/framework/index.js";

const result = validateRealtimeTopologyMessage(message);

if (!result.valid) {
  console.warn(result.errors);
}
```

校验内容：

- 协议版本。
- 消息类型。
- `version`。
- `seq`。
- `serverTime`。
- `source`。
- `payload` 结构。
- `traceId` 诊断提醒。

如果希望强制要求 `traceId`：

```js
validateRealtimeTopologyMessage(message, { requireTraceId: true });
```

## 顺序判断

使用 `shouldAcceptRealtimeTopologyMessage()` 对乱序消息做第一层拦截：

```js
import {
  createRealtimeTopologyCursor,
  shouldAcceptRealtimeTopologyMessage
} from "./src/framework/index.js";

let cursor = null;

function handleMessage(raw) {
  const decision = shouldAcceptRealtimeTopologyMessage(raw, cursor);
  if (!decision.accept) return;

  cursor = decision.cursor;
  applyMessage(decision.validation.message);
}
```

判断规则：

1. 先校验消息。
2. 如果没有本地 cursor，则接受第一条有效消息。
3. 优先比较 `version`。
4. `version` 相同时比较 `seq`。
5. 小于或等于当前 cursor 的消息视为 stale。

也可以手动生成 cursor：

```js
cursor = createRealtimeTopologyCursor(message);
```

## 推荐处理流程

```txt
Realtime Transport
  -> normalizeRealtimeTopologyMessage()
  -> validateRealtimeTopologyMessage()
  -> shouldAcceptRealtimeTopologyMessage()
  -> Graph Store merge
  -> Batch Scheduler flush
  -> Graph API update
```

## 与图 API 的关系

推荐映射：

| 消息类型 | 推荐图更新方式 |
| --- | --- |
| `snapshot` | `setData()` |
| `nodePatch` | `updateNodeData()` 或后续 `patchGraphData()` |
| `edgePatch` | 后续 `updateEdgeData()` 或 `patchGraphData()` |
| `topologyPatch` | store 合并后调用 `setData()` 或局部布局 API |

## 约束

- 实时消息不应直接调用图实例。
- Adapter 只负责连接和收消息。
- Graph Store 负责校验、排序、合并和输出。
- Batch Scheduler 负责节流、合并和背压。
- 图框架只消费稳定后的视图数据。

## 已接入适配器

`TopologyDataAdapter` 已基于该协议实现，统一封装 WebSocket、SSE、polling 和手动输入，并产出标准协议消息。使用说明见 `docs/topology-data-adapter.md`。
