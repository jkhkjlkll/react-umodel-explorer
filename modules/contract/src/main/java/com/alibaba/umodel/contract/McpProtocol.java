package com.alibaba.umodel.contract;

import com.alibaba.umodel.contract.UModelModels.AgentResource;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadResult;
import com.alibaba.umodel.contract.UModelModels.AgentTool;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallResult;

import java.lang.reflect.Array;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class McpProtocol {
    public static final String CURRENT_PROTOCOL_VERSION = "2025-06-18";
    public static final String TOON_MIME_TYPE = "text/toon";
    private static final Pattern TOON_NUMBER_LIKE = Pattern.compile("^[+-]?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$");
    private static final Set<String> SUPPORTED_PROTOCOL_VERSIONS = Set.of("2025-06-18", "2025-03-26", "2024-11-05");
    private static final List<String> RESOURCE_TEMPLATE_NAMES = List.of(
            "overview",
            "schema-index",
            "query-templates",
            "tool-capability-metadata",
            "skills"
    );

    private McpProtocol() {
    }

    public static Map<String, Object> initializeResult(
            String serverName,
            String title,
            String version,
            String workspace,
            Object discovery,
            List<String> protocols,
            String requestedProtocol
    ) {
        Map<String, Object> capabilities = new LinkedHashMap<>();
        capabilities.put("tools", Map.of("listChanged", false));
        capabilities.put("resources", Map.of("listChanged", false));
        capabilities.put("prompts", Map.of("listChanged", false));
        capabilities.put("completions", Map.of());
        capabilities.put("logging", Map.of());

        Map<String, Object> serverInfo = new LinkedHashMap<>();
        serverInfo.put("name", serverName);
        serverInfo.put("title", title);
        serverInfo.put("version", version);

        String protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.contains(requestedProtocol)
                ? requestedProtocol
                : CURRENT_PROTOCOL_VERSION;

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("workspace", workspace);
        meta.put("outputFormat", TOON_MIME_TYPE);
        meta.put("protocols", protocols == null ? List.of() : protocols);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("protocolVersion", protocolVersion);
        out.put("capabilities", capabilities);
        out.put("serverInfo", serverInfo);
        out.put(
                "instructions",
                "Use UModel query tools for .umodel, .entity_set, .entity, .topo, and .runbook_set reads. "
                        + "Tool and resource text payloads are encoded as TOON while the MCP JSON-RPC envelope remains JSON."
        );
        out.put("discovery", discovery);
        out.put("_meta", meta);
        return out;
    }

    public static List<Map<String, Object>> tools(List<AgentTool> tools) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentTool tool : tools == null ? List.<AgentTool>of() : tools) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", tool.name());
            item.put("title", titleFromName(tool.name()));
            item.put("description", tool.description());
            item.put("inputSchema", schemaObject(tool.inputSchema()));
            item.put("outputSchema", Map.of(
                    "type", "object",
                    "description", "The structuredContent field mirrors this JSON shape. The content text block is encoded as TOON."
            ));
            item.put("annotations", Map.of(
                    "title", titleFromName(tool.name()),
                    "readOnlyHint", !tool.requiresExplicitWriteEnable(),
                    "destructiveHint", tool.requiresExplicitWriteEnable()
            ));
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("enabledByDefault", tool.enabled());
            meta.put("requiresExplicitWriteEnable", tool.requiresExplicitWriteEnable());
            meta.put("outputFormat", TOON_MIME_TYPE);
            meta.put("legacyInputSchema", tool.inputSchema());
            meta.put("legacyOutputSchema", tool.outputSchema());
            item.put("_meta", meta);
            out.add(item);
        }
        return out;
    }

    public static List<Map<String, Object>> resources(List<AgentResource> resources) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AgentResource resource : resources == null ? List.<AgentResource>of() : resources) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("kind", resource.kind());
            meta.put("readOnly", resource.readOnly());
            meta.put("sourceMimeType", resource.mimeType());

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("uri", resource.uri());
            item.put("name", resource.name());
            item.put("title", titleFromName(resource.name()));
            item.put("description", resource.description());
            item.put("mimeType", TOON_MIME_TYPE);
            item.put("_meta", meta);
            out.add(item);
        }
        return out;
    }

    public static Map<String, Object> toolResult(AgentToolCallResult result) {
        Map<String, Object> structured = toolPayload(result);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", List.of(textContent(structured)));
        out.put("structuredContent", structured);
        out.put("isError", result == null || !result.ok());
        return out;
    }

    public static Map<String, Object> toolErrorResult(String name, String code, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", name);
        payload.put("ok", false);
        payload.put("error", message == null || message.isBlank() ? "agent tool failed" : message);
        if (code != null && !code.isBlank()) {
            payload.put("code", code);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", List.of(textContent(payload)));
        out.put("structuredContent", payload);
        out.put("isError", true);
        return out;
    }

    public static Map<String, Object> resourceResult(AgentResourceReadResult result) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("sourceMimeType", result.mimeType());
        meta.put("format", "toon");

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("uri", result.uri());
        content.put("mimeType", TOON_MIME_TYPE);
        content.put("text", encodeTOON(result.content()));
        content.put("_meta", meta);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("contents", List.of(content));
        return out;
    }

    public static List<Map<String, Object>> resourceTemplates(String workspace) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String name : RESOURCE_TEMPLATE_NAMES) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("defaultWorkspace", workspace);

            Map<String, Object> template = new LinkedHashMap<>();
            template.put("name", name);
            template.put("title", titleFromName(name));
            template.put("uriTemplate", "umodel://workspace/{workspace}/" + name);
            template.put("description", "Read " + name + " metadata for a UModel workspace.");
            template.put("mimeType", TOON_MIME_TYPE);
            template.put("_meta", meta);
            out.add(template);
        }
        return out;
    }

    public static List<Map<String, Object>> prompts() {
        return List.of(
                Map.of(
                        "name", "umodel_query_context",
                        "title", "UModel Query Context",
                        "description", "Prepare a UModel query task using .umodel, .entity_set, .entity, .topo, and .runbook_set surfaces.",
                        "arguments", List.of(
                                Map.of("name", "workspace", "description", "Workspace name.", "required", false),
                                Map.of("name", "query", "description", "Optional SPL query to inspect.", "required", false)
                        )
                ),
                Map.of(
                        "name", "umodel_object_graph_review",
                        "title", "UModel Object Graph Review",
                        "description", "Review model, entity, topology, and runbook context before using runtime query tools.",
                        "arguments", List.of(
                                Map.of("name", "workspace", "description", "Workspace name.", "required", false),
                                Map.of("name", "focus", "description", "Review focus.", "required", false)
                        )
                ),
                Map.of(
                        "name", "query",
                        "title", "Use UModel Query Service",
                        "description", "Alias of umodel_query_context for existing Java MCP clients.",
                        "arguments", List.of(Map.of("name", "query", "required", false))
                ),
                Map.of(
                        "name", "context",
                        "title", "Review UModel Object Graph Context",
                        "description", "Alias of umodel_object_graph_review for existing Java MCP clients.",
                        "arguments", List.of(Map.of("name", "focus", "required", false))
                )
        );
    }

    public static Map<String, Object> prompt(String defaultWorkspace, Map<String, Object> params) {
        String name = Objects.toString(params == null ? null : params.get("name"), "umodel_query_context");
        Map<String, Object> arguments = asMap(params == null ? null : params.get("arguments"));
        String workspace = stringArg(arguments, "workspace");
        if (workspace.isBlank()) {
            workspace = defaultWorkspace;
        }

        return switch (name) {
            case "umodel_query_context", "query" -> {
                String query = stringArg(arguments, "query");
                if (query.isBlank()) {
                    query = ".umodel | limit 1000";
                }
                yield promptResult(
                        "Use UModel Query Service",
                        "Workspace: " + workspace
                                + "\nRun or refine this UModel SPL through query_spl_execute or query_spl_explain:\n"
                                + query
                                + "\n\nPrefer .umodel, .entity_set, .entity, .topo, and .runbook_set as the public read sources. "
                                + "Tool/resource data returned by this server is encoded as TOON."
                );
            }
            case "umodel_object_graph_review", "context" -> {
                String focus = stringArg(arguments, "focus");
                if (focus.isBlank()) {
                    focus = "model definitions, runtime entities, topology relations, and runbooks";
                }
                yield promptResult(
                        "Review UModel Object Graph Context",
                        "Workspace: " + workspace
                                + "\nFocus: " + focus
                                + "\nUse resources for metadata, then query tools for runtime rows. "
                                + "Keep resources metadata-only and use Query Service for .umodel, .entity_set, .entity, .topo, and .runbook_set reads."
                );
            }
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unknown prompt: " + name);
        };
    }

    public static Map<String, Object> completion(String workspace, Map<String, Object> params) {
        Map<String, Object> ref = asMap(params == null ? null : params.get("ref"));
        Map<String, Object> argument = asMap(params == null ? null : params.get("argument"));
        String value = stringArg(argument, "value");
        if (value.isBlank() && params != null && params.get("argument") instanceof String text) {
            value = text;
        }
        String needle = value.toLowerCase(Locale.ROOT);

        List<String> candidates = switch (stringArg(ref, "type")) {
            case "ref/resource" -> RESOURCE_TEMPLATE_NAMES.stream()
                    .map(name -> "umodel://workspace/" + workspace + "/" + name)
                    .toList();
            case "ref/prompt" -> List.of(
                    "umodel_query_context",
                    "umodel_object_graph_review",
                    "query",
                    "context",
                    workspace,
                    ".umodel | limit 1000",
                    ".entity | limit 1000",
                    ".topo | limit 1000",
                    ".runbook_set with(domain='devops', type='knowledge', query='checkout', mode='hyper', topk=5)"
            );
            default -> List.of(
                    workspace,
                    ".umodel | limit 20",
                    ".umodel with(kind='entity_set') | project domain,name",
                    ".entity with(domain='devops', name='devops.service', query='checkout') | limit 20",
                    ".entity_set with(domain='devops', name='devops.service') | entity-call __list_method__()",
                    ".topo | graph-call getDirectRelations([]) | limit 20",
                    ".runbook_set with(domain='devops', type='knowledge', query='checkout', mode='hyper', topk=5)",
                    ".runbook_set with(domain='devops', type='actions', query='checkout', topk=5)",
                    ".runbook_set with(domain='devops', type='skills', query='rca', topk=5)"
            );
        };

        List<String> values = candidates.stream()
                .filter(item -> needle.isBlank()
                        || item.toLowerCase(Locale.ROOT).contains(needle)
                        || itemName(item).contains(needle))
                .limit(100)
                .toList();
        return Map.of("completion", Map.of(
                "values", values,
                "total", values.size(),
                "hasMore", false
        ));
    }

    public static String encodeTOON(Object value) {
        StringBuilder builder = new StringBuilder();
        writeTOONValue(builder, "", normalizeTOONValue(value), 0);
        int end = builder.length();
        while (end > 0 && builder.charAt(end - 1) == '\n') {
            end--;
        }
        return builder.substring(0, end);
    }

    private static Map<String, Object> toolPayload(AgentToolCallResult result) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", result == null ? "" : result.name());
        payload.put("ok", result != null && result.ok());
        payload.put("output", result == null ? null : result.output());
        return payload;
    }

    private static Map<String, Object> textContent(Object payload) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("format", "toon");
        meta.put("mimeType", TOON_MIME_TYPE);

        Map<String, Object> textContent = new LinkedHashMap<>();
        textContent.put("type", "text");
        textContent.put("mimeType", TOON_MIME_TYPE);
        textContent.put("text", encodeTOON(payload));
        textContent.put("_meta", meta);
        return textContent;
    }

    private static Map<String, Object> promptResult(String description, String text) {
        return Map.of(
                "description", description,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", Map.of("type", "text", "text", text)
                ))
        );
    }

    private static Map<String, Object> schemaObject(Object schema) {
        Map<String, Object> map = asMap(schema);
        if (!map.isEmpty()) {
            return map;
        }
        return Map.of("type", "object", "additionalProperties", true);
    }

    private static String itemName(String item) {
        int slash = item.lastIndexOf('/');
        return slash >= 0 ? item.substring(slash + 1).toLowerCase(Locale.ROOT) : item.toLowerCase(Locale.ROOT);
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

    private static String stringArg(Map<String, Object> args, String key) {
        if (args == null) {
            return "";
        }
        Object value = args.get(key);
        return value instanceof String text ? text : "";
    }

    private static String titleFromName(String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        String[] parts = name.split("[_\\-/]+");
        List<String> words = new ArrayList<>();
        for (String part : parts) {
            if (part.isBlank()) {
                continue;
            }
            words.add(part.substring(0, 1).toUpperCase(Locale.ROOT) + part.substring(1));
        }
        return String.join(" ", words);
    }

    private static Object normalizeTOONValue(Object value) {
        if (value == null || isScalar(value)) {
            return value;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                out.put(Objects.toString(entry.getKey(), ""), normalizeTOONValue(entry.getValue()));
            }
            return out;
        }
        if (value instanceof Iterable<?> iterable) {
            List<Object> out = new ArrayList<>();
            for (Object item : iterable) {
                out.add(normalizeTOONValue(item));
            }
            return out;
        }
        if (value.getClass().isArray()) {
            List<Object> out = new ArrayList<>();
            for (int i = 0; i < Array.getLength(value); i++) {
                out.add(normalizeTOONValue(Array.get(value, i)));
            }
            return out;
        }
        if (value.getClass().isRecord()) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (RecordComponent component : value.getClass().getRecordComponents()) {
                try {
                    out.put(component.getName(), normalizeTOONValue(component.getAccessor().invoke(value)));
                } catch (ReflectiveOperationException e) {
                    out.put(component.getName(), Objects.toString(value, ""));
                }
            }
            return out;
        }
        return Objects.toString(value, "");
    }

    @SuppressWarnings("unchecked")
    private static void writeTOONValue(StringBuilder builder, String key, Object value, int level) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> map = (Map<String, Object>) rawMap;
            if (!key.isBlank()) {
                writeIndent(builder, level);
                builder.append(key).append(":\n");
                level++;
            }
            int nestedLevel = level;
            map.keySet().stream().sorted().forEach(itemKey -> writeTOONValue(builder, itemKey, map.get(itemKey), nestedLevel));
            return;
        }
        if (value instanceof List<?> list) {
            writeTOONArray(builder, key, list, level);
            return;
        }
        writeIndent(builder, level);
        if (!key.isBlank()) {
            builder.append(key).append(": ");
        }
        builder.append(toonScalar(value)).append('\n');
    }

    @SuppressWarnings("unchecked")
    private static void writeTOONArray(StringBuilder builder, String key, List<?> values, int level) {
        writeIndent(builder, level);
        if (!key.isBlank()) {
            builder.append(key);
        }
        List<String> fields = uniformScalarObjectFields(values);
        if (!fields.isEmpty()) {
            builder.append('[').append(values.size()).append("]{").append(String.join(",", fields)).append("}:\n");
            for (Object value : values) {
                Map<String, Object> row = (Map<String, Object>) value;
                writeIndent(builder, level + 1);
                for (int i = 0; i < fields.size(); i++) {
                    if (i > 0) {
                        builder.append(',');
                    }
                    builder.append(toonScalar(row.get(fields.get(i))));
                }
                builder.append('\n');
            }
            return;
        }
        if (allScalars(values)) {
            builder.append('[').append(values.size()).append("]: ");
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) {
                    builder.append(',');
                }
                builder.append(toonScalar(values.get(i)));
            }
            builder.append('\n');
            return;
        }
        builder.append('[').append(values.size()).append("]:\n");
        for (Object item : values) {
            writeIndent(builder, level + 1);
            builder.append('-');
            if (isScalar(item)) {
                builder.append(' ').append(toonScalar(item)).append('\n');
                continue;
            }
            if (item instanceof Map<?, ?> map && map.size() == 1) {
                Map.Entry<?, ?> only = map.entrySet().iterator().next();
                if (isScalar(only.getValue())) {
                    builder.append(' ')
                            .append(Objects.toString(only.getKey(), ""))
                            .append(": ")
                            .append(toonScalar(only.getValue()))
                            .append('\n');
                    continue;
                }
            }
            builder.append('\n');
            writeTOONValue(builder, "", item, level + 2);
        }
    }

    private static List<String> uniformScalarObjectFields(List<?> values) {
        if (values.isEmpty() || !(values.get(0) instanceof Map<?, ?> first) || first.isEmpty()) {
            return List.of();
        }
        List<String> fields = first.entrySet().stream()
                .filter(entry -> isScalar(entry.getValue()))
                .map(entry -> Objects.toString(entry.getKey(), ""))
                .sorted()
                .toList();
        if (fields.size() != first.size()) {
            return List.of();
        }
        for (Object item : values.subList(1, values.size())) {
            if (!(item instanceof Map<?, ?> row) || row.size() != fields.size()) {
                return List.of();
            }
            for (String field : fields) {
                if (!row.containsKey(field) || !isScalar(row.get(field))) {
                    return List.of();
                }
            }
        }
        return fields;
    }

    private static boolean allScalars(List<?> values) {
        return values.stream().allMatch(McpProtocol::isScalar);
    }

    private static boolean isScalar(Object value) {
        return value == null
                || value instanceof String
                || value instanceof Boolean
                || value instanceof Number;
    }

    private static String toonScalar(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Boolean bool) {
            return bool ? "true" : "false";
        }
        if (value instanceof Number number) {
            return number.toString();
        }
        return toonString(Objects.toString(value, ""));
    }

    private static String toonString(String value) {
        if (!needsTOONQuote(value)) {
            return value;
        }
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
                + "\"";
    }

    private static boolean needsTOONQuote(String value) {
        return value.isEmpty()
                || !value.trim().equals(value)
                || "true".equals(value)
                || "false".equals(value)
                || "null".equals(value)
                || "-".equals(value)
                || value.startsWith("-")
                || TOON_NUMBER_LIKE.matcher(value).matches()
                || value.indexOf(':') >= 0
                || value.indexOf('"') >= 0
                || value.indexOf('\\') >= 0
                || value.indexOf('[') >= 0
                || value.indexOf(']') >= 0
                || value.indexOf('{') >= 0
                || value.indexOf('}') >= 0
                || value.indexOf(',') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\t') >= 0
                || value.indexOf('\r') >= 0;
    }

    private static void writeIndent(StringBuilder builder, int level) {
        builder.append("  ".repeat(Math.max(0, level)));
    }
}
