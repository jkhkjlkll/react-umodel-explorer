# Entities

Read runtime entities with `.entity`.

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | project __entity_id__,display_name,environment | limit 20"}'
```

Important fields:

- `__domain__`: model domain.
- `__entity_type__`: EntitySet name.
- `__entity_id__`: stable handle for topology and EntitySet calls.
- `__last_observed_time__`: last runtime observation.

The bundled Java quickstart includes `devops.service` with id
`10000000000000000000000000000101`.
