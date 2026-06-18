# Runbooks

Search operational runbook context with `.runbook_set`.

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5) | project type,source,title,content,__score__"}'
```

The Java backend currently searches runbook sections stored as UModel
`runbook_set` specs. Supported sections are `knowledge`, `observations`,
`actions`, `automations`, `skills`, and Java-compatible `steps`. Singular filters
such as `type='action'`, `type='automation'`, `type='skill'`, and `type='step'`
match their plural section names.

Use `knowledge` and `observations` for evidence, `actions` and `automations` for
candidate next steps, and `skills` for agent workflow hints. Treat action and
automation entries as context unless the user explicitly asks to execute a
write-capable tool.

`keyword`, `vector`, `hyper`, and `hybrid` modes are accepted as an in-memory
keyword fallback unless a dedicated search provider is added.
