# UModel Java Backend Compatibility Plan

## Goal

Build an independent JDK 21 backend that can fully replace the current Go
service over time. Replacement is defined by public behavior, not mechanical
source translation.

The Java service must preserve:

- REST contract shape from `compat/openapi/openapi.yaml`.
- Query Service as the only public read path.
- Public query sources: `.umodel`, `.entity`, and `.topo`.
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
.topo | graph-call getDirectRelations(...) | limit 20
.topo | graph-call getNeighborNodes(...) | limit 20
```

Initial parser requirements:

- Source detection for `.umodel`, `.entity`, `.topo`.
- `with(...)` filters with string, number, boolean, and `$parameter` values.
- `project` comma-separated fields.
- `sort` single field.
- `limit` integer.
- `graph-call` payload captured for topology dispatch.

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

### M6: Compatibility Fixtures

- Reuse one quickstart fixture against both Go and Java services.
- Compare JSON shape, stable fields, error codes, and core row values.
- Keep differences documented in `docs/compatibility-matrix.md`.

### M7: Complete Replacement

- Expand schema validation.
- Expand Query and topology graph calls.
- Add MCP stdio and SSE transports.
- Expand HTTP MCP coverage to the complete method set.
- Add search/vector/hybrid modes when provider support exists.
- Add SDK and CLI compatibility gates.

## Non-Goals For The First Subset

- `local.ladybug`.
- Full Cypher compatibility.
- Full MCP stdio/SSE transport.
- Full schema spec validation.
- Vector and hybrid search.
- Generated SDK regeneration.

## Design Constraints

- Do not add domain-specific read APIs outside Query Service.
- Keep GraphStore provider code out of application services.
- Keep AgentGateway resources metadata-only.
- Model runtime rows must be returned by Query Service or tools that call Query
  Service.
- Keep DTOs permissive where the Go model allows flexible maps.
