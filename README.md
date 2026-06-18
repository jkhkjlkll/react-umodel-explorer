# UModel Java Backend

UModel Java Backend 是 UModel 后端的 JDK 21 实现线。项目以公共契约兼容为目标，不做 Go 源码的机械翻译，而是用 Java 和 Spring Boot 重新实现同一套后端服务边界。

当前版本已经完成可运行的 JDK 21 / Spring Boot 替代后端增强子集，覆盖 quickstart、核心 REST API、Query Service、AgentGateway REST、MCP HTTP/SSE/stdio、Skill 包、`file.memory` JSON 持久化，以及 `local.ladybug` provider 兼容边界。它可以作为独立后端启动、部署和验证，并继续按公共契约扩展到完整替代。

## 当前能力

- JDK 21 + Spring Boot 3。
- 多模块 Maven 工程。
- REST 路由覆盖 `compat/openapi/openapi.yaml` 中的核心 `/api/v1/**` 路径。
- `memory` GraphStore provider。
- `file.memory` GraphStore provider，使用 JSON 快照持久化。
- Workspace CRUD。
- UModel validate、put/delete elements、inline import、path-based YAML/JSON import；校验覆盖 EntitySet、MetricSet、LogSet、RunbookSet、Storage endpoint、link endpoint 和 `fields_mapping`。
- EntityStore entity/relation write，以及按 id expire。
- 内置 `multi-domain-quickstart` 子集数据，包含 EntitySet、MetricSet、LogSet、RunbookSet、DataLink、StorageLink、runtime entity 和 topology relation。
- Query Service 子集：`.umodel`、`.entity_set`、`.entity`、`.topo`、`.runbook_set`、`with(...)`、`where` 简单等值条件、`project`、`sort`、`limit`、`entity-call`、`getDirectRelations(...)`、`getNeighborNodes(...)`、只读受控 `cypher(...)`。
- `.runbook_set` 可搜索 UModel 中的 runbook `knowledge`、`observations`、`actions`、`automations`、`skills`、`steps`；`keyword`、`vector`、`hyper`、`hybrid` 当前都走内存 keyword fallback。
- EntitySet method plan：`__list_method__`、`list_data_set`、`get_logs`、`get_metrics`，其中 `get_logs` / `get_metrics` 返回下游存储查询计划；Prometheus plan 包含渲染后的 `queries[].promql`、`label_matchers`、`raw_filters`、tenant/external label 元数据，Elasticsearch plan 包含 DSL-style `body`。
- Agent query format：`POST /api/v1/query/{workspace}/execute?format=agent` 对计划类查询返回 v1.1 顶层 JSON plan；`&include=spec` 展开 storage/link 详情。
- AgentGateway REST：discover、resource read、query tools、validate tool、skill metadata、可选写工具。
- MCP streamable HTTP JSON-RPC 子集：`/mcp` 支持 initialize、ping、tools/list、tools/call、resources/list、resources/read、resource templates、prompts、completion、discovery；tool/resource 文本块使用 TOON，`structuredContent` 保留 `{name, ok, output}` JSON。
- MCP HTTP+SSE compatibility：`GET /sse` 建立会话，`POST /messages?session=...` 发送 JSON-RPC。
- MCP stdio app：`apps/umodel-mcp-stdio` 提供 line-delimited JSON-RPC。
- `skills/README*`、`skills/QUICKSTART*`、`skills/umodel-query` 和 `skills/umodel-rca` 提供 Java backend 查询与 RCA 工作流；`skills/` 位于项目根目录是为了保持上游 agent skill 包布局，`modules/` 只放 Maven 服务模块。
- `local.ladybug` 已作为 GraphStore provider stub 暴露 health/capability/error 边界；真正 Ladybug Java runtime adapter 仍需单独接入。

## 目录结构

```text
apps/umodel-server        Spring Boot HTTP 服务入口
modules/contract          DTO、错误模型、公共契约
modules/bootstrap         Spring Bean 装配
modules/workspace         Workspace 元数据服务
modules/umodel            UModel 校验和写入服务
modules/entitystore       实体和关系写入服务
modules/graphstore-api    GraphStore 抽象接口
modules/graphstore-memory 内存 GraphStore provider
modules/graphstore-file   file.memory JSON 快照 provider
modules/graphstore-ladybug local.ladybug compatibility stub
modules/query             SPL 子集解析、计划和执行
modules/agentgateway      Agent 发现、资源和工具
modules/sampledata        quickstart 示例数据导入
apps/umodel-mcp-stdio     MCP stdio JSON-RPC 入口
compat/openapi            从 Go 仓库同步的 OpenAPI 契约
compat/mcp                从 Go 仓库同步的 MCP schema
docs                      兼容计划和兼容矩阵
skills                    Java backend query/RCA skills
```

## 环境要求

- JDK 21。
- Maven 3.9.x。
- 可选：Docker 24+。

检查环境：

```bash
java -version
mvn -version
```

## 本地启动

在仓库根目录执行：

```bash
mvn spring-boot:run -pl apps/umodel-server -am
```

默认配置：

```text
HTTP 端口: 8080
GraphStore: memory
数据目录: data
Agent 写工具: 关闭
```

也可以通过环境变量覆盖：

```bash
UMODEL_PORT=8080 \
GRAPHSTORE=memory \
UMODEL_DATA_ROOT=data \
UMODEL_AGENT_WRITE_ENABLED=false \
mvn spring-boot:run -pl apps/umodel-server -am
```

健康检查：

```bash
curl http://localhost:8080/healthz
```

使用本地 JSON 持久化 provider：

```bash
UMODEL_PORT=8080 \
GRAPHSTORE=file.memory \
UMODEL_DATA_ROOT=data \
UMODEL_AGENT_WRITE_ENABLED=false \
mvn spring-boot:run -pl apps/umodel-server -am
```

`file.memory` 会在 `UMODEL_DATA_ROOT` 下维护 `graphstore-file-memory.json`，适合本地替代验证和小规模开发环境。

## 导入 quickstart 数据

Java 版当前内置了一个小型 `multi-domain-quickstart` 子集，包含 UModel 定义、MetricSet/LogSet/RunbookSet 计划元数据、两个 runtime entity 和一条 topology relation。

导入 demo workspace：

```bash
curl -X POST \
  http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

查询 UModel 定义：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".umodel with(kind='\''entity_set'\'') | project domain,name,kind | sort name | limit 20"}'
```

查询运行时实体：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'', query='\''checkout'\'') | limit 20"}'
```

查询拓扑关系：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call getDirectRelations([]) | limit 20"}'
```

查询拓扑只读 Cypher 子集：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".topo | graph-call cypher(`MATCH (src)-[r]->(dest) RETURN src, r AS relation, dest LIMIT 20`)"}'
```

搜索 runbook context：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".runbook_set with(domain='\''devops'\'', type='\''knowledge'\'', query='\''checkout latency'\'', mode='\''hyper'\'', topk=5) | project type,source,title,content,__score__"}'
```

列出 EntitySet 方法：

```bash
curl -X POST \
  http://localhost:8080/api/v1/query/demo/execute \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity_set with(domain='\''devops'\'', name='\''devops.service'\'') | entity-call __list_method__()"}'
```

生成 metric 查询计划：

```bash
curl -X POST \
  'http://localhost:8080/api/v1/query/demo/execute?format=agent' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')\"}"
```

生成 log 查询计划并展开 spec：

```bash
curl -X POST \
  'http://localhost:8080/api/v1/query/demo/execute?format=agent&include=spec' \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='level = \\\"ERROR\\\"')\"}"
```

查看 AgentGateway：

```bash
curl http://localhost:8080/api/v1/agent/demo/discover
```

通过 HTTP MCP 子集查看工具：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"workspace":"demo"}}'
```

通过 HTTP+SSE MCP compatibility 连接：

```bash
curl -N http://localhost:8080/sse
curl -X POST 'http://localhost:8080/messages?session=<session-id>' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"workspace":"demo"}}'
```

## 打包部署

构建可运行 jar：

```bash
mvn package -pl apps/umodel-server -am
```

运行 jar：

```bash
java -jar apps/umodel-server/target/umodel-server-0.1.0-SNAPSHOT.jar
```

构建并运行 MCP stdio app：

```bash
mvn package -pl apps/umodel-mcp-stdio -am
java -jar apps/umodel-mcp-stdio/target/umodel-mcp-stdio-0.1.0-SNAPSHOT.jar \
  --workspace=demo \
  --graphstore=memory \
  --quickstart
```

stdio app 使用逐行 JSON-RPC，请向 stdin 写入单行请求：

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"workspace":"demo"}}
```

生产环境推荐显式传入配置：

```bash
UMODEL_PORT=8080 \
GRAPHSTORE=memory \
UMODEL_DATA_ROOT=/var/lib/umodel-java \
UMODEL_AGENT_WRITE_ENABLED=false \
java -jar apps/umodel-server/target/umodel-server-0.1.0-SNAPSHOT.jar
```

## Docker 部署

构建镜像：

```bash
docker build -t umodel-java-backend:latest .
```

启动容器：

```bash
docker run --rm \
  -p 8080:8080 \
  -e GRAPHSTORE=memory \
  -e UMODEL_DATA_ROOT=/app/data \
  -e UMODEL_AGENT_WRITE_ENABLED=false \
  umodel-java-backend:latest
```

验证：

```bash
curl http://localhost:8080/healthz
```

## 常用 API

创建 workspace：

```bash
curl -X POST http://localhost:8080/api/v1/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"id":"demo","name":"Demo","description":"Java backend demo"}'
```

写入 UModel 元素：

```bash
curl -X POST http://localhost:8080/api/v1/umodel/demo/elements \
  -H 'Content-Type: application/json' \
  -d '{"elements":[{"kind":"entity_set","domain":"devops","name":"devops.service","spec":{"display_name":"Service","fields":{"name":{"type":"string"}}}}]}'
```

从 YAML/JSON 文件或目录导入 UModel：

```bash
curl -X POST http://localhost:8080/api/v1/umodel/demo/import \
  -H 'Content-Type: application/json' \
  -d '{"path":"/absolute/path/to/model-pack"}'
```

写入 entity：

```bash
curl -X POST http://localhost:8080/api/v1/entitystore/demo/entities:write \
  -H 'Content-Type: application/json' \
  -d '{"entities":[{"__domain__":"devops","__entity_type__":"devops.service","__entity_id__":"10000000000000000000000000000101","__method__":"Create","__first_observed_time__":1710000000,"__last_observed_time__":1710000000,"name":"checkout"}]}'
```

解释查询：

```bash
curl -X POST http://localhost:8080/api/v1/query/demo/explain \
  -H 'Content-Type: application/json' \
  -d '{"query":".entity with(domain='\''devops'\'', name='\''devops.service'\'') | limit 5"}'
```

通过 AgentGateway 写工具导入 UModel，需要启动时设置 `UMODEL_AGENT_WRITE_ENABLED=true`：

```bash
curl -X POST http://localhost:8080/api/v1/agent/demo/tools:execute \
  -H 'Content-Type: application/json' \
  -d '{"name":"umodel_import","arguments":{"elements":[{"kind":"entity_set","domain":"devops","name":"devops.service","spec":{"fields":{"name":{"type":"string"}}}}]}}'
```

通过 MCP 调用 Query Service：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"workspace":"demo","name":"query_spl_execute","arguments":{"query":".umodel | limit 20"}}}'
```

## 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `UMODEL_PORT` | `8080` | HTTP 监听端口。 |
| `GRAPHSTORE` | `memory` | GraphStore provider。当前支持 `memory`、`file.memory` 和 `local.ladybug` compatibility stub。 |
| `UMODEL_DATA_ROOT` | `data` | 数据根目录。 |
| `UMODEL_AGENT_WRITE_ENABLED` | `false` | 是否启用 AgentGateway 和 MCP 的写工具。 |

## 兼容资料

- [兼容计划](docs/compatibility-plan.md)
- [兼容矩阵](docs/compatibility-matrix.md)
- [REST OpenAPI](compat/openapi/openapi.yaml)
- [MCP schema](compat/mcp/tools.schema.json)

## 开发验证

```bash
mvn test
mvn spring-boot:run -pl apps/umodel-server -am
```

如果本机没有 JDK 21 或 Maven，先安装环境再执行上述命令。
