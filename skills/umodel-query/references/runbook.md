# Runbooks

Search operational knowledge with `.runbook_set`.

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5) | project title,content,__score__"}'
```

The Java backend currently searches runbook sections stored as UModel
`runbook_set` specs. `keyword`, `vector`, `hyper`, and `hybrid` modes are accepted
as an in-memory keyword fallback unless a dedicated search provider is added.
