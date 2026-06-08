# Compatibility Matrix

The Java backend is currently a subset-compatible implementation track.

| Area | Status | Notes |
|---|---|---|
| Service index and health | Subset complete | `/` and `/healthz` are implemented. |
| Workspace CRUD | Subset complete | In-memory metadata, OpenAPI-shaped fields. |
| UModel validate | Subset complete | Required `kind`, `domain`, and `name` checks. |
| UModel import | Partial | Supports inline elements and built-in sample data; path-based YAML/JSON import is planned. |
| UModel put elements | Subset complete | Writes to GraphStore. |
| UModel delete elements | Placeholder | Returns not-implemented item results. |
| Entity writes | Subset complete | Required CMS 2.0 fields are checked. |
| Relation writes | Subset complete | Required CMS 2.0 fields are checked. |
| Entity/relation expire | Partial | Emits expire payloads; stable-key parsing is planned. |
| Query `.umodel` | Subset complete | Supports source, `with`, `project`, `sort`, `limit`. |
| Query `.entity` | Subset complete | Supports source, `with`, query text filter, `project`, `sort`, `limit`. |
| Query `.topo` | Partial | Returns relation rows; graph-call payload is captured but not fully interpreted. |
| Query execute wrapper | Subset complete | Returns the Go-compatible `code/data/message/success` matrix shape. |
| AgentGateway REST | Subset complete | Discovery, resource read, and query tools are implemented. |
| MCP transport | Planned | Schema is copied under `compat/mcp`. |
| GraphStore `memory` | Subset complete | In-memory UModel/entity/relation store. |
| GraphStore `file.memory` | Placeholder | Provider exists; JSON persistence is planned. |
| GraphStore `local.ladybug` | Planned | Currently rejected as unavailable. |
| Search/vector/hybrid | Planned | Not implemented. |
| Full schema validation | Planned | Required-field validation only. |

