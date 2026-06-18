# `.umodel` — 模型目录

`.umodel` 是对象图的地图：实体类型、数据集、storage binding、links 和 runbooks。
在假设 domain、name、fields 或 telemetry mapping 之前，先读它。

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | sort name | limit 20"}'
```

MCP 等价调用：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": {
      "query": ".umodel with(kind='entity_set') | project domain,name,kind | sort name | limit 20"
    }
  }
}
```

## 常用 Kind

- `entity_set`：`.entity` 读取的运行时对象类型，也是 `.entity_set | entity-call`
  的方法所属对象。
- `metric_set`、`log_set`、`event_set`、`trace_set`、`profile_set`：telemetry 或 event
  数据集。
- `data_link`：把 EntitySet 字段映射到 dataset 字段。
- `storage_link`：把 dataset 字段映射到 storage labels 或 fields。
- `prometheus`、`aliyun_prometheus`、`elasticsearch`、`sls_logstore` 等 storage kind：
  可执行计划使用的 endpoint/config metadata。
- `entity_set_link`：实体类型之间的模型级关系定义。
- `runbook_set`：由 `.runbook_set` 搜索的 operational knowledge、observations、
  actions、automations 和 skills。

Java quickstart 包含：

- `devops/devops.service`
- `k8s/k8s.workload`
- `devops/devops.metric.service`
- `devops/devops.log.service`
- `devops/devops.service.ops`

## 返回格式

行内容是模型元素元数据：

```jsonc
{
  "id": "devops/entity_set/devops.service",
  "kind": "entity_set",
  "domain": "devops",
  "name": "devops.service",
  "spec": { "...": "..." },
  "metadata": {}
}
```

REST 会把这些行包装成 `data.header` 和 `data.data`；MCP 也会在
`structuredContent.output.rows` 中暴露同一逻辑结果。

## 获取单个元素完整定义

读取 runbook：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''runbook_set'\'', domain='\''devops'\'', name='\''devops.service.ops'\'')"}'
```

读取 storage links：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''storage_link'\'') | project domain,name,spec"}'
```

读取 data links：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''data_link'\'') | project domain,name,spec"}'
```

请求 agent plan endpoint 时使用 `include=spec`；普通 `.umodel` 查询里，除非被
`project` 排除，否则 `spec` 列本来就可用。

## `.umodel` 如何连接其他查询面

`entity_set` 行里的 `domain` + `name` 正是这些查询要传入的值：

```text
.entity with(domain='devops', name='devops.service')
.entity_set with(domain='devops', name='devops.service') | entity-call ...
```

`metric_set` 或 `log_set` 行里的 `domain` + `name` 还不够。要知道某个具体实体类型适用
哪个 dataset，请调用：

```text
.entity_set with(domain='devops', name='devops.service') | entity-call list_data_set(['metric_set','log_set'], true)
```

这样返回的是 scoped dataset，以及 `data_link` 和 `storage_link` detail，避免误用
workspace 中存在但与目标实体无关的 metric/log dataset。

## 模型驱动的遥测计划

Telemetry plan 由四类模型元素组装：

1. 源 `entity_set`，例如 `devops.service`。
2. 关联的 `metric_set` 或 `log_set`。
3. 把 entity fields 映射到 dataset fields 的 `data_link`。
4. 把 dataset fields 映射到 storage labels/fields 的 `storage_link`。

当生成的计划看起来不符合预期时，检查这些元素：

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')\"}"
```

响应中的 `data_source` block 会指回用于构造查询计划的具体模型元素。

## 常见坑

- `.umodel with(kind='metric_set')` 是目录查询，不是 entity-scoped dataset lookup。
  scoped telemetry 请使用 `list_data_set`。
- `project domain,name` 会去掉 `spec`；只有在确实不需要完整定义时才把它 project 掉。
- links 是模型定义，不是运行时拓扑行。运行时关系使用 `.topo`。
- AgentGateway resources 只放元数据；行数据通过 Query Service 读取。
