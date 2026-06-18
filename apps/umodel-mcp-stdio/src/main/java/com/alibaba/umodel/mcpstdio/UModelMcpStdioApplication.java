package com.alibaba.umodel.mcpstdio;

import com.alibaba.umodel.agentgateway.AgentGatewayService;
import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.McpProtocol;
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
                case "tools/list" -> result(id, Map.of("tools", McpProtocol.tools(agentGatewayService.tools())));
                case "tools/call" -> result(id, toolResult(targetWorkspace, params));
                case "resources/list" -> result(id, Map.of("resources", McpProtocol.resources(agentGatewayService.discover(targetWorkspace).resources())));
                case "resources/read" -> result(id, resourceResult(targetWorkspace, params));
                case "resources/templates/list" -> result(id, Map.of("resourceTemplates", McpProtocol.resourceTemplates(targetWorkspace)));
                case "prompts/list" -> result(id, Map.of("prompts", McpProtocol.prompts()));
                case "prompts/get" -> result(id, McpProtocol.prompt(targetWorkspace, params));
                case "completion/complete" -> result(id, McpProtocol.completion(targetWorkspace, params));
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
        String name = Objects.toString(params.get("name"), "");
        if (name.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "name param is required");
        }
        try {
            AgentToolCallResult result = agentGatewayService.executeTool(
                    workspace,
                    new AgentToolCallRequest(name, asMap(params.get("arguments")))
            );
            return McpProtocol.toolResult(result);
        } catch (UModelException e) {
            return McpProtocol.toolErrorResult(name, e.code(), e.getMessage());
        }
    }

    private Map<String, Object> initialize(String workspace, Map<String, Object> params) {
        return McpProtocol.initializeResult(
                "umodel-java-mcp-stdio",
                "UModel Java MCP Stdio",
                "0.1.0-SNAPSHOT",
                workspace,
                agentGatewayService.discover(workspace),
                List.of("stdio"),
                Objects.toString(params.get("protocolVersion"), "")
        );
    }

    private Map<String, Object> resourceResult(String workspace, Map<String, Object> params) {
        AgentResourceReadResult result = agentGatewayService.readResource(
                workspace,
                new AgentResourceReadRequest(Objects.toString(params.get("uri"), ""))
        );
        return McpProtocol.resourceResult(result);
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
