# `.topo` — relationships and topology

`.topo` reads runtime relation rows from the graph store. Use it to inspect
dependencies, service-to-workload placement, neighbors, and controlled read-only
Cypher-style graph queries.

Graph calls use node literals like:

```text
(:"<domain>@<entity_set>" {__entity_id__: '<id>'})
```

For the Java quickstart checkout service:

```text
(:"devops@devops.service" {__entity_id__: '10000000000000000000000000000101'})
```

## Direct Relations

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

`getDirectRelations([...])` returns relations directly connected to the supplied
node or nodes. Passing an empty list returns stored direct relations up to the
query limit:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([]) | limit 20"}'
```

## Neighbor Traversal

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

Arguments:

- `scope`: Java currently accepts the call and treats the memory graph as the
  available scope. Use `'full'` for parity with upstream examples.
- `hops`: number of hops to traverse.
- `start nodes`: node literal array.

Use a `where` pipe to filter graph-call output:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | where __relation_type__='\''runs_on'\'' | limit 20"}'
```

Do not put runtime relation filters inside the initial `.topo with(...)` clause
after a graph-call; use `where`.

## Controlled Read-Only Cypher

The Java memory provider supports a controlled read-only MATCH/RETURN subset over
stored relation rows:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call cypher(`MATCH (src)-[r]->(dest) RETURN src, r AS relation, dest LIMIT 20`)"}'
```

Mutating clauses are rejected. Treat this as a compatibility fallback, not a full
provider-backed Cypher engine.

## Returned Format

Rows describe directed runtime edges. Common fields include:

```jsonc
{
  "__src_domain__": "devops",
  "__src_entity_type__": "devops.service",
  "__src_entity_id__": "10000000000000000000000000000101",
  "__dest_domain__": "k8s",
  "__dest_entity_type__": "k8s.workload",
  "__dest_entity_id__": "10000000000000000000000000000201",
  "__relation_type__": "runs_on"
}
```

Read direction as:

```text
__src_entity_id__ --__relation_type__--> __dest_entity_id__
```

For RCA:

- Rows where your entity is `__dest_entity_id__` are incoming/upstream
  dependencies.
- Rows where your entity is `__src_entity_id__` are outgoing/downstream
  dependencies.

Resolve endpoint ids back to entity details with `.entity ... ids=[...]`.

## Java Quickstart Example

The sample relation is:

```text
Checkout Service --runs_on--> checkout workload
```

Read it:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | project __src_entity_id__,__relation_type__,__dest_entity_id__"}'
```

Then resolve the workload:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''k8s'\'', name='\''k8s.workload'\'', ids=['\''10000000000000000000000000000201'\'']) | project namespace,name"}'
```

## Pitfalls

- Use `__entity_id__`, not display name, in graph node literals.
- Direction matters. Do not call a relation a dependency until you inspect
  source and destination fields.
- `cypher(...)` is read-only and limited in the Java memory provider.
- Runtime topology is not the same as model `entity_set_link`; use `.umodel` for
  model links and `.topo` for runtime relation rows.
