---
name: umodel-rca
description: >-
  Run model-guided incident investigation with the UModel Java backend. Use
  when asked to diagnose a degraded service, investigate an alert, explain
  latency/errors, or perform root-cause analysis using `umodel-java` Query
  Service, topology, runbooks, and metric/log plans. Builds on the
  `umodel-query` skill. Triggers: RCA, root cause, incident, alert,
  degraded service, Java backend RCA, payment/checkout slow, 根因分析, 故障排查,
  告警定位, 为什么慢.
---

# UModel Java RCA

Investigate incidents through the Java backend's object graph. Load
`umodel-query` too; this skill adds the RCA loop.

## Setup

Start Java backend and import the sample:

```bash
mvn spring-boot:run -pl apps/umodel-server -am
curl -X POST http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

Use REST or MCP `query_spl_execute`. Keep remediation read-only unless the user
explicitly asks to write.

## RCA Loop

1. Orient: find the symptomatic entity.
2. Discover: list EntitySet methods and datasets.
3. Characterize: fetch `get_metrics` and `get_logs` plans.
4. Traverse: inspect direct relations and neighbors with `.topo`.
5. Retrieve runbook context with `.runbook_set`.
6. Correlate: line up entity state, relation direction, telemetry plans, and
   runbook knowledge.
7. Conclude: state root cause, evidence chain, confidence, and a reversible
   recommendation.

## Java Quickstart Queries

Find service:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment"}'
```

Discover datasets:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call list_data_set(['\''metric_set'\'','\''log_set'\''], true)"}'
```

Plan metrics:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'latency_p99_ms', step='30s')\"}"
```

Plan logs:

```bash
curl -X POST 'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \\\"ERROR\\\"')\"}"
```

Traverse topology:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

Search runbooks:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5)"}'
```

## Output

```text
Diagnosis:
Symptom: <what is degraded and how you know>
Evidence chain: <entity -> telemetry plan -> topology -> runbook>
Root cause: <mechanism, not just a correlated event>
Ruled out: <alternatives and why>
Confidence: <high|medium|low>
Recommended action: <read-only or confirmation-required action>
```

Never fabricate metric values from a plan. If the user needs actual values, run
the returned Prometheus or Elasticsearch plan against the configured telemetry
backend.
