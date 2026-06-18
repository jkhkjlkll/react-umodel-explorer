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
| Query `.entity_set` | Partial | Supports `__list_method__`, `list_data_set`, `get_logs`, and `get_metrics` plan-mode responses for linked MetricSet/LogSet storage metadata. |
| Query `.topo` | Expanded subset | Supports `getDirectRelations([...])`, multi-hop `getNeighborNodes(...)`, relation filters, and controlled read-only `cypher(...)` relation rows. |
| Query `.runbook_set` | Expanded subset | Searches UModel `runbook_set` knowledge, automation, and step chunks with memory keyword scoring. |
| Query execute wrapper | Subset complete | Returns the Go-compatible `code/data/message/success` matrix shape; plan queries can return v1.1 top-level JSON through `?format=agent`. |
| AgentGateway REST | Expanded subset | Discovery, resource read, query tools, EntitySet templates, skills metadata, validate, and write tools are implemented; write tools are disabled by default. |
| MCP transport | Expanded subset | `/mcp` supports streamable HTTP JSON-RPC for initialize, ping, tools, resources, prompts, completion, and discovery; `/sse` + `/messages` provide HTTP+SSE compatibility; `apps/umodel-mcp-stdio` provides stdio JSON-RPC. |
| Skills | Subset complete | Bundles `skills/umodel-query` and `skills/umodel-rca` for Java backend query/RCA workflows. |
| GraphStore `memory` | Subset complete | In-memory UModel/entity/relation store. |
| GraphStore `file.memory` | Subset complete | Persists UModel/entity/relation snapshots to `graphstore-file-memory.json`. |
| GraphStore `local.ladybug` | Compatibility stub | Provider can be selected and reports unavailable with stable provider error until a Ladybug Java runtime adapter is added. |
| Search/vector/hybrid | Memory fallback | `keyword`, `vector`, `hyper`, and `hybrid` are accepted for `.runbook_set` and semantic entity search, using memory keyword fallback. |
| Full schema validation | Expanded partial | Covers core Java sample and link dependency checks; full generated schema parity is still pending. |
