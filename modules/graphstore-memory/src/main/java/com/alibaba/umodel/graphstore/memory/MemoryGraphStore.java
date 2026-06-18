package com.alibaba.umodel.graphstore.memory;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.BatchItemResult;
import com.alibaba.umodel.contract.UModelModels.ErrorDetail;
import com.alibaba.umodel.contract.UModelModels.GraphStoreCapabilities;
import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.contract.UModelModels.QueryPlan;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.QueryPage;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelSnapshot;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.graphstore.GraphStore;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MemoryGraphStore implements GraphStore {
    private static final Pattern QUOTED_ARG_PATTERN = Pattern.compile("'([^']*)'|\"([^\"]*)\"");
    private static final Pattern CYPHER_LIMIT_PATTERN = Pattern.compile("\\blimit\\s+(\\d+)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CYPHER_ENTITY_ID_PATTERN = Pattern.compile("__entity_id__\\s*:\\s*['\"]([^'\"]+)['\"]", Pattern.CASE_INSENSITIVE);
    private static final Pattern CYPHER_WHERE_EQ_PATTERN = Pattern.compile("\\bwhere\\s+([A-Za-z0-9_.]+)\\s*=\\s*['\"]?([^'\"\\s)]+)['\"]?", Pattern.CASE_INSENSITIVE);

    private final Map<String, WorkspaceData> workspaces = new ConcurrentHashMap<>();

    @Override
    public void openWorkspace(WorkspaceMetadata workspace) {
        if (workspace != null && workspace.id() != null) {
            data(workspace.id());
        }
    }

    @Override
    public WriteResult putUModelElements(UModelElementBatch batch) {
        WorkspaceData data = data(batch.workspace());
        int accepted = 0;
        for (UModelElement element : nullToList(batch.elements())) {
            data.elements.put(element.stableId(), element);
            accepted++;
        }
        data.version++;
        WriteResult result = WriteResult.accepted(accepted);
        afterWorkspaceChanged(batch.workspace());
        return result;
    }

    @Override
    public WriteResult deleteUModelElements(String workspace, List<String> ids) {
        WorkspaceData data = data(workspace);
        List<BatchItemResult> items = new ArrayList<>();
        int accepted = 0;
        int failed = 0;
        for (String id : nullToList(ids)) {
            if (id == null || id.isBlank()) {
                failed++;
                items.add(new BatchItemResult(id, false, "InvalidArgument", "element id is required", List.of(
                        new ErrorDetail("ids", "blank element id")
                )));
                continue;
            }
            UModelElement removed = data.elements.remove(id);
            if (removed == null) {
                failed++;
                items.add(new BatchItemResult(id, false, "NotFound", "umodel element not found", List.of()));
            } else {
                accepted++;
                items.add(new BatchItemResult(id, true, null, null, List.of()));
            }
        }
        if (accepted > 0) {
            data.version++;
            afterWorkspaceChanged(workspace);
        }
        return new WriteResult(accepted, failed, items, List.of());
    }

    @Override
    public UModelSnapshot getUModelSnapshot(String workspace) {
        WorkspaceData data = data(workspace);
        return new UModelSnapshot(workspace, new ArrayList<>(data.elements.values()), data.version);
    }

    @Override
    public WriteResult writeEntities(EntityWriteBatch batch) {
        WorkspaceData data = data(batch.workspace());
        int accepted = 0;
        for (Map<String, Object> payload : nullToList(batch.entities())) {
            if (isDeleteMethod(payload)) {
                removeEntity(data, payload);
            } else {
                data.entities.put(entityKey(payload), new LinkedHashMap<>(payload));
            }
            accepted++;
        }
        data.version++;
        WriteResult result = WriteResult.accepted(accepted);
        afterWorkspaceChanged(batch.workspace());
        return result;
    }

    @Override
    public WriteResult writeRelations(RelationWriteBatch batch) {
        WorkspaceData data = data(batch.workspace());
        int accepted = 0;
        for (Map<String, Object> payload : nullToList(batch.relations())) {
            if (isDeleteMethod(payload)) {
                removeRelation(data, payload);
            } else {
                data.relations.put(relationKey(payload), new LinkedHashMap<>(payload));
            }
            accepted++;
        }
        data.version++;
        WriteResult result = WriteResult.accepted(accepted);
        afterWorkspaceChanged(batch.workspace());
        return result;
    }

    @Override
    public QueryResult queryEntities(QueryPlan plan) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> entity : data(plan.workspace()).entities.values()) {
            if (matchesEntity(plan.filters(), entity)) {
                rows.add(new LinkedHashMap<>(entity));
            }
        }
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    @Override
    public QueryResult queryTopo(QueryPlan plan) {
        WorkspaceData data = data(plan.workspace());
        if (isGraphCall(plan.graphCall(), "getNeighborNodes")) {
            return queryNeighborNodes(data, plan);
        }
        if (isGraphCall(plan.graphCall(), "cypher")) {
            return queryCypher(data, plan);
        }
        List<Map<String, Object>> rows = directRelationRows(data, graphCallIds(plan.graphCall()));
        rows = rows.stream().filter(row -> matchesFilters(plan.filters(), row)).toList();
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    @Override
    public GraphStoreCapabilities capabilities() {
        return new GraphStoreCapabilities(providerName(), true, true);
    }

    @Override
    public GraphStoreHealth health() {
        return new GraphStoreHealth(providerName(), "ok", "in-memory graphstore is available");
    }

    protected String providerName() {
        return "memory";
    }

    protected void afterWorkspaceChanged(String workspace) {
    }

    protected List<WorkspaceSnapshot> snapshots() {
        List<WorkspaceSnapshot> snapshots = new ArrayList<>();
        for (Map.Entry<String, WorkspaceData> entry : workspaces.entrySet()) {
            WorkspaceData data = entry.getValue();
            snapshots.add(new WorkspaceSnapshot(
                    entry.getKey(),
                    new ArrayList<>(data.elements.values()),
                    copyRows(data.entities.values().stream().toList()),
                    copyRows(data.relations.values().stream().toList()),
                    data.version
            ));
        }
        snapshots.sort(Comparator.comparing(WorkspaceSnapshot::workspace));
        return snapshots;
    }

    protected void loadSnapshots(List<WorkspaceSnapshot> snapshots) {
        workspaces.clear();
        for (WorkspaceSnapshot snapshot : nullToList(snapshots)) {
            WorkspaceData data = data(snapshot.workspace());
            for (UModelElement element : nullToList(snapshot.elements())) {
                data.elements.put(element.stableId(), element);
            }
            for (Map<String, Object> entity : nullToList(snapshot.entities())) {
                data.entities.put(entityKey(entity), new LinkedHashMap<>(entity));
            }
            for (Map<String, Object> relation : nullToList(snapshot.relations())) {
                data.relations.put(relationKey(relation), new LinkedHashMap<>(relation));
            }
            data.version = snapshot.version();
        }
    }

    protected WorkspaceData data(String workspace) {
        String key = workspace == null || workspace.isBlank() ? "default" : workspace;
        return workspaces.computeIfAbsent(key, ignored -> new WorkspaceData());
    }

    private static boolean matchesEntity(Map<String, Object> filters, Map<String, Object> entity) {
        if (filters == null || filters.isEmpty()) {
            return true;
        }
        if (!matchesFilter(filters.get("domain"), entity.get("__domain__"))) {
            return false;
        }
        if (!matchesFilter(filters.get("name"), entity.get("__entity_type__"))) {
            return false;
        }
        Object query = filters.get("query");
        if (query == null) {
            return true;
        }
        String needle = Objects.toString(query, "").toLowerCase(java.util.Locale.ROOT);
        return entity.values().stream()
                .map(value -> Objects.toString(value, "").toLowerCase(java.util.Locale.ROOT))
                .anyMatch(value -> value.contains(needle));
    }

    private static boolean matchesFilter(Object expected, Object actual) {
        return expected == null || Objects.equals(Objects.toString(expected, ""), Objects.toString(actual, ""));
    }

    private static Map<String, Object> entityById(WorkspaceData data, Map<String, Object> relation, String field) {
        String id = Objects.toString(relation.get(field), "");
        for (Map<String, Object> entity : data.entities.values()) {
            if (Objects.equals(id, Objects.toString(entity.get("__entity_id__"), ""))) {
                return new LinkedHashMap<>(entity);
            }
        }
        return Map.of("__entity_id__", id);
    }

    private static QueryResult queryNeighborNodes(WorkspaceData data, QueryPlan plan) {
        Set<String> startIds = graphCallIds(plan.graphCall());
        String scope = graphScope(plan.graphCall());
        int depth = graphDepth(plan.graphCall());
        if (depth <= 0) {
            depth = 1;
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> seenRows = new LinkedHashSet<>();
        Set<String> frontier = startIds.isEmpty() ? allEntityIds(data) : new LinkedHashSet<>(startIds);
        Set<String> visited = new LinkedHashSet<>(frontier);
        for (int hop = 1; hop <= depth && !frontier.isEmpty(); hop++) {
            Set<String> next = new LinkedHashSet<>();
            for (Map<String, Object> relation : data.relations.values()) {
                String srcId = Objects.toString(relation.get("__src_entity_id__"), "");
                String destId = Objects.toString(relation.get("__dest_entity_id__"), "");
                if (allowsOut(scope) && frontier.contains(srcId)) {
                    addNeighborRow(data, rows, seenRows, relation, destId, "out", hop, next);
                }
                if (allowsIn(scope) && frontier.contains(destId)) {
                    addNeighborRow(data, rows, seenRows, relation, srcId, "in", hop, next);
                }
            }
            next.removeAll(visited);
            visited.addAll(next);
            frontier = next;
        }
        rows = rows.stream().filter(row -> matchesFilters(plan.filters(), row)).toList();
        rows = sortAndLimit(new ArrayList<>(rows), plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    private static List<Map<String, Object>> directRelationRows(WorkspaceData data, Set<String> ids) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> relation : data.relations.values()) {
            if (!ids.isEmpty()
                    && !ids.contains(Objects.toString(relation.get("__src_entity_id__"), ""))
                    && !ids.contains(Objects.toString(relation.get("__dest_entity_id__"), ""))) {
                continue;
            }
            rows.add(edgeRow(data, relation));
        }
        return rows;
    }

    private static QueryResult queryCypher(WorkspaceData data, QueryPlan plan) {
        String rawCypher = cypherText(plan.graphCall());
        String cypher = rawCypher.toLowerCase(java.util.Locale.ROOT);
        if (cypher.isBlank() || !cypher.contains("return")) {
            return new QueryResult(List.of(), List.of(), page(plan.limit()), null);
        }
        if (cypher.contains(" delete ") || cypher.contains(" set ") || cypher.contains(" create ")
                || cypher.contains(" merge ") || cypher.contains(" detach ")) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "cypher graph-call only supports read-only MATCH/RETURN queries");
        }
        Set<String> ids = new LinkedHashSet<>(graphCallIds(plan.graphCall()));
        ids.addAll(cypherEntityIds(rawCypher));
        List<Map<String, Object>> rows = directRelationRows(data, ids);
        Map<String, Object> whereFilters = cypherWhereFilters(rawCypher);
        if (!whereFilters.isEmpty()) {
            rows = rows.stream().filter(row -> matchesFilters(whereFilters, row)).toList();
        }
        if (cypher.contains("properties(")) {
            rows = rows.stream().map(row -> {
                Map<String, Object> next = new LinkedHashMap<>();
                next.put("src", row.get("src"));
                next.put("relation", row.get("relation"));
                next.put("dest", row.get("dest"));
                return next;
            }).toList();
        }
        rows = rows.stream().filter(row -> matchesFilters(plan.filters(), row)).toList();
        int limit = plan.limit() > 0 ? plan.limit() : cypherLimit(plan.graphCall());
        rows = sortAndLimit(new ArrayList<>(rows), plan.sortField(), limit);
        return new QueryResult(rows, columns(rows), page(limit), null);
    }

    private static void addNeighborRow(
            WorkspaceData data,
            List<Map<String, Object>> rows,
            Set<String> seen,
            Map<String, Object> relation,
            String nodeId,
            String direction,
            int hop,
            Set<String> next
    ) {
        String key = Objects.toString(relation.get("__src_entity_id__"), "")
                + "\u0000" + Objects.toString(relation.get("__relation_type__"), "")
                + "\u0000" + Objects.toString(relation.get("__dest_entity_id__"), "")
                + "\u0000" + direction
                + "\u0000" + hop;
        if (!seen.add(key)) {
            return;
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("node", entityById(data, nodeId));
        row.put("relation", new LinkedHashMap<>(relation));
        row.put("direction", direction);
        row.put("hops", hop);
        rows.add(row);
        if (!nodeId.isBlank()) {
            next.add(nodeId);
        }
    }

    private static List<Map<String, Object>> sortAndLimit(List<Map<String, Object>> rows, String sortField, int limit) {
        if (sortField != null && !sortField.isBlank()) {
            rows.sort(Comparator.comparing(row -> Objects.toString(row.get(sortField), "")));
        }
        int effectiveLimit = limit <= 0 ? rows.size() : Math.min(limit, rows.size());
        return new ArrayList<>(rows.subList(0, effectiveLimit));
    }

    private static List<String> columns(List<Map<String, Object>> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        return new ArrayList<>(rows.get(0).keySet());
    }

    private static QueryPage page(int limit) {
        return new QueryPage(limit <= 0 ? null : limit, null);
    }

    private static String entityKey(Map<String, Object> payload) {
        return Objects.toString(payload.get("__domain__"), "")
                + "\u0000" + Objects.toString(payload.get("__entity_type__"), "")
                + "\u0000" + Objects.toString(payload.get("__entity_id__"), "");
    }

    private static String relationKey(Map<String, Object> payload) {
        return Objects.toString(payload.get("__src_domain__"), "")
                + "\u0000" + Objects.toString(payload.get("__src_entity_type__"), "")
                + "\u0000" + Objects.toString(payload.get("__src_entity_id__"), "")
                + "\u0000" + Objects.toString(payload.get("__relation_type__"), "")
                + "\u0000" + Objects.toString(payload.get("__dest_domain__"), "")
                + "\u0000" + Objects.toString(payload.get("__dest_entity_type__"), "")
                + "\u0000" + Objects.toString(payload.get("__dest_entity_id__"), "");
    }

    private static boolean isDeleteMethod(Map<String, Object> payload) {
        String method = Objects.toString(payload.get("__method__"), "");
        return "Delete".equalsIgnoreCase(method) || "Expire".equalsIgnoreCase(method);
    }

    private static void removeEntity(WorkspaceData data, Map<String, Object> payload) {
        String id = Objects.toString(payload.get("__entity_id__"), "");
        if (!Objects.toString(payload.get("__domain__"), "").isBlank()
                && !Objects.toString(payload.get("__entity_type__"), "").isBlank()) {
            data.entities.remove(entityKey(payload));
            return;
        }
        data.entities.entrySet().removeIf(entry -> Objects.equals(id, Objects.toString(entry.getValue().get("__entity_id__"), "")));
    }

    private static void removeRelation(WorkspaceData data, Map<String, Object> payload) {
        String relationId = Objects.toString(payload.get("__relation_id__"), "");
        if (!Objects.toString(payload.get("__src_domain__"), "").isBlank()
                && !Objects.toString(payload.get("__src_entity_type__"), "").isBlank()
                && !Objects.toString(payload.get("__relation_type__"), "").isBlank()
                && !Objects.toString(payload.get("__dest_domain__"), "").isBlank()
                && !Objects.toString(payload.get("__dest_entity_type__"), "").isBlank()) {
            data.relations.remove(relationKey(payload));
            return;
        }
        data.relations.entrySet().removeIf(entry -> Objects.equals(relationId, Objects.toString(entry.getValue().get("__relation_id__"), ""))
                || Objects.equals(relationId, relationKey(entry.getValue())));
    }

    private static boolean isGraphCall(String graphCall, String method) {
        return graphCall != null
                && graphCall.trim().toLowerCase(java.util.Locale.ROOT)
                .startsWith(method.toLowerCase(java.util.Locale.ROOT) + "(");
    }

    private static Set<String> graphCallIds(String graphCall) {
        if (graphCall == null || graphCall.isBlank()) {
            return Set.of();
        }
        int start = graphCall.indexOf('[');
        int end = graphCall.indexOf(']', Math.max(start, 0));
        if (start < 0 || end <= start) {
            return Set.of();
        }
        String raw = graphCall.substring(start + 1, end).trim();
        if (raw.isBlank()) {
            return Set.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        Matcher matcher = QUOTED_ARG_PATTERN.matcher(raw);
        while (matcher.find()) {
            String value = matcher.group(1) == null ? matcher.group(2) : matcher.group(1);
            if (looksLikeEntityId(value)) {
                ids.add(value);
            }
        }
        if (!ids.isEmpty()) {
            return ids;
        }
        for (String token : raw.split(",")) {
            String value = token.trim();
            if (!value.isBlank()) {
                ids.add(value);
            }
        }
        return ids;
    }

    private static Map<String, Object> edgeRow(WorkspaceData data, Map<String, Object> relation) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("src", entityById(data, relation, "__src_entity_id__"));
        row.put("relation", new LinkedHashMap<>(relation));
        row.put("dest", entityById(data, relation, "__dest_entity_id__"));
        row.put("__relation_type__", relation.get("__relation_type__"));
        row.put("__src_entity_id__", relation.get("__src_entity_id__"));
        row.put("__dest_entity_id__", relation.get("__dest_entity_id__"));
        row.put("__src_domain__", relation.get("__src_domain__"));
        row.put("__dest_domain__", relation.get("__dest_domain__"));
        row.put("__src_entity_type__", relation.get("__src_entity_type__"));
        row.put("__dest_entity_type__", relation.get("__dest_entity_type__"));
        return row;
    }

    private static Map<String, Object> entityById(WorkspaceData data, String id) {
        for (Map<String, Object> entity : data.entities.values()) {
            if (Objects.equals(id, Objects.toString(entity.get("__entity_id__"), ""))) {
                return new LinkedHashMap<>(entity);
            }
        }
        return Map.of("__entity_id__", id);
    }

    private static Set<String> allEntityIds(WorkspaceData data) {
        Set<String> ids = new LinkedHashSet<>();
        for (Map<String, Object> entity : data.entities.values()) {
            String id = Objects.toString(entity.get("__entity_id__"), "");
            if (!id.isBlank()) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static boolean matchesFilters(Map<String, Object> filters, Map<String, Object> row) {
        if (filters == null || filters.isEmpty()) {
            return true;
        }
        for (Map.Entry<String, Object> entry : filters.entrySet()) {
            String key = entry.getKey();
            if (List.of("domain", "name", "ids", "query", "mode", "topk").contains(key)) {
                continue;
            }
            Object actual = row.get(key);
            if (actual == null && key.contains(".")) {
                actual = nestedAliasValue(row, key);
            }
            if (actual == null && row.get("relation") instanceof Map<?, ?> relation) {
                actual = relation.get(key);
            }
            if (actual == null && row.get("node") instanceof Map<?, ?> node) {
                actual = node.get(key);
            }
            if (actual == null && row.get("src") instanceof Map<?, ?> src) {
                actual = src.get(key);
            }
            if (actual == null && row.get("dest") instanceof Map<?, ?> dest) {
                actual = dest.get(key);
            }
            if (!Objects.equals(Objects.toString(entry.getValue(), ""), Objects.toString(actual, ""))) {
                return false;
            }
        }
        return true;
    }

    private static String graphScope(String graphCall) {
        List<String> args = graphArgs(graphCall);
        return args.isEmpty() ? "full" : trimQuotes(args.get(0)).toLowerCase(java.util.Locale.ROOT);
    }

    private static int graphDepth(String graphCall) {
        List<String> args = graphArgs(graphCall);
        if (args.size() < 2) {
            return 1;
        }
        try {
            return Integer.parseInt(trimQuotes(args.get(1)));
        } catch (NumberFormatException ignored) {
            return 1;
        }
    }

    private static List<String> graphArgs(String graphCall) {
        if (graphCall == null) {
            return List.of();
        }
        int open = graphCall.indexOf('(');
        int close = graphCall.lastIndexOf(')');
        if (open < 0 || close <= open) {
            return List.of();
        }
        String inner = graphCall.substring(open + 1, close);
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        boolean quoted = false;
        char quote = 0;
        for (int i = 0; i < inner.length(); i++) {
            char ch = inner.charAt(i);
            if ((ch == '\'' || ch == '"' || ch == '`') && (quote == 0 || quote == ch)) {
                quoted = !quoted;
                quote = quoted ? ch : 0;
            } else if (!quoted) {
                if (ch == '[') {
                    bracketDepth++;
                } else if (ch == ']') {
                    bracketDepth--;
                }
            }
            if (ch == ',' && bracketDepth == 0 && !quoted) {
                out.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        if (current.length() > 0) {
            out.add(current.toString().trim());
        }
        return out;
    }

    private static String cypherText(String graphCall) {
        List<String> args = graphArgs(graphCall);
        return args.isEmpty() ? "" : trimQuotes(args.get(0));
    }

    private static int cypherLimit(String graphCall) {
        Matcher matcher = CYPHER_LIMIT_PATTERN.matcher(cypherText(graphCall));
        if (!matcher.find()) {
            return 0;
        }
        return Integer.parseInt(matcher.group(1));
    }

    private static Set<String> cypherEntityIds(String cypher) {
        if (cypher == null || cypher.isBlank()) {
            return Set.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        Matcher matcher = CYPHER_ENTITY_ID_PATTERN.matcher(cypher);
        while (matcher.find()) {
            String value = matcher.group(1);
            if (looksLikeEntityId(value)) {
                ids.add(value);
            }
        }
        return ids;
    }

    private static Map<String, Object> cypherWhereFilters(String cypher) {
        if (cypher == null || cypher.isBlank()) {
            return Map.of();
        }
        Matcher matcher = CYPHER_WHERE_EQ_PATTERN.matcher(cypher);
        if (!matcher.find()) {
            return Map.of();
        }
        return Map.of(matcher.group(1), matcher.group(2));
    }

    private static Object nestedAliasValue(Map<String, Object> row, String key) {
        int dot = key.indexOf('.');
        if (dot <= 0 || dot + 1 >= key.length()) {
            return null;
        }
        String alias = key.substring(0, dot);
        String field = key.substring(dot + 1);
        Object nested = switch (alias) {
            case "src" -> row.get("src");
            case "dest" -> row.get("dest");
            case "r", "relation" -> row.get("relation");
            case "node" -> row.get("node");
            default -> null;
        };
        if (nested instanceof Map<?, ?> map) {
            return map.get(field);
        }
        return null;
    }

    private static String trimQuotes(String value) {
        String text = value == null ? "" : value.trim();
        if (text.length() >= 2) {
            char first = text.charAt(0);
            char last = text.charAt(text.length() - 1);
            if ((first == '\'' && last == '\'') || (first == '"' && last == '"') || (first == '`' && last == '`')) {
                return text.substring(1, text.length() - 1);
            }
        }
        return text;
    }

    private static boolean allowsOut(String scope) {
        return !"sequence_in".equals(scope);
    }

    private static boolean allowsIn(String scope) {
        return !"sequence_out".equals(scope);
    }

    private static boolean looksLikeEntityId(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        return value.length() >= 8 && !value.contains("@") && !List.of("full", "sequence", "sequence_in", "sequence_out").contains(value);
    }

    private static List<Map<String, Object>> copyRows(List<Map<String, Object>> rows) {
        List<Map<String, Object>> copy = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            copy.add(new LinkedHashMap<>(row));
        }
        return copy;
    }

    private static <T> List<T> nullToList(List<T> values) {
        return values == null ? List.of() : values;
    }

    public record WorkspaceSnapshot(
            String workspace,
            List<UModelElement> elements,
            List<Map<String, Object>> entities,
            List<Map<String, Object>> relations,
            long version
    ) {
    }

    protected static final class WorkspaceData {
        private final Map<String, UModelElement> elements = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> entities = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> relations = new LinkedHashMap<>();
        private long version;
    }
}
