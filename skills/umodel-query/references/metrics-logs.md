# `get_metrics` / `get_logs` — 先读计划，再执行

在 Java 后端中，`get_metrics` 和 `get_logs` 返回可执行查询计划。除非后续接入真实
telemetry data provider，否则它们不会直接获取 Prometheus 或 Elasticsearch 数据。

模型图会替你限定查询范围：entity id 会通过 `data_link.fields_mapping` 和
`storage_link.fields_mapping` 映射成 storage labels 或 fields。先读取生成的计划，再决定
如何查询 Prometheus 或 Elasticsearch；不要一开始就手写 PromQL 或 ES filter。

## 1. 找到实体

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment"}'
```

Java quickstart 中的 service id 是：

```text
10000000000000000000000000000101
```

## 2. 发现相关数据集

询问 EntitySet 关联了哪些 metric/log 数据集：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

quickstart 中的相关数据集是：

- `devops/devops.metric.service`
- `devops/devops.log.service`

## 3. 获取指标计划

需要标准 query matrix wrapper 时，使用默认 assistant format：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

在该格式下，外层行 `responseType = 1`，计划 JSON 字符串位于 `query` 列。

需要直接拿到 plan 时，使用 agent format：

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

逻辑计划形状如下：

```jsonc
{
  "mode": "plan",
  "version": "v1.1",
  "operation": "get_metrics",
  "next_action": "execute_query",
  "source_query": "<the SPL you ran>",
  "data_source": {
    "data_set": { "ref": "devops/devops.metric.service", "kind": "metric_set" },
    "storage": { "ref": "devops/devops.prometheus.core", "type": "prometheus" },
    "data_link": { "ref": "devops/devops.service_related_to_devops.metric.service", "kind": "data_link" },
    "storage_link": { "ref": "devops/devops.metric.service_to_prometheus", "kind": "storage_link" }
  },
  "params_echo": {
    "domain": "devops",
    "name": "devops.metric.service",
    "metric": "latency_p99_ms",
    "step": "30s"
  },
  "query": {
    "dialect": "prometheus_promql",
    "endpoint": "http://localhost:9090",
    "query_type": "range",
    "step": "30s",
    "metrics": [
      {
        "name": "latency_p99_ms",
        "unit": "ms",
        "query_mode": "range",
        "generator": "histogram_quantile(...)"
      }
    ],
    "label_matchers": [
      { "label": "service_id", "operator": "=", "value": "10000000000000000000000000000101" }
    ],
    "limit": 0
  }
}
```

按 `query.dialect` 分派执行。对 `prometheus_promql`，读取：

- `query.endpoint`：Prometheus base URL。
- `query.metrics[].generator`：MetricSet 中的 PromQL template 或 generator expression。
- `query.label_matchers`：由模型映射生成的 storage label filters。
- `query.query_type`：`range` 或 `instant`。
- `query.step`：range query step。

如果 generator 已经包含 label matcher placeholder，就按模型包生成逻辑执行。如果 generator
是模板，则在查询 Prometheus 前替换 label matcher 值。

示例执行形态：

```bash
PROMQL='histogram_quantile(0.99, sum(rate(request_duration_bucket{service_id="10000000000000000000000000000101"}[5m])) by (le))'
curl -sG http://YOUR-PROMETHEUS:9090/api/v1/query \
  --data-urlencode "query=$PROMQL"
```

range query 使用 `/api/v1/query_range`，并传入 `start`、`end` 和 `step`。

## 4. 获取日志计划

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

逻辑 log plan 形状如下：

```jsonc
{
  "mode": "plan",
  "operation": "get_logs",
  "query": {
    "dialect": "elasticsearch_dsl",
    "endpoint": "http://localhost:9200",
    "index": "devops-service-logs-*",
    "filters": [
      { "label": "svc_id", "operator": "=", "value": "10000000000000000000000000000101" },
      { "label": "severity", "operator": "=", "value": "ERROR" }
    ],
    "query": "severity = \"ERROR\"",
    "limit": 0
  }
}
```

对 `elasticsearch_dsl`，读取：

- `query.endpoint`：Elasticsearch base URL。
- `query.index`：目标 index pattern。
- `query.filters`：用于 bool filter 的模型生成过滤条件。
- `query.query`：原始 query text，用于追踪。

示例执行形态：

```bash
curl -s http://YOUR-ES:9200/devops-service-logs-*/_search \
  -H 'Content-Type: application/json' \
  -d '{
    "size": 100,
    "query": {
      "bool": {
        "filter": [
          { "term": { "svc_id": "10000000000000000000000000000101" } },
          { "term": { "severity": "ERROR" } }
        ]
      }
    },
    "sort": [{ "@timestamp": { "order": "desc" } }]
  }'
```

根据真实 index mapping 调整 timestamp 字段名。

## MCP 用法

MCP 使用同一条 SPL：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": {
      "query": ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')",
      "format": "agent",
      "include_spec": true
    }
  }
}
```

Java MCP response 包含：

- `content[0].text`：用于 prompt context 的 TOON 文本。
- `structuredContent.name`：tool name。
- `structuredContent.ok`：成功标记。
- `structuredContent.output`：JSON query result 或 plan。

程序化执行优先使用 `structuredContent.output`。

## 执行规则

- 不要根据计划编造 metric 值。必须把 Prometheus 或 Elasticsearch 查询拿到用户的
  telemetry backend 执行。
- quickstart 中的 endpoint 只是本地占位，除非环境里真的在那些地址运行 Prometheus 或
  Elasticsearch。
- auth、tenant、TLS 设置从环境传入。不要把 secret 写进查询或文档。
- telemetry 调用保持只读。
- 如果用户想要 PaaS-style `mode='data'`，确认服务已配置 telemetry data provider；
  Java 默认 provider 未配置时会返回稳定的 provider unavailable。

## 排查

- 出现 `metric_set storage not found` 或 `log_set storage not found` 时，检查
  `.umodel with(kind='storage_link')`。
- matcher 缺失时，用 `?format=agent&include=spec` 检查 `data_link.fields_mapping`
  和 `storage_link.fields_mapping`。
- Prometheus 或 Elasticsearch 没有返回行时，确认真实 storage labels/fields 是否匹配
  生成的 matcher 名称，例如 `service_id`、`svc_id`、`severity` 等。
