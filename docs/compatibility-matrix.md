# Compatibility Matrix

The Java backend is currently a subset-compatible implementation track.

| Area | Status | Notes |
|---|---|---|
| Service index and health | Subset complete | `/` and `/healthz` are implemented. |
| Workspace CRUD | Subset complete | In-memory metadata, OpenAPI-shaped fields. |
| UModel validate | Expanded partial | Checks required `kind`, `domain`, `name`, EntitySet fields, MetricSet metrics, LogSet index, RunbookSet content, storage endpoints, link endpoints, and `fields_mapping`. |
| UModel import | Subset complete | Supports inline elements, built-in sample data, and path-based YAML/JSON file or directory import. |
| UModel put elements | Subset complete | Writes to GraphStore. |
| UModel delete elements | Subset complete | Deletes elements by stable id from GraphStore. |
| Entity writes | Subset complete | Required CMS 2.0 fields are checked. |
| Relation writes | Subset complete | Required CMS 2.0 fields are checked. |
| Entity/relation expire | Subset complete | Expire payloads remove stored entities or relations by stable id. |
| Query `.umodel` | Subset complete | Supports source, `with`, `project`, `sort`, `limit`. |
| Query `.entity` | Subset complete | Supports source, `with`, query text filter, `project`, `sort`, `limit`; semantic modes are accepted as memory keyword fallback. |
| Query `.entity_set` | Parity-oriented expanded subset | Supports `__list_method__`, `list_data_set`, `get_logs`, and `get_metrics` plan-mode responses for linked MetricSet/LogSet storage metadata. Metric plans now include Prometheus `api_prefix`, rendered `queries[].promql`, `label_matchers`, `raw_filters`, tenant/external label metadata, entity ids/query, and data filters. Log plans now include an Elasticsearch-style `body` with filters, sort, size, and `_source` mapping. |
| Query `.topo` | Expanded subset | Supports `getDirectRelations([...])`, multi-hop `getNeighborNodes(...)`, relation filters, and controlled read-only `cypher(...)` relation rows. |
| Query `.runbook_set` | Parity-oriented expanded subset | Searches UModel `runbook_set` `knowledge`, `observations`, `actions`, `automations`, `skills`, and `steps` chunks with memory keyword scoring; singular filters like `type='skill'` map to plural section names. |
| Query execute wrapper | Subset complete | Returns the Go-compatible `code/data/message/success` matrix shape; plan queries can return v1.1 top-level JSON through `?format=agent`. |
| AgentGateway REST | Expanded subset | Discovery, resource read, query tools, EntitySet templates, skills metadata, validate, and write tools are implemented; write tools are disabled by default. |
| MCP transport | Parity-oriented expanded subset | `/mcp` supports streamable HTTP JSON-RPC for initialize, ping, tools, resources, prompts, completion, and discovery; tool/resource text blocks use TOON, tool `structuredContent` uses `{name, ok, output}`, resource templates mirror upstream names plus Java `skills`, and prompt aliases keep existing Java clients working. |
| Skills | Parity-oriented adapted package | Bundles root-level `skills/README.md`, `skills/README.zh-CN.md`, `skills/QUICKSTART.md`, `skills/QUICKSTART.zh-CN.md`, `skills/umodel-query`, and `skills/umodel-rca`. The file layout now matches upstream agent-skill layout; content is Chinese and adapted to Java HTTP/MCP instead of Go `umctl`. Maven code remains under `modules/`. |
| GraphStore `memory` | Subset complete | In-memory UModel/entity/relation store. |
| GraphStore `file.memory` | Subset complete | Persists UModel/entity/relation snapshots to `graphstore-file-memory.json`. |
| GraphStore `local.ladybug` | Compatibility stub | Provider can be selected and reports unavailable with stable provider error until a Ladybug Java runtime adapter is added. |
| Search/vector/hybrid | Memory fallback | `keyword`, `vector`, `hyper`, and `hybrid` are accepted for `.runbook_set` and semantic entity search, using memory keyword fallback. |
| Full schema validation | Expanded partial | Covers core Java sample and link dependency checks; full generated schema parity is still pending. |

## Full 1:1 Parity Blockers

The Java backend is moving toward a 1:1 public-behavior replica, but the following gates still block a truthful "fully replicated" claim:

| Gate | Current Java state | Required for 1:1 |
|---|---|---|
| `local.ladybug` runtime | Compatibility stub that exposes capabilities and unavailable health/errors. | Java Ladybug runtime adapter with real UModel/entity/topology read-write behavior and conformance fixtures. |
| Search provider | In-memory keyword fallback for `keyword`, `vector`, `hyper`, and `hybrid`. | Provider abstraction, embedding path, vector search, hybrid RRF fusion, indexing on writes/deletes, and search health/capabilities parity. |
| Cypher | Controlled read-only relation-row fallback. | Full read-only Cypher engine behavior aligned with Go `internal/cypher`, including optional match, with/unwind, projection, path, aggregation, params, and conformance tests. |
| Telemetry `mode=data` | Rejected with `NotImplemented`; Java returns executable plans. | Real telemetry data execution provider or PaaS-compatible data endpoint that returns rows. |
| Generated schema validation | Handwritten expanded partial validation. | Generated schema loading/validation parity with upstream schema specs. |
| SDK/CLI/UI | Java backend server/MCP only. | CLI, SDK, UI, and fixture gates that exercise the same public contracts against Java. |
| Parity tests | Manual/API-oriented comparison. | Shared Go/Java fixture suite comparing response shape, stable fields, errors, MCP, AgentGateway, skills, and query output. |
