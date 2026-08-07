package com.alibaba.umodel.sdk.client;

import com.alibaba.umodel.contract.UModelModels.AgentDiscovery;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadResult;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallResult;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.Page;
import com.alibaba.umodel.contract.UModelModels.QueryExecuteResponse;
import com.alibaba.umodel.contract.UModelModels.QueryExplain;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.SampleImportResult;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UModelImportResult;
import com.alibaba.umodel.contract.UModelModels.UpdateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.sdk.model.UModelObject;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class UModelClient {
    private static final TypeReference<Page<WorkspaceMetadata>> WORKSPACE_PAGE = new TypeReference<>() { };

    private final URI baseUri;
    private final HttpClient httpClient;
    private final ObjectMapper json;
    private final Duration requestTimeout;
    private final Map<String, String> defaultHeaders;

    public UModelClient(URI baseUri) {
        this(builder(baseUri));
    }

    private UModelClient(Builder builder) {
        this.baseUri = normalize(builder.baseUri);
        this.requestTimeout = builder.requestTimeout;
        this.httpClient = builder.httpClient == null
                ? HttpClient.newBuilder().connectTimeout(builder.connectTimeout).build()
                : builder.httpClient;
        this.json = builder.objectMapper == null ? defaultMapper() : builder.objectMapper.copy();
        this.defaultHeaders = Map.copyOf(builder.defaultHeaders);
    }

    public static Builder builder(URI baseUri) {
        return new Builder(baseUri);
    }

    public JsonNode serviceIndex() {
        return request("GET", "/", null, JsonNode.class);
    }

    public JsonNode health() {
        return request("GET", "/healthz", null, JsonNode.class);
    }

    public WorkspaceMetadata createWorkspace(CreateWorkspaceRequest body) {
        return request("POST", "/api/v1/workspaces", body, WorkspaceMetadata.class);
    }

    public Page<WorkspaceMetadata> listWorkspaces(boolean includeDeleted) {
        return listWorkspaces(new WorkspaceListOptions(null, null, includeDeleted, false));
    }

    public Page<WorkspaceMetadata> listWorkspaces(WorkspaceListOptions options) {
        WorkspaceListOptions value = options == null ? new WorkspaceListOptions(null, null, false, false) : options;
        List<String> parameters = new ArrayList<>();
        if (value.pageSize() != null) {
            if (value.pageSize() < 1 || value.pageSize() > 100) {
                throw new IllegalArgumentException("pageSize must be between 1 and 100");
            }
            parameters.add("page_size=" + value.pageSize());
        }
        if (value.pageToken() != null && !value.pageToken().isBlank()) {
            parameters.add("page_token=" + queryValue(value.pageToken()));
        }
        parameters.add("include_deleted=" + value.includeDeleted());
        parameters.add("include_conflicts=" + value.includeConflicts());
        return request("GET", "/api/v1/workspaces?" + String.join("&", parameters), null, WORKSPACE_PAGE);
    }

    public WorkspaceMetadata getWorkspace(String workspace) {
        return request("GET", workspacePath("/api/v1/workspaces/", workspace), null, WorkspaceMetadata.class);
    }

    public WorkspaceMetadata updateWorkspace(String workspace, UpdateWorkspaceRequest body) {
        return request("PUT", workspacePath("/api/v1/workspaces/", workspace), body, WorkspaceMetadata.class);
    }

    public WorkspaceMetadata deleteWorkspace(String workspace) {
        return request("DELETE", workspacePath("/api/v1/workspaces/", workspace), null, WorkspaceMetadata.class);
    }

    public ValidationResult validateUModel(String workspace, List<UModelElement> elements) {
        UModelElementBatch body = new UModelElementBatch(workspace, immutable(elements), false, null);
        return request("POST", workspacePath("/api/v1/umodel/", workspace) + "/validate", body, ValidationResult.class);
    }

    public ValidationResult validateModelObjects(String workspace, List<? extends UModelObject> objects) {
        return validateUModel(workspace, toElements(objects));
    }

    public UModelImportResult importUModel(String workspace, UModelImportRequest body) {
        return request("POST", workspacePath("/api/v1/umodel/", workspace) + "/import", body, UModelImportResult.class);
    }

    public WriteResult putUModelElements(String workspace, List<UModelElement> elements) {
        UModelElementBatch body = new UModelElementBatch(workspace, immutable(elements), false, null);
        return request("POST", workspacePath("/api/v1/umodel/", workspace) + "/elements", body, WriteResult.class);
    }

    public WriteResult putModelObjects(String workspace, List<? extends UModelObject> objects) {
        return putUModelElements(workspace, toElements(objects));
    }

    public WriteResult deleteUModelElements(String workspace, List<String> ids) {
        return request(
                "DELETE",
                workspacePath("/api/v1/umodel/", workspace) + "/elements",
                Map.of("ids", immutable(ids)),
                WriteResult.class
        );
    }

    public WriteResult writeEntities(String workspace, List<Map<String, Object>> entities) {
        EntityWriteBatch body = new EntityWriteBatch(workspace, null, false, immutable(entities));
        return request("POST", workspacePath("/api/v1/entitystore/", workspace) + "/entities:write", body, WriteResult.class);
    }

    public WriteResult expireEntities(String workspace, List<String> ids, String reason) {
        return request(
                "POST",
                workspacePath("/api/v1/entitystore/", workspace) + "/entities:expire",
                new ExpireBody(workspace, immutable(ids), reason),
                WriteResult.class
        );
    }

    public WriteResult writeRelations(String workspace, List<Map<String, Object>> relations) {
        RelationWriteBatch body = new RelationWriteBatch(workspace, null, false, immutable(relations));
        return request("POST", workspacePath("/api/v1/entitystore/", workspace) + "/relations:write", body, WriteResult.class);
    }

    public WriteResult expireRelations(String workspace, List<String> ids, String reason) {
        return request(
                "POST",
                workspacePath("/api/v1/entitystore/", workspace) + "/relations:expire",
                new ExpireBody(workspace, immutable(ids), reason),
                WriteResult.class
        );
    }

    public SampleImportResult importQuickstartSample(String workspace) {
        return request(
                "POST",
                workspacePath("/api/v1/samples/", workspace) + "/multi-domain-quickstart:import",
                null,
                SampleImportResult.class
        );
    }

    public QueryExecuteResponse executeQuery(String workspace, QueryRequest body) {
        return executeQuery(workspace, body, QueryExecuteResponse.class);
    }

    public JsonNode executeAgentQuery(String workspace, QueryRequest body, boolean includeSpec) {
        String path = workspacePath("/api/v1/query/", workspace) + "/execute?format=agent";
        if (includeSpec) {
            path += "&include=spec";
        }
        return request("POST", path, body, JsonNode.class);
    }

    public <T> T executeQuery(String workspace, QueryRequest body, Class<T> responseType) {
        return request("POST", workspacePath("/api/v1/query/", workspace) + "/execute", body, responseType);
    }

    public QueryExplain explainQuery(String workspace, QueryRequest body) {
        return request("POST", workspacePath("/api/v1/query/", workspace) + "/explain", body, QueryExplain.class);
    }

    public AgentDiscovery discoverAgent(String workspace) {
        return request("GET", workspacePath("/api/v1/agent/", workspace) + "/discover", null, AgentDiscovery.class);
    }

    public AgentToolCallResult executeAgentTool(String workspace, AgentToolCallRequest body) {
        return request("POST", workspacePath("/api/v1/agent/", workspace) + "/tools:execute", body, AgentToolCallResult.class);
    }

    public AgentResourceReadResult readAgentResource(String workspace, AgentResourceReadRequest body) {
        return request("POST", workspacePath("/api/v1/agent/", workspace) + "/resources:read", body, AgentResourceReadResult.class);
    }

    public URI baseUri() {
        return baseUri;
    }

    public static List<UModelElement> toElements(List<? extends UModelObject> objects) {
        List<UModelElement> elements = new ArrayList<>();
        if (objects == null) {
            return elements;
        }
        for (UModelObject object : objects) {
            if (object == null) {
                continue;
            }
            elements.add(new UModelElement(
                    null,
                    object.getKind(),
                    object.domain(),
                    object.name(),
                    object.getSpec(),
                    object.getMetadata(),
                    object.schemaVersion()
            ));
        }
        return elements;
    }

    private <T> T request(String method, String path, Object body, Class<T> responseType) {
        String responseBody = send(method, path, body);
        if (responseType == null || responseBody == null || responseBody.isBlank()) {
            return null;
        }
        try {
            return json.readValue(responseBody, responseType);
        } catch (JsonProcessingException error) {
            throw new UModelClientException("cannot decode UModel response: " + error.getOriginalMessage(), method, URI.create(baseUri + path), error);
        }
    }

    private <T> T request(String method, String path, Object body, TypeReference<T> responseType) {
        String responseBody = send(method, path, body);
        if (responseType == null || responseBody == null || responseBody.isBlank()) {
            return null;
        }
        try {
            return json.readValue(responseBody, responseType);
        } catch (JsonProcessingException error) {
            throw new UModelClientException("cannot decode UModel response: " + error.getOriginalMessage(), method, URI.create(baseUri + path), error);
        }
    }

    private String send(String method, String path, Object body) {
        URI uri = URI.create(baseUri + path);
        HttpRequest.Builder request = HttpRequest.newBuilder(uri).timeout(requestTimeout).header("Accept", "application/json");
        defaultHeaders.forEach(request::header);
        if (body == null) {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            request.header("Content-Type", "application/json");
            request.method(method, HttpRequest.BodyPublishers.ofString(encode(body)));
        }
        try {
            HttpResponse<String> response = httpClient.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) {
                throw serviceError(method, uri, response.statusCode(), response.body());
            }
            return response.body();
        } catch (UModelClientException error) {
            throw error;
        } catch (IOException error) {
            throw new UModelClientException("UModel request failed: " + error.getMessage(), method, uri, error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new UModelClientException("UModel request was interrupted", method, uri, error);
        }
    }

    private String encode(Object body) {
        try {
            return json.writeValueAsString(body);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("cannot encode UModel request", error);
        }
    }

    private UModelClientException serviceError(String method, URI uri, int status, String body) {
        String code = "Http" + status;
        String message = "UModel service returned HTTP " + status;
        boolean retryable = status == 429 || status >= 500;
        try {
            JsonNode error = json.readTree(body).path("error");
            if (error.isObject()) {
                code = error.path("code").asText(code);
                message = error.path("message").asText(message);
                retryable = error.path("retryable").asBoolean(retryable);
            }
        } catch (JsonProcessingException ignored) {
            // Keep the HTTP fallback and preserve the raw response body below.
        }
        return new UModelClientException(message, status, method, uri, code, retryable, body);
    }

    private static URI normalize(URI value) {
        Objects.requireNonNull(value, "baseUri");
        String scheme = value.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("baseUri must use http or https");
        }
        String text = value.toString();
        while (text.endsWith("/")) {
            text = text.substring(0, text.length() - 1);
        }
        return URI.create(text);
    }

    private static String workspacePath(String prefix, String workspace) {
        if (workspace == null || workspace.isBlank()) {
            throw new IllegalArgumentException("workspace is required");
        }
        return prefix + queryValue(workspace);
    }

    private static String queryValue(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static ObjectMapper defaultMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }

    private static <T> List<T> immutable(List<T> value) {
        return value == null ? List.of() : List.copyOf(value);
    }

    private record ExpireBody(String workspace, List<String> ids, String reason) {
    }

    public record WorkspaceListOptions(
            Integer pageSize,
            String pageToken,
            boolean includeDeleted,
            boolean includeConflicts
    ) {
    }

    public static final class Builder {
        private final URI baseUri;
        private HttpClient httpClient;
        private ObjectMapper objectMapper;
        private Duration connectTimeout = Duration.ofSeconds(10);
        private Duration requestTimeout = Duration.ofSeconds(30);
        private final Map<String, String> defaultHeaders = new LinkedHashMap<>();

        private Builder(URI baseUri) {
            this.baseUri = Objects.requireNonNull(baseUri, "baseUri");
        }

        public Builder httpClient(HttpClient httpClient) {
            this.httpClient = Objects.requireNonNull(httpClient, "httpClient");
            return this;
        }

        public Builder objectMapper(ObjectMapper objectMapper) {
            this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
            return this;
        }

        public Builder connectTimeout(Duration connectTimeout) {
            this.connectTimeout = positive(connectTimeout, "connectTimeout");
            return this;
        }

        public Builder requestTimeout(Duration requestTimeout) {
            this.requestTimeout = positive(requestTimeout, "requestTimeout");
            return this;
        }

        public Builder header(String name, String value) {
            defaultHeaders.put(Objects.requireNonNull(name, "name"), Objects.requireNonNull(value, "value"));
            return this;
        }

        public Builder bearerToken(String token) {
            return header("Authorization", "Bearer " + Objects.requireNonNull(token, "token"));
        }

        public UModelClient build() {
            return new UModelClient(this);
        }

        private static Duration positive(Duration value, String name) {
            Objects.requireNonNull(value, name);
            if (value.isZero() || value.isNegative()) {
                throw new IllegalArgumentException(name + " must be positive");
            }
            return value;
        }
    }
}
