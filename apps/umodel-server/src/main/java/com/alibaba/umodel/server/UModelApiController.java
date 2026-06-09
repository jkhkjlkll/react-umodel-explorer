package com.alibaba.umodel.server;

import com.alibaba.umodel.agentgateway.AgentGatewayService;
import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadResult;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallResult;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.ExpireRequest;
import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.contract.UModelModels.QueryExecuteData;
import com.alibaba.umodel.contract.UModelModels.QueryExecuteResponse;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.QueryResponseStatus;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UpdateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.graphstore.GraphStore;
import com.alibaba.umodel.query.QueryService;
import com.alibaba.umodel.sampledata.SampleDataService;
import com.alibaba.umodel.umodel.UModelService;
import com.alibaba.umodel.workspace.WorkspaceService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping
public class UModelApiController {
    private final WorkspaceService workspaceService;
    private final GraphStore graphStore;
    private final UModelService uModelService;
    private final EntityStoreService entityStoreService;
    private final QueryService queryService;
    private final AgentGatewayService agentGatewayService;
    private final SampleDataService sampleDataService;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    public UModelApiController(
            WorkspaceService workspaceService,
            GraphStore graphStore,
            UModelService uModelService,
            EntityStoreService entityStoreService,
            QueryService queryService,
            AgentGatewayService agentGatewayService,
            SampleDataService sampleDataService
    ) {
        this.workspaceService = workspaceService;
        this.graphStore = graphStore;
        this.uModelService = uModelService;
        this.entityStoreService = entityStoreService;
        this.queryService = queryService;
        this.agentGatewayService = agentGatewayService;
        this.sampleDataService = sampleDataService;
    }

    @GetMapping("/")
    public Map<String, Object> serviceIndex() {
        GraphStoreHealth health = graphStore.health();
        return Map.of(
                "service", "umodel-server-java",
                "status", "ok",
                "graphstore", health,
                "endpoints", Map.of(
                        "health", "/healthz",
                        "workspaces", "/api/v1/workspaces",
                        "samples", "/api/v1/samples/{workspace}/multi-domain-quickstart:import",
                        "query", "/api/v1/query/{workspace}/execute",
                        "queryExplain", "/api/v1/query/{workspace}/explain",
                        "agent", "/api/v1/agent/{workspace}/discover",
                        "mcp", "/mcp"
                )
        );
    }

    @GetMapping("/healthz")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "graphstore", graphStore.health());
    }

    @PostMapping("/api/v1/workspaces")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceMetadata createWorkspace(@RequestBody CreateWorkspaceRequest request) {
        WorkspaceMetadata metadata = workspaceService.createWorkspace(request);
        graphStore.openWorkspace(metadata);
        return metadata;
    }

    @GetMapping("/api/v1/workspaces")
    public Object listWorkspaces(@RequestParam(name = "include_deleted", defaultValue = "false") boolean includeDeleted) {
        return workspaceService.listWorkspaces(includeDeleted);
    }

    @GetMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata getWorkspace(@PathVariable String workspace) {
        return workspaceService.getWorkspace(workspace);
    }

    @PutMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata updateWorkspace(@PathVariable String workspace, @RequestBody UpdateWorkspaceRequest request) {
        return workspaceService.updateWorkspace(workspace, request);
    }

    @DeleteMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata deleteWorkspace(@PathVariable String workspace) {
        return workspaceService.deleteWorkspace(workspace);
    }

    @PostMapping("/api/v1/umodel/{workspace}/validate")
    public ValidationResult validateUModel(@PathVariable String workspace, @RequestBody UModelElementBatch request) {
        return uModelService.validate(workspace, request == null ? List.of() : request.elements());
    }

    @PostMapping("/api/v1/umodel/{workspace}/import")
    public Object importUModel(@PathVariable String workspace, @RequestBody UModelImportRequest request) {
        return uModelService.importElements(workspace, request);
    }

    @PostMapping("/api/v1/umodel/{workspace}/elements")
    public WriteResult putUModelElements(@PathVariable String workspace, @RequestBody UModelElementBatch request) {
        return uModelService.putElements(workspace, request);
    }

    @DeleteMapping("/api/v1/umodel/{workspace}/elements")
    public WriteResult deleteUModelElements(@PathVariable String workspace, @RequestBody Map<String, List<String>> request) {
        return uModelService.deleteElements(workspace, request == null ? List.of() : request.get("ids"));
    }

    @PostMapping("/api/v1/entitystore/{workspace}/entities:write")
    public WriteResult writeEntities(@PathVariable String workspace, @RequestBody EntityWriteBatch request) {
        return entityStoreService.writeEntities(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/entities:expire")
    public WriteResult expireEntities(@PathVariable String workspace, @RequestBody ExpireRequest request) {
        return entityStoreService.expireEntities(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/relations:write")
    public WriteResult writeRelations(@PathVariable String workspace, @RequestBody RelationWriteBatch request) {
        return entityStoreService.writeRelations(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/relations:expire")
    public WriteResult expireRelations(@PathVariable String workspace, @RequestBody ExpireRequest request) {
        return entityStoreService.expireRelations(workspace, request);
    }

    @PostMapping("/api/v1/samples/{workspace}/multi-domain-quickstart:import")
    public Object importQuickstart(@PathVariable String workspace) {
        ensureWorkspace(workspace);
        return sampleDataService.importSample(workspace, SampleDataService.MULTI_DOMAIN_QUICKSTART);
    }

    @PostMapping("/api/v1/query/{workspace}/execute")
    public QueryExecuteResponse executeQuery(@PathVariable String workspace, @RequestBody QueryRequest request) {
        return queryExecuteResponse(queryService.execute(workspace, request));
    }

    @PostMapping("/api/v1/query/{workspace}/explain")
    public Object explainQuery(@PathVariable String workspace, @RequestBody QueryRequest request) {
        return queryService.explain(workspace, request);
    }

    @GetMapping("/api/v1/agent/{workspace}/discover")
    public Object discoverAgent(@PathVariable String workspace) {
        return agentGatewayService.discover(workspace);
    }

    @PostMapping("/api/v1/agent/{workspace}/tools:execute")
    public Object executeAgentTool(@PathVariable String workspace, @RequestBody AgentToolCallRequest request) {
        return agentGatewayService.executeTool(workspace, request);
    }

    @PostMapping("/api/v1/agent/{workspace}/resources:read")
    public Object readAgentResource(@PathVariable String workspace, @RequestBody AgentResourceReadRequest request) {
        return agentGatewayService.readResource(workspace, request);
    }

    @PostMapping("/mcp")
    public Object mcp(@RequestBody Object request) {
        if (request instanceof List<?> batch) {
            return batch.stream().map(item -> mcpRequest(asMap(item))).toList();
        }
        return mcpRequest(asMap(request));
    }

    private void ensureWorkspace(String workspace) {
        try {
            workspaceService.getWorkspace(workspace);
        } catch (UModelException e) {
            if (!ErrorCodes.NOT_FOUND.equals(e.code())) {
                throw e;
            }
            createWorkspace(new CreateWorkspaceRequest(
                    workspace,
                    "Demo",
                    "Multi-domain quickstart demo",
                    Map.of("umodel.io/quickstart", "true"),
                    Map.of()
            ));
        }
    }

    private static QueryExecuteResponse queryExecuteResponse(QueryResult result) {
        List<String> header = queryMatrixHeader(result.columns(), result.rows());
        return new QueryExecuteResponse(
                "200",
                new QueryExecuteData(
                        queryRowsAsMatrix(header, result.rows()),
                        header,
                        new QueryResponseStatus("Success", "None", "Info", List.of())
                ),
                "successful",
                true
        );
    }

    private static List<String> queryMatrixHeader(List<String> columns, List<Map<String, Object>> rows) {
        List<String> header = new ArrayList<>(columns == null ? List.of() : columns);
        Map<String, Boolean> seen = new LinkedHashMap<>();
        for (String column : header) {
            seen.put(column, true);
        }
        for (Map<String, Object> row : rows == null ? List.<Map<String, Object>>of() : rows) {
            for (String key : row.keySet()) {
                if (!seen.containsKey(key)) {
                    seen.put(key, true);
                    header.add(key);
                }
            }
        }
        return header;
    }

    private static List<List<Object>> queryRowsAsMatrix(List<String> header, List<Map<String, Object>> rows) {
        List<List<Object>> matrix = new ArrayList<>();
        for (Map<String, Object> row : rows == null ? List.<Map<String, Object>>of() : rows) {
            List<Object> values = new ArrayList<>();
            for (String column : header) {
                values.add(row.get(column));
            }
            matrix.add(values);
        }
        return matrix;
    }

    private Map<String, Object> mcpRequest(Map<String, Object> request) {
        Object id = request.get("id");
        try {
            String method = Objects.toString(request.get("method"), "");
            Map<String, Object> params = asMap(request.get("params"));
            String workspace = workspace(params);
            return switch (method) {
                case "initialize" -> jsonRpcResult(id, Map.of(
                        "protocolVersion", Objects.toString(params.get("protocolVersion"), "2025-06-18"),
                        "serverInfo", Map.of("name", "umodel-server-java", "version", "0.1.0-SNAPSHOT"),
                        "capabilities", Map.of(
                                "tools", Map.of(),
                                "resources", Map.of()
                        )
                ));
                case "notifications/initialized", "ping", "logging/setLevel" -> jsonRpcResult(id, Map.of());
                case "tools/list" -> jsonRpcResult(id, Map.of("tools", agentGatewayService.tools()));
                case "tools/call" -> jsonRpcResult(id, mcpToolResult(workspace, params));
                case "resources/list" -> jsonRpcResult(id, Map.of("resources", agentGatewayService.discover(workspace).resources()));
                case "resources/templates/list" -> jsonRpcResult(id, Map.of("resourceTemplates", List.of()));
                case "resources/read" -> jsonRpcResult(id, mcpResourceResult(workspace, params));
                case "prompts/list" -> jsonRpcResult(id, Map.of("prompts", List.of()));
                case "discovery" -> jsonRpcResult(id, agentGatewayService.discover(workspace));
                default -> jsonRpcError(id, -32601, "method not found: " + method);
            };
        } catch (UModelException e) {
            return jsonRpcError(id, mcpErrorCode(e.code()), e.getMessage());
        } catch (RuntimeException e) {
            return jsonRpcError(id, -32603, e.getMessage());
        }
    }

    private Map<String, Object> mcpToolResult(String workspace, Map<String, Object> params) {
        AgentToolCallResult result = agentGatewayService.executeTool(
                workspace,
                new AgentToolCallRequest(
                        Objects.toString(params.get("name"), ""),
                        asMap(params.get("arguments"))
                )
        );
        return Map.of(
                "content", List.of(Map.of(
                        "type", "text",
                        "mimeType", "application/json",
                        "text", json(result.output())
                )),
                "structuredContent", result.output(),
                "isError", !result.ok()
        );
    }

    private Map<String, Object> mcpResourceResult(String workspace, Map<String, Object> params) {
        AgentResourceReadResult result = agentGatewayService.readResource(
                workspace,
                new AgentResourceReadRequest(Objects.toString(params.get("uri"), ""))
        );
        return Map.of(
                "contents", List.of(Map.of(
                        "uri", result.uri(),
                        "mimeType", result.mimeType(),
                        "text", json(result.content())
                ))
        );
    }

    private static Map<String, Object> jsonRpcResult(Object id, Object result) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("result", result);
        return response;
    }

    private static Map<String, Object> jsonRpcError(Object id, int code, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("error", Map.of(
                "code", code,
                "message", message == null ? "MCP request failed" : message
        ));
        return response;
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "failed to encode MCP content");
        }
    }

    private static int mcpErrorCode(String code) {
        return switch (code) {
            case ErrorCodes.TOOL_NOT_FOUND, ErrorCodes.NOT_FOUND -> -32601;
            case ErrorCodes.INVALID_ARGUMENT, ErrorCodes.VALIDATION_FAILED -> -32602;
            default -> -32000;
        };
    }

    private static String workspace(Map<String, Object> params) {
        Object workspace = params.get("workspace");
        return workspace == null || Objects.toString(workspace, "").isBlank()
                ? "demo"
                : Objects.toString(workspace, "");
    }

    private static Map<String, Object> asMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            copy.put(Objects.toString(entry.getKey(), ""), entry.getValue());
        }
        return copy;
    }
}
