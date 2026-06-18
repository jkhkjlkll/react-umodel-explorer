# UModel Java Backend Compatibility Plan

## Goal

Build an independent JDK 21 backend that can fully replace the current Go
service over time. Replacement is defined by public behavior, not mechanical
source translation.

The Java service must preserve:

- REST contract shape from `compat/openapi/openapi.yaml`.
- Query Service as the only public read path.
- Public query sources: `.umodel`, `.entity`, and `.topo`.
- Java extension query sources now also include `.entity_set` and `.runbook_set`
  to match newer AgentGateway workflows.
- Workspace-scoped operations.
- GraphStore provider abstraction.
- AgentGateway metadata-oriented resources and query-oriented tools.

## Compatibility Source

Use these inputs as the compatibility authority:

1. `compat/openapi/openapi.yaml` for REST shape.
2. `compat/mcp/tools.schema.json` for agent and MCP tools.
3. Go `pkg/model` semantics for DTO field meaning.
4. Go `pkg/contract` service boundaries.
5. Query Service documentation and examples.
6. Quickstart sample behavior.

## Milestones

### M1: Bootable Service

- Spring Boot app starts on port 8080.
- `/` and `/healthz` expose service and GraphStore health.
- Workspace CRUD works in memory.
- Stable error envelope exists.

### M2: Write Path

- `memory` GraphStore stores UModel elements, entities, and relations.
- `file.memory` provider persists the same logical snapshot to JSON.
- UModel validation enforces required `kind`, `domain`, `name`, basic `entity_set` fields, and link endpoints.
- EntityStore validates the required CMS 2.0 runtime fields.

### M3: Query Subset

Supported SPL subset:

```text
.umodel with(kind='entity_set') | project domain,name,kind | sort name | limit 20
.entity with(domain='devops', name='devops.service', query=$query) | limit 20
.entity_set with(domain='devops', name='devops.service') | entity-call __list_method__()
.entity_set with(domain='devops', name='devops.service') | entity-call list_data_set(['metric_set', 'log_set'], true)
.entity_set with(domain='devops', name='devops.service', ids=['...']) | entity-call get_logs('devops', 'devops.log.service', query='level = "ERROR"')
.entity_set with(domain='devops', name='devops.service', ids=['...']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')
.topo | graph-call getDirectRelations(...) | limit 20
.topo | graph-call getNeighborNodes(...) | limit 20
.runbook_set with(domain='apm', type='knowledge', query='slow request', mode='hyper', topk=5)
.runbook_set with(domain='apm', type='skills', query='rca', topk=5)
```

Initial parser requirements:

- Source detection for `.umodel`, `.entity_set`, `.entity`, `.topo`, `.runbook_set`.
- `with(...)` filters with string, number, boolean, and `$parameter` values.
- `project` comma-separated fields.
- `sort` single field.
- `limit` integer.
- `graph-call` payload captured for topology dispatch.
- `entity-call` payload captured for EntitySet method planning.
- `format=agent` returns a top-level v1.1 JSON plan for `get_logs` and `get_metrics`; `include=spec` expands folded references.

### M4: AgentGateway REST

- Discovery endpoint returns tools, resources, and next actions.
- Resource read returns metadata and query templates only.
- Query tools call Query Service.
- `umodel_validate` calls UModel validation.
- Write tools call UModel and EntityStore services when explicitly enabled.

### M5: HTTP MCP Subset

- `/mcp` accepts JSON-RPC requests over HTTP.
- `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, and `discovery` are implemented.
- Tool calls reuse AgentGateway tools.
- Write tools stay disabled by default through the same `UMODEL_AGENT_WRITE_ENABLED` switch.

### M5.5: Enhanced Agent/MCP/Skill Surface

- `/mcp` also covers resource templates, prompts, completion, and
  `umodel/discovery`.
- MCP tool/resource text payloads use TOON. Tool `structuredContent` mirrors
  `{name, ok, output}`; resource templates expose `overview`, `schema-index`,
  `query-templates`, `tool-capability-metadata`, and the Java `skills`
  resource.
- Prompt parity includes upstream `umodel_query_context` and
  `umodel_object_graph_review`; existing Java `query` and `context` prompt names
  remain aliases.
- Completion supports MCP `ref` and `argument.value` payloads, with legacy
  simple-string completion kept for existing Java clients.
- `/sse` and `/messages` provide HTTP+SSE compatibility for MCP clients that
  still use the legacy transport split.
- `apps/umodel-mcp-stdio` provides a line-delimited JSON-RPC stdio wrapper
  backed by the same services and tools.
- `skills/umodel-query` and `skills/umodel-rca` document Java backend query and
  incident workflows for Codex-style skill clients.
- AgentGateway exposes bundled skill metadata as a read-only resource.

### M6: Compatibility Fixtures

- Reuse one quickstart fixture against both Go and Java services.
- Compare JSON shape, stable fields, error codes, and core row values.
- Keep differences documented in `docs/compatibility-matrix.md`.

### M7: Current Enhanced Replacement Scope

- Schema validation is expanded for core Java model pack shapes, including
  EntitySet, MetricSet, LogSet, RunbookSet, storage endpoints, link endpoints,
  and `fields_mapping`.
- Query and topology graph calls are expanded with multi-hop
  `getNeighborNodes`, direct relation filtering, and a controlled read-only
  `cypher(...)` fallback for relation rows.
- `.runbook_set` executes against in-memory UModel `runbook_set` definitions and
  indexes upstream-aligned sections: `knowledge`, `observations`, `actions`,
  `automations`, and `skills`; Java also accepts `steps` for backward
  compatibility with earlier sample data.
- `get_metrics` and `get_logs` now emit richer upstream-aligned plan payloads:
  Prometheus plans include rendered PromQL, `api_prefix`, label matchers,
  raw filters, tenant/external label metadata, entity ids/query, and data
  filters; Elasticsearch plans include a runnable DSL-style body with bool
  filters, sort, size, and mapped output fields.
- The Java skill package now has the same root-level skill document layout as
  upstream: `README.md`, `README.zh-CN.md`, `QUICKSTART.md`,
  `QUICKSTART.zh-CN.md`, `umodel-query`, and `umodel-rca`. The Markdown content
  is Chinese and Java HTTP/MCP-oriented.
- `modules/query` has initial Java-side parity tests for telemetry plan fields,
  `.runbook_set` skill search, and the explicit `mode=data` unsupported boundary.
- `keyword`, `vector`, `hyper`, and `hybrid` search modes are accepted as memory
  keyword fallback until a real search provider is configured.
- MCP stdio and HTTP+SSE transports are present.
- `local.ladybug` is present as a compatibility stub with stable health and
  provider-unavailable errors.

### M8: Remaining Full-Parity Gates

- Replace memory keyword fallback with a real vector/hybrid search provider.
- Replace `local.ladybug` stub with a Java Ladybug runtime adapter.
- Expand controlled Cypher fallback into full provider-backed Cypher parity or
  port the upstream read-only Cypher engine semantics to Java.
- Add `mode=data` telemetry execution provider parity for real metric/log rows.
- Replace handwritten schema checks with generated schema validation parity.
- Add SDK and CLI compatibility gates.
- Expand the initial Java Query tests into shared fixture-based Go/Java parity
  tests for REST, AgentGateway, MCP, skills, and query outputs.

## Non-Goals For The First Subset

- Real `local.ladybug` execution without a Ladybug Java adapter.
- Full Cypher engine compatibility beyond controlled read-only relation rows.
- Real vector and hybrid search ranking beyond memory keyword fallback.
- Generated SDK regeneration.

## Design Constraints

- Do not add domain-specific read APIs outside Query Service.
- Keep GraphStore provider code out of application services.
- Keep AgentGateway resources metadata-only.
- Model runtime rows must be returned by Query Service or tools that call Query
  Service.
- Keep DTOs permissive where the Go model allows flexible maps.
