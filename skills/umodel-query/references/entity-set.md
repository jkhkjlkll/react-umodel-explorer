# EntitySet Methods

Use `.entity_set | entity-call` to discover datasets and build telemetry plans.

List methods:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

List datasets:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

Supported methods:

- `__list_method__()`
- `list_data_set(types?, detail?)`
- `get_metrics(domain, name, metric?, query?, query_type?, step?)`
- `get_logs(domain, name, query?)`
