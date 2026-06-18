---
name: umodel-rca
description: >-
  使用 UModel Java 后端执行模型驱动的故障调查。适用于诊断 degraded service、
  调查告警、解释延迟/错误、或基于 `umodel-java` Query Service、拓扑、runbook
  和 metric/log plan 做根因分析。依赖 `umodel-query` skill。触发词：RCA,
  root cause, incident, alert, degraded service, Java backend RCA,
  payment/checkout slow, 根因分析, 故障排查, 告警定位, 为什么慢.
---

# UModel Java RCA

通过 Java 后端的对象图调查故障。请同时加载 `umodel-query`；本 skill 在查询能力
之上补充 RCA 循环。

## 启动

启动 Java 后端并导入样例：

```bash
mvn spring-boot:run -pl apps/umodel-server -am
curl -X POST http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

使用 REST 或 MCP `query_spl_execute`。除非用户明确要求写入，否则 remediation 保持只读。

## RCA 循环

1. 定位：找到有症状的实体。
2. 发现：列出 EntitySet 方法和相关数据集。
3. 表征：获取 `get_metrics` 和 `get_logs` 计划。
4. 遍历：用 `.topo` 检查直接关系和邻居。
5. 检索：用 `.runbook_set` 获取 runbook context，必要时包括 `knowledge`、
   `observations`、`actions`、`automations` 和 `skills`。
6. 关联：把实体状态、关系方向、telemetry 计划和 runbook knowledge 对齐。
7. 结论：给出根因、证据链、置信度和可逆建议。

## Java 快速开始查询

查找服务：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment"}'
```

发现数据集：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

生成 metric 查询计划：

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

生成 log 查询计划：

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

遍历拓扑：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

搜索 runbook：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5)"}'
```

## 输出格式

```text
Diagnosis:
Symptom: <退化对象和判断依据>
Evidence chain: <entity -> telemetry plan -> topology -> runbook>
Root cause: <机制，不只是相关事件>
Ruled out: <排除项和理由>
Confidence: <high|medium|low>
Recommended action: <只读建议或需要确认的操作>
```

不要从计划里编造 metric 值。如果用户需要真实值，请把返回的 Prometheus 或
Elasticsearch 计划拿到配置好的 telemetry backend 执行。

Runbook `actions`、`automations` 和 `skills` 默认只是 RCA context。除非用户明确确认，
不要执行 remediation 或 write-capable tools。
