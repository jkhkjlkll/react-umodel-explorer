# Metrics And Logs

`get_metrics` and `get_logs` return executable plans.

Metric plan as top-level agent JSON:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')\"}"
```

Log plan with expanded spec:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

Interpret plans by `query.dialect`:

- `prometheus_promql`: run `query.metrics[].generator`/planned metric details
  against the Prometheus endpoint from the plan.
- `elasticsearch_dsl`: run the query filters against the Elasticsearch endpoint
  and index from the plan.

If the user asks for actual telemetry values, execute the returned plan against
their telemetry backend. Do not invent values from the plan.
