package com.alibaba.umodel.mcpstdio;

import com.alibaba.umodel.agentgateway.AgentGatewayService;
import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadResult;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallResult;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.graphstore.GraphStore;
import com.alibaba.umodel.graphstore.file.FileMemoryGraphStore;
import com.alibaba.umodel.graphstore.ladybug.LadybugGraphStore;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;
import com.alibaba.umodel.query.QueryService;
import com.alibaba.umodel.sampledata.SampleDataService;
import com.alibaba.umodel.umodel.UModelService;
import com.alibaba.umodel.workspace.WorkspaceService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class UModelMcpStdioApplication {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();

    private final String workspace;
    private final GraphStore graphStore;
    private final WorkspaceService workspaceService;
    private final AgentGatewayService agentGatewayService;
    private final SampleDataService sampleDataService;

    public UModelMcpStdioApplication(String workspace, GraphStore graphStore, boolean writeEnabled) {
        this.workspace = workspace;
        this.graphStore = graphStore;
        this.workspaceService = new WorkspaceService();
        UModelService uModelService = new UModelService(graphStore);
        EntityStoreService entityStoreService = new EntityStoreService(graphStore);
        QueryService queryService = new QueryService(graphStore);
        this.agentGatewayService = new AgentGatewayService(queryService, uModelService, entityStoreService, writeEnabled);
        this.sampleDataService = new SampleDataService(uModelService, entityStoreService);
    }

    public static void main(String[] args) throws IOException {
        Map<String, String> flags = flags(args);
        String workspace = flags.getOrDefault("workspace", "demo");
        GraphStore graphStore = graphStore(flags.getOrDefault("graphstore", "memory"), flags.getOrDefault("data-root", "data"));
        UModelMcpStdioApplication app = new UModelMcpStdioApplication(
                workspace,
                graphStore,
                Boolean.parseBoolean(flags.getOrDefault("agent-write-enabled", "false"))
        );
        if (Boolean.parseBoolean(flags.getOrDefault("quickstart", "false"))) {
            app.ensureWorkspace(workspace);
            app.sampleDataService.importSample(workspace, SampleDataService.MULTI_DOMAIN_QUICKSTART);
        }
        app.run();
    }

    private void run() throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                Object response = rpc(asMap(JSON.readValue(line, Object.class)));
                if (response != null) {
                    System.out.println(JSON.writeValueAsString(response));
                    System.out.flush();
                }
            }
        }
    }

    private Map<String, Object> rpc(Map<String, Object> request) {
        Object id = request.get("id");
        try {
            String method = Objects.toString(request.get("method"), "");
            Map<String, Object> params = asMap(request.get("params"));
            String targetWorkspace = Objects.toString(params.getOrDefault("workspace", workspace), workspace);
            return switch (method) {
                case "initialize" -> result(id, initialize(targetWorkspace, params));
                case "notifications/initialized", "notifications/cancelled" -> null;
                case "ping", "logging/setLevel" -> result(id, Map.of());
                case "tools/list" -> result(id, Map.of("tools", agentGatewayService.tools()));
                case "tools/call" -> result(id, toolResult(targetWorkspace, params));
                case "resources/list" -> result(id, Map.of("resources", agentGatewayService.discover(targetWorkspace).resources()));
                case "resources/read" -> result(id, resourceResult(targetWorkspace, params));
                case "resources/templates/list" -> result(id, Map.of("resourceTemplates", resourceTemplates(targetWorkspace)));
                case "prompts/list" -> result(id, Map.of("prompts", prompts()));
                case "prompts/get" -> result(id, prompt(targetWorkspace, params));
                case "completion/complete" -> result(id, completion(targetWorkspace, params));
                case "discovery", "umodel/discovery" -> result(id, agentGatewayService.discover(targetWorkspace));
                default -> error(id, -32601, "method not found: " + method);
            };
        } catch (UModelException e) {
            return error(id, mcpErrorCode(e.code()), e.getMessage());
        } catch (RuntimeException e) {
            return error(id, -32603, e.getMessage());
        }
    }

    private Map<String, Object> toolResult(String workspace, Map<String, Object> params) {
        AgentToolCallResult result = agentGatewayService.executeTool(
                workspace,
                new AgentToolCallRequest(Objects.toString(params.get("name"), ""), asMap(params.get("arguments")))
        );
        Map<String, Object> textContent = new LinkedHashMap<>();
        textContent.put("type", "text");
        textContent.put("mimeType", "application/json");
        textContent.put("text", json(result.output()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", List.of(textContent));
        out.put("structuredContent", result.output());
        out.put("isError", !result.ok());
        return out;
    }

    private Map<String, Object> initialize(String workspace, Map<String, Object> params) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("protocolVersion", Objects.toString(params.getOrDefault("protocolVersion", "2025-06-18")));
        out.put("serverInfo", Map.of("name", "umodel-java-mcp-stdio", "version", "0.1.0-SNAPSHOT"));
        out.put("capabilities", Map.of(
                "tools", Map.of("listChanged", false),
                "resources", Map.of("listChanged", false),
                "prompts", Map.of("listChanged", false)
        ));
        out.put("discovery", agentGatewayService.discover(workspace));
        return out;
    }

    private Map<String, Object> resourceResult(String workspace, Map<String, Object> params) {
        AgentResourceReadResult result = agentGatewayService.readResource(
                workspace,
                new AgentResourceReadRequest(Objects.toString(params.get("uri"), ""))
        );
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("uri", result.uri());
        content.put("mimeType", result.mimeType());
        content.put("text", json(result.content()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("contents", List.of(content));
        return out;
    }

    private static List<Map<String, Object>> prompts() {
        return List.of(
                Map.of(
                        "name", "query",
                        "title", "Use UModel Query Service",
                        "description", "Run or refine a UModel SPL query.",
                        "arguments", List.of(Map.of("name", "query", "required", false))
                ),
                Map.of(
                        "name", "context",
                        "title", "Review UModel Object Graph Context",
                        "description", "Inspect model metadata before querying runtime rows.",
                        "arguments", List.of(Map.of("name", "focus", "required", false))
                )
        );
    }

    private static List<Map<String, Object>> resourceTemplates(String workspace) {
        return List.of(
                Map.of(
                        "name", "workspace-resource",
                        "uriTemplate", "umodel://workspace/" + workspace + "/{resource}",
                        "description", "Read a UModel workspace metadata resource.",
                        "mimeType", "text/toon"
                )
        );
    }

    private static Map<String, Object> prompt(String workspace, Map<String, Object> params) {
        String name = Objects.toString(params.get("name"), "query");
        Map<String, Object> arguments = asMap(params.get("arguments"));
        String text = switch (name) {
            case "context" -> "Workspace: " + workspace + "\nFocus: "
                    + Objects.toString(arguments.getOrDefault("focus", "object graph"), "object graph")
                    + "\nUse resources for metadata, then query tools for runtime rows.";
            default -> "Workspace: " + workspace + "\nRun or refine this UModel SPL through query_spl_execute or query_spl_explain:\n"
                    + Objects.toString(arguments.getOrDefault("query", ".umodel | limit 20"), ".umodel | limit 20");
        };
        return Map.of(
                "description", name,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", Map.of("type", "text", "text", text)
                ))
        );
    }

    private static Map<String, Object> completion(String workspace, Map<String, Object> params) {
        String value = Objects.toString(params.get("argument"), "");
        List<String> values = List.of(
                ".umodel | limit 20",
                ".umodel with(kind='entity_set') | project domain,name",
                ".entity with(domain='devops', name='devops.service', query='checkout') | limit 20",
                ".entity_set with(domain='devops', name='devops.service') | entity-call __list_method__()",
                ".topo | graph-call getDirectRelations([]) | limit 20",
                ".runbook_set with(domain='devops', type='knowledge', query='checkout', mode='hyper', topk=5)"
        ).stream().filter(item -> value.isBlank() || item.contains(value)).toList();
        return Map.of("completion", Map.of(
                "values", values,
                "total", values.size(),
                "hasMore", false,
                "workspace", workspace
        ));
    }

    private void ensureWorkspace(String workspace) {
        try {
            workspaceService.getWorkspace(workspace);
        } catch (UModelException e) {
            if (!ErrorCodes.NOT_FOUND.equals(e.code())) {
                throw e;
            }
            graphStore.openWorkspace(workspaceService.createWorkspace(new CreateWorkspaceRequest(
                    workspace,
                    "Demo",
                    "Java MCP stdio quickstart",
                    Map.of("umodel.io/quickstart", "true"),
                    Map.of()
            )));
        }
    }

    private static GraphStore graphStore(String provider, String dataRoot) {
        return switch (provider) {
            case "memory" -> new MemoryGraphStore();
            case "file.memory" -> new FileMemoryGraphStore(Path.of(dataRoot));
            case "local.ladybug" -> new LadybugGraphStore();
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unknown graphstore provider: " + provider);
        };
    }

    private static Map<String, Object> result(Object id, Object result) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("result", result);
        return response;
    }

    private static Map<String, Object> error(Object id, int code, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        response.put("id", id);
        response.put("error", Map.of("code", code, "message", message == null ? "MCP request failed" : message));
        return response;
    }

    private static int mcpErrorCode(String code) {
        return switch (code) {
            case ErrorCodes.TOOL_NOT_FOUND, ErrorCodes.NOT_FOUND -> -32601;
            case ErrorCodes.INVALID_ARGUMENT, ErrorCodes.VALIDATION_FAILED -> -32602;
            default -> -32000;
        };
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    private static Map<String, String> flags(String[] args) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String arg : args) {
            if (!arg.startsWith("--")) {
                continue;
            }
            int idx = arg.indexOf('=');
            if (idx > 2) {
                out.put(arg.substring(2, idx), arg.substring(idx + 1));
            } else {
                out.put(arg.substring(2), "true");
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            out.put(Objects.toString(entry.getKey(), ""), entry.getValue());
        }
        return out;
    }
}
