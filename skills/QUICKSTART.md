# 快速上手：用 Agent 跑通 UModel Java 技能

几分钟内让一个 AI Agent 端到端使用 UModel Java Backend：启动服务、导入 demo
对象图、安装技能、连接 MCP/HTTP，然后提问。

demo 数据集是 Java 子项目内置的 `multi-domain-quickstart`：包含 EntitySet、
MetricSet、LogSet、RunbookSet、DataLink、StorageLink、runtime entity 和拓扑关系。
所有数据本地运行，默认使用 `memory` GraphStore。

## 前置要求

- JDK 21。
- Maven 3.9.x。
- 一个支持技能或 MCP 的 Agent：Codex、Claude Code、Qoder、Cursor 等。

检查环境：

```bash
java -version
mvn -version
```

## 1. 启动 Java 后端

在 `umodel-java` 根目录启动 Spring Boot 服务：

```bash
mvn spring-boot:run -pl apps/umodel-server -am
```

默认服务：

```text
API: http://localhost:8080
GraphStore: memory
Workspace: demo
Agent 写工具: 默认关闭
```

健康检查：

```bash
curl http://localhost:8080/healthz
```

## 2. 导入 demo 数据

```bash
curl -X POST \
  http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

确认模型已载入：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | sort name | limit 20"}'
```

确认运行时实体可查：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | limit 20"}'
```

## 3. 安装技能

把两个技能复制到 Agent 扫描目录。以 Codex/Qoder 都可读的 `.agents/skills/`
为例：

```bash
mkdir -p .agents/skills
cp -R skills/umodel-query skills/umodel-rca .agents/skills/
```

如果 Agent 没刷新到新技能，重启会话或重新加载技能列表。

## 4. 连接 MCP

### HTTP MCP

Java server 自带 `/mcp`：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"workspace":"demo"}}'
```

列工具：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"workspace":"demo"}}'
```

调用查询工具：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"workspace":"demo","name":"query_spl_execute","arguments":{"query":".topo | graph-call getDirectRelations([]) | limit 20"}}}'
```

### MCP stdio

如果客户端只支持 stdio，可启动 Java stdio wrapper：

```bash
mvn spring-boot:run -pl apps/umodel-mcp-stdio -am \
  -Dspring-boot.run.arguments="--workspace demo --graphstore memory --quickstart"
```

## 5. 直接提问

读取类问题会触发 `umodel-query`：

- “列出 demo workspace 里的 EntitySet。”
- “查 checkout 服务的实体。”
- “checkout 服务依赖了什么？把直接拓扑列出来。”
- “checkout 服务挂了哪些指标集和日志集？”
- “生成 request_count 指标查询计划。”
- “搜索 checkout latency 相关 runbook knowledge。”

故障排查类问题会触发 `umodel-rca`：

- “checkout 延迟升高，帮我排查根因。”
- “服务 SLO 告警了，按对象图给我证据链和建议动作。”

## 6. 常用查询

模型：

```text
.umodel with(kind='entity_set') | project domain,name,kind | sort name | limit 20
```

实体：

```text
.entity with(domain='devops', name='devops.service', query='checkout') | limit 20
```

拓扑：

```text
.topo | graph-call getDirectRelations([]) | limit 20
```

Runbook：

```text
.runbook_set with(domain='devops', type='knowledge', query='checkout latency', mode='hyper', topk=5)
```

指标计划：

```text
.entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')
```

日志计划：

```text
.entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='level = "ERROR"')
```

## 排错

- Agent 看不到工具：先确认 `curl http://localhost:8080/healthz` 正常，再调用 `/mcp`
  的 `tools/list`。
- 查询为空：确认已经调用 sample import，并且 workspace 是 `demo`。
- 指标/日志没有真实数值：开源 Java 后端返回可执行查询计划，真实数值需要你把计划发到
  Prometheus/Elasticsearch；`mode=data` 需要遥测数据 provider。
- `vector` / `hyper` / `hybrid` 结果不像真实向量检索：当前 Java 后端接受这些 mode，
  但仍使用内存 keyword fallback。

## 下一步

- 阅读 [`umodel-query`](umodel-query/SKILL.md)，了解每个 SPL surface。
- 阅读 [`umodel-rca`](umodel-rca/SKILL.md)，了解根因分析循环。
- 查看 [兼容矩阵](../docs/compatibility-matrix.md)，确认 Java/Go parity 状态。
