# TopologyDataAdapter 实时接入适配器

`TopologyDataAdapter` 用于统一封装 WebSocket、SSE、polling 和手动输入，并把所有输入都转换为 `topology.realtime.v1` 协议消息。

它只负责连接、重连、协议标准化、校验、乱序丢弃和事件分发，不直接操作图实例。Graph Store 和批处理调度器应订阅它的事件，再决定如何更新 `NewTopoGraph`。

## 导入

```js
import {
  TOPOLOGY_DATA_TRANSPORTS,
  createTopologyDataAdapter
} from "./src/framework/index.js";
```

## 基础接口

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET,
  url: "wss://example.com/topology"
});

adapter.subscribe((event) => {
  console.log(event.type, event.status);
});

await adapter.connect();
```

公共方法：

| 方法 | 说明 |
| --- | --- |
| `connect()` | 建立连接或启动轮询 |
| `disconnect()` | 关闭连接并进入 `offline` |
| `reconnect()` | 主动重连 |
| `subscribe(listener)` | 订阅全部事件 |
| `subscribe(type, listener)` | 订阅指定事件 |
| `ingest(raw, context)` | 手动注入一条消息 |
| `getStatus()` | 获取连接、cursor 和统计信息 |

## 支持的 transport

```js
TOPOLOGY_DATA_TRANSPORTS.MANUAL
TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET
TOPOLOGY_DATA_TRANSPORTS.SSE
TOPOLOGY_DATA_TRANSPORTS.POLLING
```

### manual

适合 demo、测试或由宿主已有连接层转发消息。

```js
import {
  TOPOLOGY_DATA_TRANSPORTS,
  createRealtimeTopologySnapshot,
  createTopologyDataAdapter
} from "./src/framework/index.js";

const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.MANUAL,
  staleTimeoutMs: 0
});

adapter.subscribe("snapshot", ({ message }) => {
  console.log(message.payload.nodes);
});

await adapter.connect();

adapter.ingest(createRealtimeTopologySnapshot({
  version: 1,
  seq: 1,
  source: "demo",
  nodes,
  edges
}));
```

### WebSocket

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET,
  url: "wss://example.com/topology",
  autoReconnect: true,
  reconnectDelayMs: 1000,
  reconnectMaxDelayMs: 15000,
  staleTimeoutMs: 30000
});

await adapter.connect();
```

WebSocket 服务端应发送 `topology.realtime.v1` 消息，或由 `normalizeMessage` 转换成协议消息。

### SSE

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.SSE,
  url: "/api/topology/events"
});

await adapter.connect();
```

### polling

使用 URL：

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.POLLING,
  url: "/api/topology/poll",
  pollIntervalMs: 3000
});
```

使用自定义 fetcher：

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.POLLING,
  pollIntervalMs: 3000,
  fetcher({ cursor }) {
    return queryTopologySince(cursor);
  }
});
```

`fetcher` 可以返回：

- 单条协议消息。
- 协议消息数组。
- `{ messages: [] }`。
- `{ items: [] }`。

## 事件

导出常量 `TOPOLOGY_DATA_ADAPTER_EVENTS`：

| 事件 | 说明 |
| --- | --- |
| `status` | 状态变化 |
| `connected` | 进入 live 状态 |
| `reconnecting` | 正在重连 |
| `stale` | 超过 `staleTimeoutMs` 未收到新消息 |
| `offline` | 连接关闭或重连失败 |
| `message` | 接收到并接受一条有效消息 |
| `snapshot` | 接收到快照 |
| `patch` | 接收到节点、边或结构 patch |
| `dropped` | 消息被丢弃，通常是 invalid 或 stale |
| `error` | 连接错误或协议错误 |

事件对象示例：

```js
{
  type: "message",
  status: "live",
  timestamp: 1770000000000,
  message,
  cursor,
  validation,
  context,
  adapter
}
```

## 状态

导出常量 `TOPOLOGY_DATA_ADAPTER_STATUS`：

```js
"idle"
"connecting"
"live"
"reconnecting"
"stale"
"offline"
```

`getStatus()` 返回：

```js
{
  status,
  transport,
  url,
  cursor,
  connected,
  reconnectAttempts,
  lastMessageAt,
  lastError,
  messageCount,
  droppedMessages
}
```

## 自定义消息转换

如果后端不能直接输出 `topology.realtime.v1`，可以传入 `normalizeMessage`：

```js
const adapter = createTopologyDataAdapter({
  transport: TOPOLOGY_DATA_TRANSPORTS.WEBSOCKET,
  url: "wss://example.com/topology",
  normalizeMessage(raw) {
    return {
      protocol: "topology.realtime.v1",
      type: raw.kind,
      version: raw.topologyVersion,
      seq: raw.offset,
      serverTime: raw.time,
      source: "legacy-service",
      traceId: raw.requestId,
      payload: raw.body
    };
  }
});
```

## 推荐接入流程

```txt
TopologyDataAdapter
  -> protocol validate and stale-message guard
  -> Graph Store merge
  -> Batch Scheduler flush
  -> Graph API update
```

示例：

```js
adapter.subscribe("snapshot", ({ message }) => {
  graphStore.replace(message.payload);
});

adapter.subscribe("patch", ({ message }) => {
  graphStore.applyPatch(message);
});

adapter.subscribe("dropped", ({ reason, validation }) => {
  console.debug("drop topology message", reason, validation.errors);
});
```

## 约束

- Adapter 不应该直接调用 `setData()`。
- Adapter 不保存完整拓扑，只保存 cursor 和连接状态。
- Graph Store 负责权威状态和数据合并。
- 高频更新节流和背压由后续 Batch Scheduler 负责。
