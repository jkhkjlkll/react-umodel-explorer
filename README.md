# UModel Java Backend

UModel Java Backend 是 UModel 后端的 JDK 21 实现线。项目以公共契约兼容为目标，不做 Go 源码的机械翻译，而是用 Java 和 Spring Boot 重新实现同一套后端服务边界。

当前版本已经完成可运行的 JDK 21 / Spring Boot 替代后端子集，覆盖 quickstart、核心 REST API、Query Service 子集、AgentGateway REST、HTTP MCP 子集和 `file.memory` JSON 持久化。它可以作为独立后端启动、部署和验证，并继续按公共契约扩展到完整替代。

## 当前能力

- JDK 21 + Spring Boot 3。
- 多模块 Maven 工程。
- REST 路由覆盖 `compat/openapi/openapi.yaml` 中的核心 `/api/v1/**` 路径。
- `memory` GraphStore provider。
- `file.memory` GraphStore provider，使用 JSON 快照持久化。
- Workspace CRUD。
- UModel validate、put/delete elements、inline import、path-based YAML/JSON import。
- EntityStore entity/relation write，以及按 id expire。
- 内置 `multi-domain-quickstart` 子集数据。
- Query Service 子集：`.umodel`、`.entity`、`.topo`、`with(...)`、`project`、`sort`、`limit`、`getDirectRelations(...)`、`getNeighborNodes(...)`。
- AgentGateway REST：discover、resource read、query tools、validate tool、可选写工具。
- MCP streamable HTTP JSON-RPC 子集：`/mcp` 支持 initialize、ping、tools/list、tools/call、resources/list、resources/read、discovery。

后续增强范围：完整 Cypher、MCP stdio/SSE transport、`local.ladybug`、vector/hybrid search、完整 schema spec validation、完整 Query/topology graph-call 覆盖。

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
modules/query             SPL 子集解析、计划和执行
modules/agentgateway      Agent 发现、资源和工具
modules/sampledata        quickstart 示例数据导入
compat/openapi            从 Go 仓库同步的 OpenAPI 契约
compat/mcp                从 Go 仓库同步的 MCP schema
docs                      兼容计划和兼容矩阵
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

Java 版当前内置了一个小型 `multi-domain-quickstart` 子集，包含 UModel 定义、两个 runtime entity 和一条 topology relation。

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

## 打包部署

构建可运行 jar：

```bash
mvn package -pl apps/umodel-server -am
```

运行 jar：

```bash
java -jar apps/umodel-server/target/umodel-server-0.1.0-SNAPSHOT.jar
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
| `GRAPHSTORE` | `memory` | GraphStore provider。当前支持 `memory` 和 `file.memory`。 |
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
