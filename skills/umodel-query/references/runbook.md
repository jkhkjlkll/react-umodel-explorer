# `.runbook_set` — search operational runbook context

`.runbook_set` searches operational context stored in UModel `runbook_set`
definitions. The Java backend indexes upstream-aligned runbook sections plus a
Java-compatible `steps` section:

- `knowledge`: documented patterns, symptoms, known mechanisms, troubleshooting
  notes.
- `observations`: evidence snippets or condition descriptions.
- `actions`: candidate investigation or remediation actions.
- `automations`: automation metadata or executable workflow hints.
- `skills`: agent skill hints, skill names, and workflow descriptions.
- `steps`: Java-compatible legacy step entries.

## Basic Search

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5) | project type,source,title,content,__score__"}'
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
      "query": ".runbook_set with(domain='devops', type='knowledge', query='checkout latency', mode='hyper', topk=5) | project type,source,title,content,__score__"
    }
  }
}
```

## Filters

- `domain='devops'`: restricts search to a domain.
- `type='knowledge'`: restricts search to a section.
- `query='...'`: keyword query over chunk values.
- `mode='keyword' | 'vector' | 'hyper' | 'hybrid'`: accepted search mode.
- `topk=5`: sets result limit when `limit` is not supplied.

The Java backend currently uses memory keyword scoring for every search mode.
`vector`, `hyper`, and `hybrid` are accepted to preserve agent-facing query
shape until a real search provider is configured.

Singular aliases are accepted:

```text
type='observation' -> observations
type='action'      -> actions
type='automation'  -> automations
type='skill'       -> skills
type='step'        -> steps
```

## Returned Rows

Rows include:

```jsonc
{
  "type": "knowledge",
  "source": "devops.runbook_set",
  "domain": "devops",
  "kind": "runbook_set",
  "name": "devops.service.ops",
  "section": "knowledge[0]",
  "title": "Checkout latency investigation",
  "content": "{...}",
  "spec": { "...": "full runbook spec" },
  "__score__": 2.0
}
```

`type` is the matched section, not the model kind. `source` identifies the
runbook model source. Use `section` to cite specific context in RCA output.

## Search By Section

Search documented knowledge:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''latency'\'', topk=5) | project section,title,content,__score__"}'
```

Search observations:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''observations'\'', query='\''ERROR latency'\'', topk=5) | project section,title,content,__score__"}'
```

Search action hints:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''actions'\'', query='\''neighbors'\'', topk=5) | project section,title,content,__score__"}'
```

Search skill hints:

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''skills'\'', query='\''rca'\'', topk=5) | project section,title,content,__score__"}'
```

## RCA Usage

Use runbook rows as context, not as proof by themselves:

- `knowledge` and `observations` help frame hypotheses and evidence.
- `actions` and `automations` suggest next steps, but remediation still needs
  explicit user confirmation.
- `skills` tells an agent which workflow may apply, for example `umodel-rca`.

Good RCA flow:

1. Find the symptomatic entity with `.entity`.
2. Fetch metric/log plans with `.entity_set | entity-call`.
3. Traverse related entities with `.topo`.
4. Search `.runbook_set` for matching knowledge and actions.
5. Cite the runbook `section` only when it matches the observed evidence.

## Full Spec Fallback

If a runbook contains none of the known sections, Java falls back to one chunk
with:

```text
type=runbook
section=spec
content=<full spec JSON>
```

That keeps legacy or custom runbook shapes discoverable, but sectioned runbooks
are preferred for parity with upstream agent workflows.

## Pitfalls

- Do not execute `actions` or `automations` automatically. Treat them as
  candidate next steps unless the user explicitly asks to run a write-capable
  tool.
- Do not claim vector/hybrid ranking exists yet in Java; these modes currently
  use memory keyword fallback.
- Keep runtime evidence separate from runbook guidance. A runbook can suggest a
  mechanism, but metrics, logs, and topology must support the conclusion.
