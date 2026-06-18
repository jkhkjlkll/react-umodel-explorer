# `.umodel` — model catalog

`.umodel` is the map of the object graph: entity types, datasets, storage
bindings, links, and runbooks. Read it before assuming domains, names, fields,
or telemetry mappings.

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | sort name | limit 20"}'
```

MCP equivalent:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "workspace": "demo",
    "name": "query_spl_execute",
    "arguments": {
      "query": ".umodel with(kind='entity_set') | project domain,name,kind | sort name | limit 20"
    }
  }
}
```

## Useful Kinds

- `entity_set`: runtime object types read by `.entity`, and method owners for
  `.entity_set | entity-call`.
- `metric_set`, `log_set`, `event_set`, `trace_set`, `profile_set`: telemetry or
  event datasets.
- `data_link`: maps EntitySet fields to dataset fields.
- `storage_link`: maps dataset fields to storage labels or fields.
- Storage kinds such as `prometheus`, `aliyun_prometheus`, `elasticsearch`, and
  `sls_logstore`: endpoint/config metadata for executable plans.
- `entity_set_link`: model-level relationship definition between entity types.
- `runbook_set`: operational knowledge, observations, actions, automations, and
  skills searched by `.runbook_set`.

The Java quickstart includes:

- `devops/devops.service`
- `k8s/k8s.workload`
- `devops/devops.metric.service`
- `devops/devops.log.service`
- `devops/devops.service.ops`

## Returned Format

Rows contain model element metadata:

```jsonc
{
  "id": "devops/entity_set/devops.service",
  "kind": "entity_set",
  "domain": "devops",
  "name": "devops.service",
  "spec": { "...": "..." },
  "metadata": {}
}
```

REST wraps those rows into `data.header` and `data.data`; MCP also exposes the
same logical result in `structuredContent.output.rows`.

## Fetch One Element In Full

Fetch a runbook:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''runbook_set'\'', domain='\''devops'\'', name='\''devops.service.ops'\'')"}'
```

Fetch storage links:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''storage_link'\'') | project domain,name,spec"}'
```

Fetch data links:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''data_link'\'') | project domain,name,spec"}'
```

Use `include=spec` when asking for agent plan endpoints; for plain `.umodel`
queries, the `spec` column is already available unless you project it out.

## How `.umodel` Connects Other Surfaces

The same `domain` + `name` from an `entity_set` row is what you pass to:

```text
.entity with(domain='devops', name='devops.service')
.entity_set with(domain='devops', name='devops.service') | entity-call ...
```

The `domain` + `name` from `metric_set` or `log_set` rows are not enough by
themselves. To know which dataset applies to a specific entity type, call:

```text
.entity_set with(domain='devops', name='devops.service') | entity-call list_data_set(['metric_set','log_set'], true)
```

That returns the scoped dataset plus `data_link` and `storage_link` details.
This avoids accidentally using a metric/log dataset that exists in the workspace
but is unrelated to the target entity.

## Model-Guided Telemetry Planning

Telemetry plans are assembled from four model elements:

1. The source `entity_set`, such as `devops.service`.
2. The related `metric_set` or `log_set`.
3. The `data_link` mapping entity fields to dataset fields.
4. The `storage_link` mapping dataset fields to storage labels/fields.

Inspect those elements when a generated plan looks surprising:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')\"}"
```

The `data_source` block in the response points back to the exact model elements
used to build the query plan.

## Pitfalls

- `.umodel with(kind='metric_set')` is a catalog query, not an entity-scoped
  dataset lookup. Use `list_data_set` for scoped telemetry.
- `project domain,name` removes `spec`; only project it away when you do not need
  full definitions.
- Links are model definitions, not runtime topology rows. Use `.topo` for
  runtime relations.
- AgentGateway resources are metadata-only; use Query Service for rows.
