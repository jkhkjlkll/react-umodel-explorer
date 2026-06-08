package com.alibaba.umodel.agentgateway;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.AgentDiscovery;
import com.alibaba.umodel.contract.UModelModels.AgentNextAction;
import com.alibaba.umodel.contract.UModelModels.AgentQueryAction;
import com.alibaba.umodel.contract.UModelModels.AgentResource;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadResult;
import com.alibaba.umodel.contract.UModelModels.AgentTool;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallResult;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.query.QueryService;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public class AgentGatewayService {
    private final QueryService queryService;
    private final boolean writeEnabled;

    public AgentGatewayService(QueryService queryService, boolean writeEnabled) {
        this.queryService = queryService;
        this.writeEnabled = writeEnabled;
    }

    public AgentDiscovery discover(String workspace) {
        return new AgentDiscovery(
                workspace,
                tools(),
                resources(workspace),
                List.of(
                        new AgentNextAction(
                                "list-umodel",
                                "List UModel definitions",
                                "Read model definitions through Query Service.",
                                "query_spl_execute",
                                new AgentQueryAction("POST", "/api/v1/query/" + workspace + "/execute",
                                        new QueryRequest(".umodel | limit 20", Map.of(), 20, null, null, null))
                        ),
                        new AgentNextAction(
                                "find-entity",
                                "Find runtime entities",
                                "Search runtime entities through Query Service.",
                                "query_spl_execute",
                                new AgentQueryAction("POST", "/api/v1/query/" + workspace + "/execute",
                                        new QueryRequest(".entity with(domain='devops', name='devops.service') | limit 20", Map.of(), 20, null, null, null))
                        )
                )
        );
    }

    public List<AgentTool> tools() {
        return List.of(
                new AgentTool("query_spl_execute", "Execute unified SPL query", true, false, null, null),
                new AgentTool("query_spl_explain", "Explain unified SPL query", true, false, null, null),
                new AgentTool("query_spl_examples", "List safe SPL examples", true, false, null, null),
                new AgentTool("umodel_validate", "Validate UModel elements", true, false, null, null),
                new AgentTool("umodel_import", "Import UModel package", writeEnabled, true, null, null),
                new AgentTool("entity_write", "Write CMS 2.0 compatible entities", writeEnabled, true, null, null),
                new AgentTool("entity_expire", "Expire entities", writeEnabled, true, null, null)
        );
    }

    public AgentResourceReadResult readResource(String workspace, AgentResourceReadRequest request) {
        String uri = request == null ? null : request.uri();
        if (uri == null || uri.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "resource uri is required");
        }
        if (uri.endsWith("/overview")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "read_model", Map.of(
                            "tool", "query_spl_execute",
                            "sources", List.of(".umodel", ".entity", ".topo")
                    ),
                    "resource_policy", "Resources expose metadata and templates only."
            ));
        }
        if (uri.endsWith("/query-templates")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "templates", List.of(
                            Map.of("id", "list-umodel", "query", ".umodel with(kind='entity_set') | limit 20"),
                            Map.of("id", "find-entity", "query", ".entity with(domain='devops', name='devops.service', query=$query) | limit 20"),
                            Map.of("id", "topology", "query", ".topo | graph-call getDirectRelations([]) | limit 20")
                    )
            ));
        }
        if (uri.endsWith("/schema-index")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "sources", List.of(".umodel", ".entity", ".topo")
            ));
        }
        if (uri.endsWith("/tool-capability-metadata")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "tools", tools()
            ));
        }
        throw new UModelException(ErrorCodes.NOT_FOUND, "agent resource not found");
    }

    public AgentToolCallResult executeTool(String workspace, AgentToolCallRequest request) {
        String name = request == null ? null : request.name();
        Map<String, Object> args = request == null || request.arguments() == null ? Map.of() : request.arguments();
        return switch (Objects.toString(name, "")) {
            case "query_spl_execute" -> new AgentToolCallResult(name, true, queryService.execute(workspace, queryRequest(args)));
            case "query_spl_explain" -> new AgentToolCallResult(name, true, queryService.explain(workspace, queryRequest(args)));
            case "query_spl_examples" -> new AgentToolCallResult(name, true, queryService.examples());
            case "umodel_validate", "umodel_import", "entity_write", "entity_expire" -> {
                if (!writeEnabled) {
                    throw new UModelException(ErrorCodes.TOOL_DISABLED, "agent write tool is disabled");
                }
                throw new UModelException(ErrorCodes.NOT_IMPLEMENTED, "agent write tool wiring is not implemented in the subset");
            }
            default -> throw new UModelException(ErrorCodes.TOOL_NOT_FOUND, "agent tool not found");
        };
    }

    private static List<AgentResource> resources(String workspace) {
        String base = "umodel://workspace/" + workspace;
        return List.of(
                new AgentResource("overview", base + "/overview", "overview", "Workspace API and capability overview.", "text/toon", true),
                new AgentResource("schema-index", base + "/schema-index", "schema-index", "Model and query source metadata.", "text/toon", true),
                new AgentResource("query-templates", base + "/query-templates", "query-templates", "Safe query templates.", "text/toon", true),
                new AgentResource("tool-capability-metadata", base + "/tool-capability-metadata", "tool-metadata", "Tool capability metadata.", "text/toon", true)
        );
    }

    private static QueryRequest queryRequest(Map<String, Object> args) {
        Object query = args.get("query");
        if (query == null || query.toString().isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "query argument is required");
        }
        Object limit = args.get("limit");
        Object timeoutMs = args.get("timeout_ms");
        return new QueryRequest(
                query.toString(),
                asMap(args.get("parameters")),
                asInteger(limit),
                asInteger(timeoutMs),
                args.get("time_range"),
                args.get("format") == null ? null : args.get("format").toString()
        );
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private static Integer asInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return null;
        }
        return Integer.parseInt(value.toString());
    }
}
