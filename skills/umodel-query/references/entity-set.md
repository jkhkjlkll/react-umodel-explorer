# `.entity_set | entity-call` — 调用 EntitySet 方法

`.entity_set with(domain=..., name=..., ids=[...])` 选择一个 EntitySet，并可选择用
`__entity_id__` 绑定一个或多个运行时实体。`| entity-call <method>(...)` 会调用该
EntitySet 上的模型方法。

在 Java 后端中，这个查询面用于方法发现、数据集发现和 telemetry 查询计划生成。

## 先发现方法

不要猜方法签名。先查询 EntitySet 的方法列表：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

Java 后端暴露：

- `__list_method__()`：返回方法表。
- `list_data_set(data_set_types?, detail?)`：返回与 EntitySet 关联的数据集。传入
  `['metric_set','log_set']` 可以聚焦 telemetry 数据集。`detail=true` 会返回字段映射、
  字段、storage info 和 link detail。
- `get_metrics(domain, name, metric?, query?, query_type?, step?, aggregate?,
  storage_domain?, storage_name?, storage_kind?)`：返回 metric 查询计划。
- `get_logs(domain, name, query?, storage_domain?, storage_name?, storage_kind?)`：
  返回 log 查询计划。

为了兼容，也接受别名：`list_dataset`、`get_metric` 和 `get_log` 会规范化为上面的方法名。

## 返回格式

Entity-call 方法通过同一个 REST matrix wrapper 返回一层包装表。外层 header 是：

```jsonc
["responseType", "query", "header", "data"]
```

读取方式：

- `responseType = 2`：表格方法。内层表头在外层 `header` 列，内层行在外层 `data` 列。
- `responseType = 1`：计划方法。计划 JSON 字符串在外层 `query` 列。需要顶层 JSON
  plan 时使用 `?format=agent`。

MCP client 优先读取：

```jsonc
result.structuredContent.output.rows
result.structuredContent.output.columns
```

MCP text block 是 TOON，适合放进 prompt context。

## 方法发现示例

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

内层方法行里的 `params` 和 `returns` 是 JSON 字符串。调用方法前先解析它们；里面有每个
参数的名称、类型、是否必填、描述和默认值。

## 数据集发现示例

列出 `devops.service` 关联的 metric 和 log 数据集：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

内层 header 是：

```jsonc
[
  "data_set_id",
  "data_set_type",
  "domain",
  "name",
  "fields_mapping",
  "filterable_fields",
  "data_set_fields",
  "storage_info",
  "storage_link_info",
  "data_link_detail",
  "data_set_detail",
  "storage_detail",
  "storage_link_detail"
]
```

用返回的数据集 `domain` 和 `name` 作为 `get_metrics` 或 `get_logs` 参数。不要扫描
`.umodel with(kind='metric_set')` 后凭感觉选择；那会列出 workspace 中所有数据集，而不只
是当前实体类型关联的数据集。

## 指标和日志计划

默认 assistant format 会把计划作为 JSON 字符串放在外层 `query` 列：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

Agent format 直接返回 plan：

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

计划解释和执行方式见 [metrics-logs.md](metrics-logs.md)。

## 参数规则

- 支持位置参数和命名参数，但不要重复提供同一个参数。
- Java parser 会校验必填参数。
- `ids=[...]` 属于 `.entity_set with(...)` 子句；它会通过 `data_link` 和 `storage_link`
  把实体字段映射成 storage labels 或 fields。
- `get_logs` 或 `get_metrics` 内的 `query='field = "value"'` 会被解析成简单等值过滤，
  并在可能时通过 storage link 映射。

## 常见坑

- 在 open Java 后端中，`get_metrics` 和 `get_logs` 返回计划，不返回 telemetry 行。
- 解释计划里为什么出现某个 label matcher 前，最好先用 `list_data_set(..., true)`
  查看 mapping details。
- agent 需要展开 storage/link context 时，使用 `?format=agent&include=spec`。
