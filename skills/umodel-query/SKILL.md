---
name: umodel-query
description: >-
  通过 HTTP REST 或 MCP 查询 UModel Java 21 + Spring Boot 后端。适用于 Codex
  需要从 `umodel-java` 子项目读取 UModel 模型元数据、运行时实体、拓扑、Runbook、
  EntitySet 方法、metric 查询计划或 log 查询计划的场景。触发词：UModel Java,
  umodel-java, .umodel, .entity, .entity_set, .topo, .runbook_set,
  query_spl_execute, get_metrics, get_logs, Java backend topology,
  Java backend skills, 查询 Java 版 UModel, 查实体, 查拓扑, 查指标, 查日志,
  查 runbook.
---

# UModel Java 查询

把 Java 后端作为 UModel 对象图语义层的读取入口。Java 服务通过 Spring Boot
暴露相同的公共查询源：`.umodel`、`.entity`、`.entity_set`、`.topo` 和
`.runbook_set`。

这是上游 CLI-first UModel skills 的 HTTP/MCP-first Java 适配版本；在 Java
后端已经支持的公共行为上，保持相同的 agent-facing read model。

## 启动

在 `umodel-java` 目录启动 Java 后端：

```bash
mvn spring-boot:run -pl apps/umodel-server -am
curl -X POST http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

没有 MCP client 时，优先使用 REST：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | limit 20"}'
```

有 MCP client 时，使用 MCP：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": { "query": ".umodel | limit 20" }
  }
}
```

把这段 JSON POST 到 `http://localhost:8080/mcp`。Java 服务也提供
HTTP+SSE 兼容入口：`GET /sse` 和 `POST /messages`。

## 查询面

只加载当前任务需要的 reference：

- 读取模型定义和数据集目录：`references/model.md`。
- 读取运行时实体：`references/entity.md`。
- 遍历拓扑和受控 Cypher：`references/topology.md`。
- 发现和调用 EntitySet 方法：`references/entity-set.md`。
- 读取 metric/log 可执行计划：`references/metrics-logs.md`。
- 搜索 runbook：`references/runbook.md`。

## 规则

- 除非用户明确要求写入，否则保持只读。
- 运行时行数据必须通过 Query Service 读取；AgentGateway resources 只放元数据。
- 对 metric/log 值，`get_metrics` 和 `get_logs` 返回可执行计划，不直接返回后端数据行。
  如果用户要求真实 telemetry 值，再拿计划去查询 Prometheus 或 Elasticsearch。
- Java 后端接受 `mode='vector'`、`mode='hyper'`、`mode='hybrid'`，但在接入真实搜索
  provider 前，这些模式都走内存 keyword fallback。
- `.runbook_set` 搜索 `knowledge`、`observations`、`actions`、`automations`、
  `skills` 和 Java 兼容的 `steps`；`type='skill'` 这类单数过滤会被视为复数
  section 名称的别名。
- `local.ladybug` 在此 Java 子项目里只是外部 provider 边界；除非真正接入
  Ladybug Java runtime adapter，否则不要声称 Java 后端已经有真实 Ladybug 实现。
