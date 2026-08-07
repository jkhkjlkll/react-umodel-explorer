package com.alibaba.umodel.sdk.client;

import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UpdateWorkspaceRequest;
import com.alibaba.umodel.sdk.model.UModelCodec;
import com.alibaba.umodel.sdk.model.UModelObject;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UModelClientTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    private HttpServer server;
    private final List<RequestRecord> requests = new ArrayList<>();
    private UModelClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
        client = UModelClient.builder(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
                .bearerToken("sdk-token")
                .header("X-UModel-Test", "true")
                .build();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void coversPublicRestContractAndModelSdkBridge() {
        assertEquals("ok", client.serviceIndex().path("status").asText());
        assertEquals("memory", client.health().path("graphstore").path("provider").asText());
        assertEquals("demo", client.createWorkspace(new CreateWorkspaceRequest("demo", "Demo", null, Map.of(), Map.of())).id());
        assertEquals(1, client.listWorkspaces(new UModelClient.WorkspaceListOptions(20, "next token", false, true)).items().size());
        assertEquals("page_size=20&page_token=next%20token&include_deleted=false&include_conflicts=true", request("GET", "/api/v1/workspaces").query());
        assertEquals("demo", client.getWorkspace("demo").id());
        assertEquals("Updated", client.updateWorkspace("demo", new UpdateWorkspaceRequest("Updated", null, null, null, null, null, null)).name());

        UModelObject model = new UModelCodec().parseYaml("""
                kind: entity_set
                schema: {version: v1.0.0}
                metadata: {domain: devops, name: devops.service}
                spec: {primary_key_fields: [id]}
                """);
        assertTrue(client.validateModelObjects("demo", List.of(model)).valid());
        assertEquals(1, client.putModelObjects("demo", List.of(model)).accepted());
        assertEquals("demo", request("POST", "/api/v1/umodel/demo/elements").body().path("workspace").asText());
        assertEquals("devops.service", request("POST", "/api/v1/umodel/demo/elements").body().path("elements").get(0).path("name").asText());
        assertEquals("v1.0.0", request("POST", "/api/v1/umodel/demo/elements").body().path("elements").get(0).path("version").asText());

        assertEquals(1, client.importUModel("demo", new UModelImportRequest("/models", null)).imported());
        assertEquals(1, client.deleteUModelElements("demo", List.of("entity_set:devops:devops.service")).accepted());
        assertEquals(1, client.writeEntities("demo", List.of(Map.of("__entity_id__", "service-1"))).accepted());
        assertEquals(1, client.expireEntities("demo", List.of("service-1"), "gone").accepted());
        assertEquals("gone", request("POST", "/api/v1/entitystore/demo/entities:expire").body().path("reason").asText());
        assertEquals(1, client.writeRelations("demo", List.of(Map.of("__relation_id__", "r-1"))).accepted());
        assertEquals(1, client.expireRelations("demo", List.of("r-1"), "gone").accepted());
        assertEquals("demo", client.importQuickstartSample("demo").workspace());

        QueryRequest query = new QueryRequest(".umodel | limit 1", Map.of(), 1, null, null, null);
        assertTrue(client.executeQuery("demo", query).success());
        assertEquals(".umodel", client.explainQuery("demo", query).source());
        assertEquals("1.1", client.executeAgentQuery("demo", query, true).path("version").asText());
        assertEquals("demo", client.discoverAgent("demo").workspace());
        assertTrue(client.executeAgentTool("demo", new AgentToolCallRequest("query_spl_examples", Map.of())).ok());
        assertEquals("text/toon", client.readAgentResource("demo", new AgentResourceReadRequest("umodel://workspace/demo/overview")).mimeType());
        assertEquals("demo", client.deleteWorkspace("demo").id());

        assertEquals("Bearer sdk-token", requests.get(0).authorization());
        assertEquals("true", requests.get(0).testHeader());
        assertFalse(requests.isEmpty());
    }

    @Test
    void exposesStructuredServiceErrors() {
        UModelClientException error = assertThrows(UModelClientException.class, () -> client.getWorkspace("missing"));
        assertEquals(404, error.statusCode());
        assertEquals("NotFound", error.errorCode());
        assertFalse(error.retryable());
        assertTrue(error.responseBody().contains("workspace not found"));
    }

    private void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        byte[] raw = exchange.getRequestBody().readAllBytes();
        JsonNode body = raw.length == 0 ? JSON.createObjectNode() : JSON.readTree(raw);
        requests.add(new RequestRecord(
                method,
                path,
                exchange.getRequestURI().getRawQuery(),
                body,
                exchange.getRequestHeaders().getFirst("Authorization"),
                exchange.getRequestHeaders().getFirst("X-UModel-Test")
        ));

        int status = 200;
        String response;
        if ("GET".equals(method) && "/".equals(path)) {
            response = "{\"status\":\"ok\"}";
        } else if ("GET".equals(method) && "/healthz".equals(path)) {
            response = "{\"status\":\"ok\",\"graphstore\":{\"provider\":\"memory\",\"status\":\"ok\"}}";
        } else if ("POST".equals(method) && "/api/v1/workspaces".equals(path)) {
            status = 201;
            response = workspace();
        } else if ("GET".equals(method) && "/api/v1/workspaces".equals(path)) {
            response = "{\"items\":[" + workspace() + "]}";
        } else if ("GET".equals(method) && "/api/v1/workspaces/missing".equals(path)) {
            status = 404;
            response = "{\"error\":{\"code\":\"NotFound\",\"message\":\"workspace not found\",\"retryable\":false}}";
        } else if ("GET".equals(method) && "/api/v1/workspaces/demo".equals(path)) {
            response = workspace();
        } else if ("PUT".equals(method) && "/api/v1/workspaces/demo".equals(path)) {
            response = workspace().replace("\"Demo\"", "\"Updated\"");
        } else if ("DELETE".equals(method) && "/api/v1/workspaces/demo".equals(path)) {
            response = workspace().replace("\"active\"", "\"deleted\"");
        } else if (path.endsWith("/validate")) {
            response = "{\"valid\":true,\"errors\":[],\"warnings\":[]}";
        } else if (path.endsWith("/import") && path.contains("/umodel/")) {
            response = "{\"workspace\":\"demo\",\"source\":\"/models\",\"imported\":1,\"skipped\":0,\"elements\":[],\"errors\":[]}";
        } else if (path.endsWith("/elements") || path.contains("/entitystore/")) {
            response = "{\"accepted\":1,\"failed\":0,\"items\":[],\"warnings\":[]}";
        } else if (path.endsWith("multi-domain-quickstart:import")) {
            response = "{\"workspace\":\"demo\",\"sample\":\"multi-domain-quickstart\",\"entity_count\":1,\"relation_count\":1}";
        } else if (path.endsWith("/execute") && path.contains("/query/")) {
            if (exchange.getRequestURI().getRawQuery() != null) {
                response = "{\"version\":\"1.1\",\"type\":\"query_plan\"}";
            } else {
                response = "{\"code\":\"OK\",\"data\":{\"data\":[],\"header\":[],\"responseStatus\":{\"result\":\"success\"}},\"message\":\"\",\"success\":true}";
            }
        } else if (path.endsWith("/explain")) {
            response = "{\"source\":\".umodel\",\"provider\":\"memory\",\"storage_provider\":\"memory\"}";
        } else if (path.endsWith("/discover")) {
            response = "{\"workspace\":\"demo\",\"tools\":[],\"resources\":[],\"next_actions\":[]}";
        } else if (path.endsWith("/tools:execute")) {
            response = "{\"name\":\"query_spl_examples\",\"ok\":true,\"output\":[]}";
        } else if (path.endsWith("/resources:read")) {
            response = "{\"uri\":\"umodel://workspace/demo/overview\",\"mime_type\":\"text/toon\",\"content\":\"status: ok\"}";
        } else {
            status = 404;
            response = "{\"error\":{\"code\":\"NotFound\",\"message\":\"unexpected test path\",\"retryable\":false}}";
        }
        byte[] encoded = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, encoded.length);
        exchange.getResponseBody().write(encoded);
        exchange.close();
    }

    private RequestRecord request(String method, String path) {
        return requests.stream()
                .filter(item -> method.equals(item.method()) && path.equals(item.path()))
                .findFirst()
                .orElseThrow();
    }

    private static String workspace() {
        return "{\"id\":\"demo\",\"name\":\"Demo\",\"status\":\"active\",\"resource_version\":1}";
    }

    private record RequestRecord(
            String method,
            String path,
            String query,
            JsonNode body,
            String authorization,
            String testHeader
    ) {
    }
}
