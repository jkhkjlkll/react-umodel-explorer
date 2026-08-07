# Compatibility Matrix

The Java backend is currently a subset-compatible implementation track.

| Area | Status | Notes |
|---|---|---|
| Service index and health | Subset complete | `/` and `/healthz` are implemented. |
| Workspace CRUD | Subset complete | In-memory metadata, OpenAPI-shaped fields. |
| UModel validate | Expanded partial | Checks required `kind`, `domain`, `name`, EntitySet fields, MetricSet metrics, LogSet index, RunbookSet content, storage endpoints, link endpoints, `fields_mapping`, list-style field `name/type`, metric item names, and DataLink/StorageLink endpoint kind constraints. |
| UModel import | Subset complete | Supports inline elements, built-in sample data, and path-based YAML/JSON file or directory import. |
| UModel put elements | Subset complete | Writes to GraphStore. |
| UModel delete elements | Subset complete | Deletes elements by stable id from GraphStore. |
| Entity writes | Subset complete | Required CMS 2.0 fields are checked. |
| Relation writes | Subset complete | Required CMS 2.0 fields are checked. |
| Entity/relation expire | Subset complete | Expire payloads remove stored entities or relations by stable id. |
| Query `.umodel` | Subset complete | Supports source, `with`, `project`, `sort`, `limit`. |
| Query `.entity` | Parity-oriented expanded subset | Supports source, `with`, query text filter, `project`, `sort`, `limit`; `keyword`, `vector`, `hyper`, and `hybrid` route through `SearchService`. The bundled memory provider uses keyword/token-overlap scoring plus RRF for hybrid mode. |
| Query `.entity_set` | Parity-oriented expanded subset | Supports `__list_method__`, `list_data_set`, `get_logs`, and `get_metrics` plan-mode responses for linked MetricSet/LogSet storage metadata. Metric plans now include Prometheus `api_prefix`, rendered `queries[].promql`, `label_matchers`, `raw_filters`, tenant/external label metadata, entity ids/query, and data filters. Log plans now include an Elasticsearch-style `body` with filters, sort, size, and `_source` mapping. |
| Query `mode=data` | Provider boundary complete | `get_logs` and `get_metrics` can execute through `TelemetryService`; `umodel.telemetry.provider=http` enables HTTP execution for Prometheus/Elasticsearch-style plans. The default provider is unavailable and returns a stable provider error. |
| Query `.topo` | Expanded subset | Supports `getDirectRelations([...])`, multi-hop `getNeighborNodes(...)`, relation filters, and controlled read-only `cypher(...)` relation rows. |
| Query `.runbook_set` | Parity-oriented expanded subset | Searches UModel `runbook_set` `knowledge`, `observations`, `actions`, `automations`, `skills`, and `steps` chunks with memory keyword scoring; singular filters like `type='skill'` map to plural section names. |
| Query execute wrapper | Subset complete | Returns the Go-compatible `code/data/message/success` matrix shape; plan queries can return v1.1 top-level JSON through `?format=agent`. |
| AgentGateway REST | Expanded subset | Discovery, resource read, query tools, EntitySet templates, skills metadata, validate, and write tools are implemented; write tools are disabled by default. |
| MCP transport | Parity-oriented expanded subset | `/mcp` supports streamable HTTP JSON-RPC for initialize, ping, tools, resources, prompts, completion, and discovery; tool/resource text blocks use TOON, tool `structuredContent` uses `{name, ok, output}`, resource templates mirror upstream names plus Java `skills`, and prompt aliases keep existing Java clients working. |
| Skills | Parity-oriented adapted package | Bundles root-level `skills/README.md`, `skills/README.zh-CN.md`, `skills/QUICKSTART.md`, `skills/QUICKSTART.zh-CN.md`, `skills/umodel-query`, and `skills/umodel-rca`. The file layout now matches upstream agent-skill layout; content is Chinese and adapted to Java HTTP/MCP instead of Go `umctl`. Maven code remains under `modules/`. |
| GraphStore `memory` | Subset complete | In-memory UModel/entity/relation store. |
| GraphStore `file.memory` | Subset complete | Persists UModel/entity/relation snapshots to `graphstore-file-memory.json`. |
| GraphStore `local.ladybug` | Compatibility stub | Provider can be selected and reports unavailable with stable provider error until a Ladybug Java runtime adapter is added. |
| Search/vector/hybrid | Provider abstraction complete | `SearchService` exposes keyword/vector/hybrid, health, capabilities, indexing, and delete hooks. UModel and entity writes update the index. The memory provider supports keyword scoring, deterministic token-overlap vector search, and hybrid RRF fusion; external ANN/embedding providers remain pluggable work. |
| Full schema validation | Expanded partial | Covers core Java sample, field/metric shape checks, link dependency checks, and DataLink/StorageLink endpoint kind checks; full generated schema parity is still pending. |
| Java model SDK | Complete for public SDK baseline | `umodel-model-sdk` exposes all 23 standard kind types, JSON/YAML auto-detection, v0-to-v1 compatibility, round-trip serialization, extensible type registration, stable validation errors, and link endpoint helpers. Field-level generated classes remain part of the generated-schema parity gate. |
| Java service client | Complete for current OpenAPI surface | `umodel-service-client` covers workspace, UModel, EntityStore, sample, Query Service, and AgentGateway REST paths with timeouts, headers/Bearer auth, typed standard responses, agent-plan responses, and structured errors. |

## Full 1:1 Parity Blockers

The Java backend is moving toward a 1:1 public-behavior replica, but the following gates still block a truthful "fully replicated" claim:

| Gate | Current Java state | Required for 1:1 |
|---|---|---|
| `local.ladybug` runtime | Compatibility stub that exposes capabilities and unavailable health/errors. | Java Ladybug runtime adapter with real UModel/entity/topology read-write behavior and conformance fixtures. |
| Search provider | Provider abstraction, memory vector/token-overlap provider, hybrid RRF, write/delete indexing, health, capabilities, and Java query parity tests are in place. | External ANN/embedding provider conformance fixtures for production-grade vector ranking. |
| Cypher | Controlled read-only relation-row fallback. | Full read-only Cypher engine behavior aligned with Go `internal/cypher`, including optional match, with/unwind, projection, path, aggregation, params, and conformance tests. |
| Telemetry `mode=data` | Provider boundary and HTTP execution provider are in place for `get_logs`/`get_metrics`; default runtime stays unavailable until configured. | PaaS-compatible endpoint conformance fixtures and production credentials/configuration. |
| Generated schema validation | Handwritten expanded partial validation. | Generated schema loading/validation parity with upstream schema specs. |
| CLI/UI | Java backend now includes model and REST client SDKs, but no Java CLI or dedicated UI. | CLI/UI support and shared fixtures that exercise the same public contracts against Java. |
| SDK conformance | Model and service-client unit contract tests are present. | Shared Go/Java fixtures against both running services and field-level generated schema parity. |
| Parity tests | Java Query parity tests cover telemetry plan shape, SearchService-backed runbook skill search, and configured `mode=data` execution. | Shared Go/Java fixture suite comparing response shape, stable fields, errors, MCP, AgentGateway, skills, and query output. |
