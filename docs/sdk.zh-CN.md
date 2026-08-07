# Java SDK

Java 后端在 Maven reactor 中提供两个可独立使用的 SDK artifact：

- `com.alibaba.umodel:umodel-model-sdk`：解析、校验、检查和序列化 UModel 定义。
- `com.alibaba.umodel:umodel-service-client`：调用公共 REST 契约，不依赖服务端实现模块。

## 安装

在本地构建并安装 SDK：

```bash
mvn install -pl modules/model-sdk,modules/service-client -am
```

在应用中添加依赖：

```xml
<dependency>
  <groupId>com.alibaba.umodel</groupId>
  <artifactId>umodel-model-sdk</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>
<dependency>
  <groupId>com.alibaba.umodel</groupId>
  <artifactId>umodel-service-client</artifactId>
  <version>0.1.0-SNAPSHOT</version>
</dependency>
```

## 解析与校验模型

`UModelCodec` 根据 `kind` 和 `schema.version` 自动选择注册的 Java 类型，并校验公共 envelope，同时支持 JSON 和 YAML。

```java
import com.alibaba.umodel.sdk.model.StandardModelTypes.EntitySetV100;
import com.alibaba.umodel.sdk.model.UModelCodec;

UModelCodec codec = new UModelCodec();
EntitySetV100 entitySet = (EntitySetV100) codec.parseYaml(yaml);

System.out.println(entitySet.domain());
System.out.println(entitySet.name());
String json = codec.toJson(entitySet);
```

23 个标准 Schema kind 都注册为 `StandardModelTypes.*V100`。兼容的 `v0.x` 文档会映射到对应 `v1.0.0` 类型，同时在序列化时保留原始版本。

Link 类型继承 `LinkUModelObject`：

```java
DataLinkV100 link = (DataLinkV100) codec.parseYaml(yaml);
LinkEndpoint source = link.source();
LinkEndpoint destination = link.destination();
```

## 扩展注册表

应用可以注册领域自定义类型，无需 fork SDK：

```java
UModelTypeRegistry registry = UModelTypeRegistry.standard()
        .register("company_service", "v1.0.0", CompanyService.class);
UModelCodec codec = new UModelCodec(registry);
```

自定义类需要继承 `BaseUModelObject`，或实现 `UModelObject` 并提供公开的无参构造器。

## 处理模型错误

`UModelSdkException` 提供稳定错误分类和尽可能准确的字段路径：

```java
try {
    codec.parseYaml(yaml);
} catch (UModelSdkException error) {
    System.err.printf("%s at %s: %s%n", error.category(), error.path(), error.getMessage());
}
```

错误分类包括 `PARSE_ERROR`、`VALIDATION_ERROR`、`UNKNOWN_TYPE`、`UNSUPPORTED_VERSION` 和 `MISSING_FIELD`。

## 调用 UModel 服务

```java
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.sdk.client.UModelClient;

UModelClient client = UModelClient.builder(URI.create("http://localhost:8080"))
        .connectTimeout(Duration.ofSeconds(10))
        .requestTimeout(Duration.ofSeconds(30))
        .bearerToken(System.getenv("UMODEL_TOKEN"))
        .build();

client.createWorkspace(new CreateWorkspaceRequest("demo", "Demo", null, Map.of(), Map.of()));
client.putModelObjects("demo", List.of(entitySet));
QueryExecuteResponse result = client.executeQuery(
        "demo",
        new QueryRequest(".umodel | limit 5", Map.of(), 5, null, null, null)
);
```

客户端覆盖 workspace CRUD、模型 validate/import/put/delete、实体和关系 write/expire、sample import、query execute/explain，以及 AgentGateway discover/tool/resource。`executeAgentQuery` 返回 `JsonNode`，因为 agent plan 是多态的顶层文档。

`UModelClientException` 提供 HTTP 状态码、方法、URI、稳定服务错误码、是否可重试和原始响应体。

## 兼容性

- SDK 使用 JDK 21 和 Jackson，与 Java 后端 reactor 保持一致。
- 模型对象在受支持的 round trip 中保留未知 envelope 和 spec 字段。
- 标准类型提供 kind 级强类型对象；完整字段级生成类仍由 generated schema parity gate 跟踪。
- Service Client 只调用 `compat/openapi/openapi.yaml` 中的公共 REST 路径。
