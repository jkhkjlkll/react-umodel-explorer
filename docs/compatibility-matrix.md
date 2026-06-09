# Compatibility Matrix

The Java backend is currently a subset-compatible implementation track.

| Area | Status | Notes |
|---|---|---|
| Service index and health | Subset complete | `/` and `/healthz` are implemented. |
| Workspace CRUD | Subset complete | In-memory metadata, OpenAPI-shaped fields. |
| UModel validate | Partial | Checks required `kind`, `domain`, `name`, `entity_set` fields, and basic link endpoints. |
| UModel import | Subset complete | Supports inline elements, built-in sample data, and path-based YAML/JSON file or directory import. |
| UModel put elements | Subset complete | Writes to GraphStore. |
| UModel delete elements | Subset complete | Deletes elements by stable id from GraphStore. |
| Entity writes | Subset complete | Required CMS 2.0 fields are checked. |
| Relation writes | Subset complete | Required CMS 2.0 fields are checked. |
| Entity/relation expire | Subset complete | Expire payloads remove stored entities or relations by stable id. |
| Query `.umodel` | Subset complete | Supports source, `with`, `project`, `sort`, `limit`. |
| Query `.entity` | Subset complete | Supports source, `with`, query text filter, `project`, `sort`, `limit`. |
| Query `.topo` | Subset complete | Supports `getDirectRelations([...])` and `getNeighborNodes([...])` row shapes. |
| Query execute wrapper | Subset complete | Returns the Go-compatible `code/data/message/success` matrix shape. |
| AgentGateway REST | Subset complete | Discovery, resource read, query tools, validate, and write tools are implemented; write tools are disabled by default. |
| MCP transport | Partial | `/mcp` supports streamable HTTP JSON-RPC subset for initialize, ping, tools, resources, and discovery. |
| GraphStore `memory` | Subset complete | In-memory UModel/entity/relation store. |
| GraphStore `file.memory` | Subset complete | Persists UModel/entity/relation snapshots to `graphstore-file-memory.json`. |
| GraphStore `local.ladybug` | Planned | Currently rejected as unavailable. |
| Search/vector/hybrid | Planned | Not implemented. |
| Full schema validation | Partial | Full UModel schema and dependency validation are not implemented yet. |
