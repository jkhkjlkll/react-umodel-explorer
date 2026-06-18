# `.entity_set | entity-call` — call EntitySet methods

`.entity_set with(domain=..., name=..., ids=[...])` selects an EntitySet and
optionally binds the call to one or more runtime entities by `__entity_id__`.
`| entity-call <method>(...)` invokes a model-defined method on that EntitySet.

In the Java backend this surface is used for method discovery, dataset
discovery, and telemetry query planning.

## Discover Methods First

Do not guess signatures. Ask the EntitySet for its method list:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

The Java backend exposes:

- `__list_method__()` — returns the method table.
- `list_data_set(data_set_types?, detail?)` — returns datasets related to the
  EntitySet. Pass `['metric_set','log_set']` to focus on telemetry datasets.
  `detail=true` adds field mappings, fields, storage info, and link details.
- `get_metrics(domain, name, metric?, query?, query_type?, step?, aggregate?,
  storage_domain?, storage_name?, storage_kind?)` — returns a metric query plan.
- `get_logs(domain, name, query?, storage_domain?, storage_name?,
  storage_kind?)` — returns a log query plan.

Aliases are accepted for compatibility: `list_dataset`, `get_metric`, and
`get_log` normalize to the method names above.

## Returned Format

Entity-call methods return a wrapped table through the same REST matrix wrapper.
The outer header is:

```jsonc
["responseType", "query", "header", "data"]
```

Read it as:

- `responseType = 2`: table method. The inner table header is in the outer
  `header` column, and inner rows are in the outer `data` column.
- `responseType = 1`: plan method. The plan JSON string is in the outer `query`
  column. Use `?format=agent` if you want the plan as top-level JSON instead.

For MCP clients, prefer:

```jsonc
result.structuredContent.output.rows
result.structuredContent.output.columns
```

The MCP text block is TOON for compact prompt context.

## Method Discovery Example

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

The inner method rows include `params` and `returns` as JSON strings. Parse them
before calling a method; they contain each argument name, type, required flag,
description, and default value.

## Dataset Discovery Example

List metric and log datasets attached to `devops.service`:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

The inner header is:

```jsonc
[
  "data_set_id",
  "data_set_type",
  "domain",
  "name",
  "fields_mapping",
  "filterable_fields",
  "data_set_fields",
  "storage_info",
  "storage_link_info",
  "data_link_detail",
  "data_set_detail",
  "storage_detail",
  "storage_link_detail"
]
```

Use the returned dataset `domain` and `name` as arguments to `get_metrics` or
`get_logs`. Do not scan `.umodel with(kind='metric_set')` and guess; that lists
all datasets in the workspace, not just datasets related to your entity type.

## Metric And Log Plans

Default assistant format wraps the plan as a JSON string in the outer `query`
column:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

Agent format returns the plan directly:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

For plan interpretation and execution, see
[metrics-logs.md](metrics-logs.md).

## Argument Rules

- Positional and named arguments both work, but do not provide the same argument
  twice.
- Required arguments are validated by the Java parser.
- `ids=[...]` belongs in the `.entity_set with(...)` clause; it is used to map
  entity fields into storage labels or fields through `data_link` and
  `storage_link`.
- `query='field = "value"'` inside `get_logs` or `get_metrics` is parsed as a
  simple equality filter and mapped through the storage link when possible.

## Pitfalls

- `get_metrics` and `get_logs` return plans, not telemetry rows, in the open
  Java backend.
- `list_data_set(..., true)` is the safest way to inspect mapping details before
  explaining why a plan contains a given label matcher.
- Use `?format=agent&include=spec` when an agent needs unfolded storage/link
  context.
