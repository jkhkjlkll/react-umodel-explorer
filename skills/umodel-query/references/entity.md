# `.entity` — read runtime entities

`.entity` reads runtime objects from the Java backend EntityStore / GraphStore:
services, workloads, pods, config items, incidents, or any other EntitySet-backed
object. A read returns the entity system fields plus the fields stored on that
entity.

Use HTTP REST first:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment | limit 20"}'
```

Use MCP when an MCP client is attached:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": {
      "query": ".entity with(domain='devops', name='devops.service', query='checkout') | project __entity_id__,display_name,environment | limit 20"
    }
  }
}
```

## Parameters

- `domain=` and `name=` identify the EntitySet. Discover values with
  `.umodel with(kind='entity_set')`; in the Java quickstart, use
  `domain='devops', name='devops.service'` or `domain='k8s', name='k8s.workload'`.
- `query='...'` performs memory keyword search across stored entity fields.
  `mode='keyword'`, `mode='vector'`, `mode='hyper'`, and `mode='hybrid'` are
  accepted by the Java backend, but currently use the same memory keyword
  fallback unless a real search provider is wired.
- `topk=N` or `limit N` caps returned rows. `topk` is useful inside `with(...)`;
  `limit` is the regular pipe operator.
- `ids=['<entity-id>', ...]` reads specific runtime entities by stable
  `__entity_id__`.

Pipes are optional. Add them when you need to shape output:

```text
| project field_a,field_b
| where environment='prod'
| sort display_name
| limit 20
```

The Java parser intentionally supports a focused SPL subset: simple equality
`where`, single-field `sort`, comma-separated `project`, and integer `limit`.

## Returned Format

REST `/api/v1/query/{workspace}/execute` returns the Go-compatible matrix wrapper:

```jsonc
{
  "code": "200",
  "data": {
    "header": ["__entity_id__", "display_name", "environment"],
    "data": [["10000000000000000000000000000101", "Checkout Service", "prod"]]
  },
  "message": "successful",
  "success": true
}
```

Zip `data.header` with each item in `data.data` to read records.

MCP `tools/call` returns a text block encoded as TOON plus JSON
`structuredContent`. For programmatic clients, prefer:

```jsonc
result.structuredContent.output.rows
result.structuredContent.output.columns
```

## Important Fields

- `__domain__`: model domain for the runtime entity.
- `__entity_type__`: EntitySet name, for example `devops.service`.
- `__entity_id__`: stable handle reused in `.topo` graph calls and
  `.entity_set ... ids=[...]` method calls.
- `__first_observed_time__` and `__last_observed_time__`: runtime observation
  timestamps where available.
- `__deleted__`: deletion marker where a provider exposes one.

Entity-specific fields follow those system fields. In the Java quickstart,
`devops.service` has `id`, `name`, `display_name`, and `environment`.

## Worked Java Quickstart Example

Find the checkout service:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment"}'
```

Expected logical row:

```jsonc
{
  "__entity_id__": "10000000000000000000000000000101",
  "display_name": "Checkout Service",
  "environment": "prod"
}
```

Reuse that `__entity_id__` for topology:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

And for EntitySet methods:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

## Pitfalls

- Do not guess `domain` and `name`; use `.umodel with(kind='entity_set')`.
- Do not use display names as graph handles. Use `__entity_id__`.
- Do not assume semantic ranking is real vector search in this Java backend yet;
  vector/hyper/hybrid modes are accepted as memory keyword fallback.
- Keep runtime reads behind Query Service. AgentGateway resources are
  metadata-only and should not be treated as data APIs.
