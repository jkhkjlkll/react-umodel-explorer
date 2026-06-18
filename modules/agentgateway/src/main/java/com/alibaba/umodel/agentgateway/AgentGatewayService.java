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
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.ExpireRequest;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.query.QueryService;
import com.alibaba.umodel.umodel.UModelService;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

public class AgentGatewayService {
    private final QueryService queryService;
    private final UModelService uModelService;
    private final EntityStoreService entityStoreService;
    private final boolean writeEnabled;

    public AgentGatewayService(
            QueryService queryService,
            UModelService uModelService,
            EntityStoreService entityStoreService,
            boolean writeEnabled
    ) {
        this.queryService = queryService;
        this.uModelService = uModelService;
        this.entityStoreService = entityStoreService;
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
                        ),
                        new AgentNextAction(
                                "plan-service-metrics",
                                "Plan service metric query",
                                "Return a downstream Prometheus query plan through EntitySet methods.",
                                "query_spl_execute",
                                new AgentQueryAction("POST", "/api/v1/query/" + workspace + "/execute",
                                        new QueryRequest(".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')", Map.of(), 20, null, null, "agent"))
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
                            "sources", List.of(".umodel", ".entity_set", ".entity", ".topo", ".runbook_set")
                    ),
                    "mcp_transports", List.of("streamable-http", "http+sse", "stdio-compatible wrapper"),
                    "resource_policy", "Resources expose metadata and templates only."
            ));
        }
        if (uri.endsWith("/query-templates")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "templates", List.of(
                            Map.of("id", "list-umodel", "query", ".umodel with(kind='entity_set') | limit 20"),
                            Map.of("id", "entity-set-methods", "query", ".entity_set with(domain='devops', name='devops.service') | entity-call __list_method__()"),
                            Map.of("id", "entity-set-data-sets", "query", ".entity_set with(domain='devops', name='devops.service') | entity-call list_data_set(['metric_set', 'log_set', 'event_set'], true)"),
                            Map.of("id", "entity-set-logs", "query", ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='level = \"ERROR\"')"),
                            Map.of("id", "entity-set-metrics", "query", ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')"),
                            Map.of("id", "find-entity", "query", ".entity with(domain='devops', name='devops.service', query=$query) | limit 20"),
                            Map.of("id", "runbook-search", "query", ".runbook_set with(domain='devops', type='knowledge', query=$query, mode='hyper', topk=5)"),
                            Map.of("id", "runbook-actions", "query", ".runbook_set with(domain='devops', type='actions', query=$query, topk=5)"),
                            Map.of("id", "runbook-skills", "query", ".runbook_set with(domain='devops', type='skills', query=$query, topk=5)"),
                            Map.of("id", "topology", "query", ".topo | graph-call getDirectRelations([]) | limit 20"),
                            Map.of("id", "topology-cypher", "query", ".topo | graph-call cypher(`MATCH (src)-[r]->(dest) RETURN src, r AS relation, dest LIMIT 20`)")
                    )
            ));
        }
        if (uri.endsWith("/schema-index")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "sources", List.of(".umodel", ".entity_set", ".entity", ".topo", ".runbook_set"),
                    "runbook_sections", List.of("knowledge", "observations", "actions", "automations", "skills", "steps"),
                    "entity_set_methods", List.of("__list_method__", "list_data_set", "get_logs", "get_metrics"),
                    "search_modes", Map.of(
                            "keyword", "memory keyword search",
                            "vector", "accepted as memory keyword fallback",
                            "hyper", "accepted as memory keyword fallback",
                            "hybrid", "accepted as memory keyword fallback"
                    ),
                    "graph_calls", List.of("getDirectRelations", "getNeighborNodes", "cypher")
            ));
        }
        if (uri.endsWith("/tool-capability-metadata")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "tools", tools()
            ));
        }
        if (uri.endsWith("/skills")) {
            return new AgentResourceReadResult(uri, "text/toon", Map.of(
                    "workspace", workspace,
                    "skills_path", "skills/",
                    "skills", List.of(
                            Map.of(
                                    "name", "umodel-query",
                                    "path", "skills/umodel-query/SKILL.md",
                                    "purpose", "Read model metadata, entities, topology, runbooks, and telemetry plans from the Java backend."
                            ),
                            Map.of(
                                    "name", "umodel-rca",
                                    "path", "skills/umodel-rca/SKILL.md",
                                    "purpose", "Run model-guided incident investigation using Java backend query surfaces."
                            )
                    ),
                    "install_hint", "Copy skills/umodel-query and skills/umodel-rca into the agent skills directory such as .agents/skills/."
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
            case "umodel_validate" -> new AgentToolCallResult(name, true, uModelService.validate(workspace, uModelElements(args.get("elements"))));
            case "umodel_import" -> writeToolResult(name, () -> uModelService.importElements(
                    workspace,
                    new UModelImportRequest(asString(args, "path"), uModelElementsOrNull(args.get("elements")))
            ));
            case "entity_write" -> writeToolResult(name, () -> entityStoreService.writeEntities(
                    workspace,
                    new EntityWriteBatch(
                            workspace,
                            asString(args, "idempotency_key", "idempotencyKey"),
                            asBoolean(args, "partial_success", "partialSuccess"),
                            rows(args.get("entities"), "entities")
                    )
            ));
            case "entity_expire" -> writeToolResult(name, () -> entityStoreService.expireEntities(
                    workspace,
                    new ExpireRequest(workspace, strings(args.get("ids"), "ids"))
            ));
            default -> throw new UModelException(ErrorCodes.TOOL_NOT_FOUND, "agent tool not found");
        };
    }

    private AgentToolCallResult writeToolResult(String name, Supplier<Object> output) {
        if (!writeEnabled) {
            throw new UModelException(ErrorCodes.TOOL_DISABLED, "agent write tool is disabled");
        }
        return new AgentToolCallResult(name, true, output.get());
    }

    private static List<AgentResource> resources(String workspace) {
        String base = "umodel://workspace/" + workspace;
        return List.of(
                new AgentResource("overview", base + "/overview", "overview", "Workspace API and capability overview.", "text/toon", true),
                new AgentResource("schema-index", base + "/schema-index", "schema-index", "Model and query source metadata.", "text/toon", true),
                new AgentResource("query-templates", base + "/query-templates", "query-templates", "Safe query templates.", "text/toon", true),
                new AgentResource("tool-capability-metadata", base + "/tool-capability-metadata", "tool-metadata", "Tool capability metadata.", "text/toon", true),
                new AgentResource("skills", base + "/skills", "skills", "Bundled Java backend skill package metadata.", "text/toon", true)
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
                args.get("format") == null ? null : args.get("format").toString(),
                args.get("mode") == null ? null : args.get("mode").toString(),
                asBoolean(args, "include_spec", "includeSpec")
        );
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

    private static Integer asInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return null;
        }
        return Integer.parseInt(value.toString());
    }

    private static List<UModelElement> uModelElementsOrNull(Object value) {
        if (value == null) {
            return null;
        }
        return uModelElements(value);
    }

    private static List<UModelElement> uModelElements(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<UModelElement> elements = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof UModelElement element) {
                elements.add(element);
                continue;
            }
            Map<String, Object> map = asMap(item);
            if (map.isEmpty()) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "elements items must be objects");
            }
            Map<String, Object> metadata = asMap(map.get("metadata"));
            elements.add(new UModelElement(
                    asString(map, "id"),
                    asString(map, "kind"),
                    firstString(map, metadata, "domain"),
                    firstString(map, metadata, "name"),
                    asMap(map.get("spec")),
                    metadata
            ));
        }
        return elements;
    }

    private static List<Map<String, Object>> rows(Object value, String field) {
        if (!(value instanceof List<?> list)) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, field + " argument must be an array");
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            Map<String, Object> row = asMap(item);
            if (row.isEmpty()) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, field + " items must be objects");
            }
            rows.add(row);
        }
        return rows;
    }

    private static List<String> strings(Object value, String field) {
        if (!(value instanceof List<?> list)) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, field + " argument must be an array");
        }
        List<String> values = new ArrayList<>();
        for (Object item : list) {
            if (item == null || Objects.toString(item, "").isBlank()) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, field + " items must be non-empty strings");
            }
            values.add(Objects.toString(item, ""));
        }
        return values;
    }

    private static boolean asBoolean(Map<String, Object> map, String... keys) {
        Object value = firstValue(map, keys);
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value != null && Boolean.parseBoolean(value.toString());
    }

    private static String asString(Map<String, Object> map, String... keys) {
        Object value = firstValue(map, keys);
        return value == null ? null : Objects.toString(value, null);
    }

    private static String firstString(Map<String, Object> first, Map<String, Object> second, String key) {
        Object value = first.get(key);
        if (value == null) {
            value = second.get(key);
        }
        return value == null ? null : Objects.toString(value, null);
    }

    private static Object firstValue(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            if (map.containsKey(key)) {
                return map.get(key);
            }
        }
        return null;
    }
}
