# Model Catalog

Read UModel definitions with `.umodel`.

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | sort name | limit 20"}'
```

Useful kinds:

- `entity_set`: runtime object types that `.entity` reads.
- `metric_set`, `log_set`, `event_set`, `trace_set`, `profile_set`: datasets.
- `data_link`: maps entity fields to dataset fields.
- `storage_link`: maps dataset fields to storage labels or fields.
- `runbook_set`: operational knowledge searched by `.runbook_set`.

Fetch full spec for one element:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''runbook_set'\'', domain='\''devops'\'', name='\''devops.service.ops'\'')"}'
```
