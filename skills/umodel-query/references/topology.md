# `.topo` — 关系和拓扑

`.topo` 从 graph store 读取运行时 relation rows。用它检查依赖、service-to-workload
部署关系、邻居，以及受控只读 Cypher 风格查询。

Graph call 使用这样的 node literal：

```text
(:"<domain>@<entity_set>" {__entity_id__: '<id>'})
```

Java quickstart 的 checkout service：

```text
(:"devops@devops.service" {__entity_id__: '10000000000000000000000000000101'})
```

## 直接关系

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

`getDirectRelations([...])` 返回与传入节点直接相连的关系。传空列表会按 query limit
返回已存储的直接关系：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([]) | limit 20"}'
```

## 邻居遍历

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | limit 20"}'
```

参数：

- `scope`：Java 当前接受该参数，并以 memory graph 中可用的关系作为范围。为保持上游
  示例兼容，使用 `'full'`。
- `hops`：遍历 hop 数。
- `start nodes`：node literal 数组。

过滤 graph-call 输出时使用 `where` pipe：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getNeighborNodes('\''full'\'', 2, [(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | where __relation_type__='\''runs_on'\'' | limit 20"}'
```

graph-call 后的运行时关系过滤不要放在开头的 `.topo with(...)`，请使用 `where`。

## 受控只读 Cypher

Java memory provider 支持对已存储 relation rows 的受控只读 MATCH/RETURN 子集：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call cypher(`MATCH (src)-[r]->(dest) RETURN src, r AS relation, dest LIMIT 20`)"}'
```

mutating clauses 会被拒绝。把它视作兼容 fallback，不是完整 provider-backed Cypher engine。

## 返回格式

行表示有方向的运行时 edge。常见字段：

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

方向读取为：

```text
__src_entity_id__ --__relation_type__--> __dest_entity_id__
```

RCA 时：

- 目标实体位于 `__dest_entity_id__` 的行，是 incoming/upstream dependencies。
- 目标实体位于 `__src_entity_id__` 的行，是 outgoing/downstream dependencies。

用 `.entity ... ids=[...]` 把端点 id 解析回实体详情。

## Java 快速开始示例

样例关系是：

```text
Checkout Service --runs_on--> checkout workload
```

读取它：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([(:\"devops@devops.service\" {__entity_id__: '\''10000000000000000000000000000101'\''})]) | project __src_entity_id__,__relation_type__,__dest_entity_id__"}'
```

再解析 workload：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''k8s'\'', name='\''k8s.workload'\'', ids=['\''10000000000000000000000000000201'\'']) | project namespace,name"}'
```

## 常见坑

- graph node literal 使用 `__entity_id__`，不要用 display name。
- 方向很重要。先检查 source/destination 字段，再判断依赖关系。
- Java memory provider 中 `cypher(...)` 是只读且有限的。
- 运行时 topology 不等于模型 `entity_set_link`；模型 link 用 `.umodel`，运行时 relation rows
  用 `.topo`。
