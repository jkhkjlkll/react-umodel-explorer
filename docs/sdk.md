# Java SDK

The Java backend publishes two independent SDK artifacts in the Maven reactor:

- `com.alibaba.umodel:umodel-model-sdk` parses, validates, inspects, and serializes UModel definitions.
- `com.alibaba.umodel:umodel-service-client` calls the public REST contract without depending on server implementation modules.

## Install

Build and install the reactor artifacts locally:

```bash
mvn install -pl modules/model-sdk,modules/service-client -am
```

Add the required artifact to an application:

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

## Parse And Validate Models

`UModelCodec` detects `kind` and `schema.version`, resolves a registered Java type, and validates the common envelope. It supports JSON and YAML.

```java
import com.alibaba.umodel.sdk.model.StandardModelTypes.EntitySetV100;
import com.alibaba.umodel.sdk.model.UModelCodec;

UModelCodec codec = new UModelCodec();
EntitySetV100 entitySet = (EntitySetV100) codec.parseYaml(yaml);

System.out.println(entitySet.domain());
System.out.println(entitySet.name());
String json = codec.toJson(entitySet);
```

All 23 standard schema kinds are registered as `StandardModelTypes.*V100`. Compatible `v0.x` documents resolve to the corresponding `v1.0.0` type while preserving the original schema version during round trips.

Link types extend `LinkUModelObject`:

```java
DataLinkV100 link = (DataLinkV100) codec.parseYaml(yaml);
LinkEndpoint source = link.source();
LinkEndpoint destination = link.destination();
```

## Extend The Registry

Applications can register domain-specific kinds without forking the SDK:

```java
UModelTypeRegistry registry = UModelTypeRegistry.standard()
        .register("company_service", "v1.0.0", CompanyService.class);
UModelCodec codec = new UModelCodec(registry);
```

The custom class must extend `BaseUModelObject` or otherwise implement `UModelObject` and expose a public no-argument constructor.

## Handle Model Errors

`UModelSdkException` provides stable categories and the best available field path:

```java
try {
    codec.parseYaml(yaml);
} catch (UModelSdkException error) {
    System.err.printf("%s at %s: %s%n", error.category(), error.path(), error.getMessage());
}
```

Categories include `PARSE_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_TYPE`, `UNSUPPORTED_VERSION`, and `MISSING_FIELD`.

## Call The UModel Service

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

The client covers workspace CRUD, model validate/import/put/delete, entity and relation write/expire, sample import, query execute/explain, and AgentGateway discovery/tool/resource operations. `executeAgentQuery` returns `JsonNode` because an agent plan is intentionally a polymorphic top-level document.

`UModelClientException` exposes HTTP status, method, URI, stable service error code, retryability, and the raw response body.

## Compatibility

- The SDK uses JDK 21 and Jackson, matching the Java backend reactor.
- Model objects preserve unknown envelope and spec fields during supported round trips.
- Standard types are kind-level typed objects; full generated field classes remain tracked by the generated schema parity gate.
- The service client only calls public REST paths from `compat/openapi/openapi.yaml`.
