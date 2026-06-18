---
name: umodel-query
description: >-
  Query a UModel Java 21 + Spring Boot backend through HTTP REST or MCP. Use
  when Codex needs to read UModel model metadata, runtime entities, topology,
  runbooks, EntitySet methods, metric query plans, or log query plans from the
  `umodel-java` subproject. Triggers: UModel Java, umodel-java, .umodel,
  .entity, .entity_set, .topo, .runbook_set, query_spl_execute, get_metrics,
  get_logs, Java backend topology, Java backend skills, 查询 Java 版 UModel,
  查实体, 查拓扑, 查指标, 查日志, 查 runbook.
---

# UModel Java Query

Use the Java backend as the read path for UModel's object graph semantic layer.
The Java service exposes the same public query sources through Spring Boot:
`.umodel`, `.entity`, `.entity_set`, `.topo`, and `.runbook_set`.

## Setup

Start the Java backend from the `umodel-java` directory:

```bash
mvn spring-boot:run -pl apps/umodel-server -am
curl -X POST http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

Use REST first when no MCP client is configured:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | limit 20"}'
```

Use MCP when available:

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

POST that JSON to `http://localhost:8080/mcp`. The Java service also exposes
HTTP+SSE compatibility at `GET /sse` and `POST /messages`.

## Query Surfaces

Load only the reference needed for the task:

- Read model definitions and dataset catalogs: `references/model.md`.
- Read runtime entities: `references/entity.md`.
- Traverse topology and controlled Cypher: `references/topology.md`.
- Discover and call EntitySet methods: `references/entity-set.md`.
- Read metric/log executable plans: `references/metrics-logs.md`.
- Search runbooks: `references/runbook.md`.

## Rules

- Stay read-only unless the user explicitly asks to write.
- Use Query Service for runtime rows; AgentGateway resources are metadata-only.
- For metric/log values, `get_metrics` and `get_logs` return executable plans,
  not backend data rows. Run those plans against Prometheus or Elasticsearch if
  the user asks for actual telemetry values.
- `mode='vector'`, `mode='hyper'`, and `mode='hybrid'` are accepted by the Java
  backend as memory keyword fallback unless a real search provider is added.
- `local.ladybug` is an external-provider boundary in this Java subproject; do
  not claim the Java backend has a real Ladybug implementation unless one is
  added.
