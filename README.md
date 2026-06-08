# UModel Java Backend

UModel Java Backend 是 UModel 后端的 JDK 21 实现线。项目以公共契约兼容为目标，不做 Go 源码的机械翻译，而是用 Java 和 Spring Boot 重新实现同一套后端服务边界。

当前版本是第一阶段子集兼容实现，目标是先跑通 quickstart、核心 REST API、Query Service 子集和 AgentGateway REST，后续逐步补齐完整 Query、MCP、文件持久化和更多 GraphStore provider。

## 当前能力

- JDK 21 + Spring Boot 3。
- 多模块 Maven 工程。
- REST 路由覆盖 `compat/openapi/openapi.yaml` 中的核心 `/api/v1/**` 路径。
- `memory` GraphStore provider。
- `file.memory` provider 扩展点。
- Workspace CRUD。
- UModel validate、put elements、inline import。
- EntityStore entity/relation write。
- 内置 `multi-domain-quickstart` 子集数据。
- Query Service 子集：`.umodel`、`.entity`、`.topo`、`with(...)`、`project`、`sort`、`limit`。
- AgentGateway REST：discover、resource read、query tools。

暂未完成：完整 path-based UModel import、完整 Cypher、MCP stdio/http transport、`local.ladybug`、vector/hybrid search、完整 schema spec validation、`file.memory` JSON 持久化。

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
modules/graphstore-file   file.memory provider 扩展点
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
  -d '{"elements":[{"kind":"entity_set","domain":"devops","name":"devops.service","spec":{"display_name":"Service"}}]}'
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

## 配置项

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `UMODEL_PORT` | `8080` | HTTP 监听端口。 |
| `GRAPHSTORE` | `memory` | GraphStore provider。当前支持 `memory`，`file.memory` 是扩展点。 |
| `UMODEL_DATA_ROOT` | `data` | 数据根目录。 |
| `UMODEL_AGENT_WRITE_ENABLED` | `false` | 是否启用 AgentGateway 写工具。 |

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
