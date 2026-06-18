# `.entity` — 读取运行时实体

`.entity` 从 Java 后端 EntityStore / GraphStore 读取运行时对象：service、workload、
pod、config item、incident，或任何由 EntitySet 定义的对象。查询结果包含实体系统字段
和该实体自身字段。

优先使用 HTTP REST：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment | limit 20"}'
```

接入 MCP client 时使用 MCP：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": {
      "query": ".entity with(domain='devops', name='devops.service', query='checkout') | project __entity_id__,display_name,environment | limit 20"
    }
  }
}
```

## 参数

- `domain=` 和 `name=` 标识 EntitySet。用 `.umodel with(kind='entity_set')` 发现可用值。
  Java quickstart 中可用 `domain='devops', name='devops.service'` 或
  `domain='k8s', name='k8s.workload'`。
- `query='...'` 会对已存储实体字段做内存 keyword 搜索。Java 后端接受
  `mode='keyword'`、`mode='vector'`、`mode='hyper'` 和 `mode='hybrid'`，但在接入真实
  search provider 前都使用同一套内存 keyword fallback。
- `topk=N` 或 `limit N` 限制返回行数。`topk` 适合放在 `with(...)` 中，`limit` 是常规
  pipe operator。
- `ids=['<entity-id>', ...]` 按稳定 `__entity_id__` 读取指定运行时实体。

Pipe 是可选的。需要调整输出时再追加：

```text
| project field_a,field_b
| where environment='prod'
| sort display_name
| limit 20
```

Java parser 支持一个聚焦的 SPL 子集：简单等值 `where`、单字段 `sort`、逗号分隔
`project` 和整数 `limit`。

## 返回格式

REST `/api/v1/query/{workspace}/execute` 返回 Go 兼容的 matrix wrapper：

```jsonc
{
  "code": "200",
  "data": {
    "header": ["__entity_id__", "display_name", "environment"],
    "data": [["10000000000000000000000000000101", "Checkout Service", "prod"]]
  },
  "message": "successful",
  "success": true
}
```

把 `data.header` 和 `data.data` 中每一行 zip 起来即可得到记录对象。

MCP `tools/call` 返回 TOON 编码的 text block，同时保留 JSON `structuredContent`。
程序化 client 优先读取：

```jsonc
result.structuredContent.output.rows
result.structuredContent.output.columns
```

## 重要字段

- `__domain__`：运行时实体的模型 domain。
- `__entity_type__`：EntitySet 名称，例如 `devops.service`。
- `__entity_id__`：稳定句柄，会在 `.topo` graph-call 和 `.entity_set ... ids=[...]`
  方法调用中复用。
- `__first_observed_time__` 和 `__last_observed_time__`：provider 可用时的运行时观测时间。
- `__deleted__`：provider 暴露时的删除标记。

系统字段后面是实体自身字段。Java quickstart 中，`devops.service` 有 `id`、`name`、
`display_name` 和 `environment`。

## Java 快速开始示例

查找 checkout service：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment"}'
```

预期逻辑行：

```jsonc
{
  "__entity_id__": "10000000000000000000000000000101",
  "display_name": "Checkout Service",
  "environment": "prod"
}
```

把这个 `__entity_id__` 复用于拓扑：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

也可以复用于 EntitySet 方法：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

## 常见坑

- 不要猜 `domain` 和 `name`；先用 `.umodel with(kind='entity_set')` 查询。
- 不要用 display name 作为 graph handle；用 `__entity_id__`。
- 不要假设 Java 后端已经是真实 vector search；当前 vector/hyper/hybrid 都是内存
  keyword fallback。
- 运行时数据读取必须走 Query Service。AgentGateway resources 只提供元数据，不是数据 API。
