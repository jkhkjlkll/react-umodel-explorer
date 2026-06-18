# `.runbook_set` — 搜索运维 Runbook 上下文

`.runbook_set` 搜索 UModel `runbook_set` 定义中的 operational context。Java 后端索引
与上游对齐的 runbook sections，并额外兼容 Java 的 `steps` section：

- `knowledge`：已知模式、症状、机制和排障说明。
- `observations`：证据片段或条件描述。
- `actions`：候选调查或 remediation 动作。
- `automations`：自动化元数据或可执行 workflow hints。
- `skills`：agent skill hints、skill 名称和 workflow 描述。
- `steps`：Java 兼容的 legacy step entries。

## 基础搜索

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5) | project type,source,title,content,__score__"}'
```

MCP 等价调用：

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

## 过滤条件

- `domain='devops'`：限制搜索 domain。
- `type='knowledge'`：限制搜索 section。
- `query='...'`：对 chunk values 做 keyword query。
- `mode='keyword' | 'vector' | 'hyper' | 'hybrid'`：接受的 search mode。
- `topk=5`：没有显式 `limit` 时设置结果限制。

Java 后端当前所有搜索模式都使用内存 keyword scoring。接受 `vector`、`hyper` 和
`hybrid` 是为了保留 agent-facing query shape，直到接入真实 search provider。

接受单数别名：

```text
type='observation' -> observations
type='action'      -> actions
type='automation'  -> automations
type='skill'       -> skills
type='step'        -> steps
```

## 返回行

行内容包括：

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

`type` 是命中的 section，不是模型 kind。`source` 标识 runbook model source。RCA 输出中
引用具体上下文时使用 `section`。

## 按 Section 搜索

搜索已知知识：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''latency'\'', topk=5) | project section,title,content,__score__"}'
```

搜索 observations：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''observations'\'', query='\''ERROR latency'\'', topk=5) | project section,title,content,__score__"}'
```

搜索 action hints：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''actions'\'', query='\''neighbors'\'', topk=5) | project section,title,content,__score__"}'
```

搜索 skill hints：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''skills'\'', query='\''rca'\'', topk=5) | project section,title,content,__score__"}'
```

## RCA 用法

把 runbook rows 当作 context，不要把它们本身当作证据：

- `knowledge` 和 `observations` 用于构建假设和理解证据。
- `actions` 和 `automations` 提供下一步建议，但 remediation 仍需要用户明确确认。
- `skills` 告诉 agent 哪个 workflow 可能适用，例如 `umodel-rca`。

推荐 RCA 流程：

1. 用 `.entity` 找到有症状的实体。
2. 用 `.entity_set | entity-call` 获取 metric/log plans。
3. 用 `.topo` 遍历相关实体。
4. 用 `.runbook_set` 搜索匹配的 knowledge 和 actions。
5. 只有当 runbook `section` 与观测证据匹配时，才在结论里引用它。

## 完整 Spec 兜底

如果 runbook 不包含任何已知 section，Java 会退化为一个 chunk：

```text
type=runbook
section=spec
content=<full spec JSON>
```

这能让 legacy 或 custom runbook shape 仍可发现，但为了与上游 agent workflow 对齐，优先使用
sectioned runbook。

## 常见坑

- 不要自动执行 `actions` 或 `automations`。除非用户明确要求运行 write-capable tool，
  否则它们只是候选下一步。
- 不要声称默认 Java 后端已有生产级 ANN vector/hybrid ranking；当前默认 provider
  使用内存 token overlap 和 hybrid RRF。
- 区分运行时证据和 runbook guidance。Runbook 可以提示机制，但 metrics、logs 和 topology
  必须支撑结论。
