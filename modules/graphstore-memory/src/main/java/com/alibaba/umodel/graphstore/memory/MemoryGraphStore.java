package com.alibaba.umodel.graphstore.memory;

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
import java.util.HashSet;
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
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> ids = graphCallIds(plan.graphCall());
        for (Map<String, Object> relation : data.relations.values()) {
            if (!ids.isEmpty()
                    && !ids.contains(Objects.toString(relation.get("__src_entity_id__"), ""))
                    && !ids.contains(Objects.toString(relation.get("__dest_entity_id__"), ""))) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("src", entityById(data, relation, "__src_entity_id__"));
            row.put("relation", new LinkedHashMap<>(relation));
            row.put("dest", entityById(data, relation, "__dest_entity_id__"));
            rows.add(row);
        }
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    @Override
    public GraphStoreCapabilities capabilities() {
        return new GraphStoreCapabilities(providerName(), true, false);
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
        String needle = Objects.toString(query, "").toLowerCase();
        return entity.values().stream()
                .map(value -> Objects.toString(value, "").toLowerCase())
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
        Set<String> ids = graphCallIds(plan.graphCall());
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> relation : data.relations.values()) {
            String srcId = Objects.toString(relation.get("__src_entity_id__"), "");
            String destId = Objects.toString(relation.get("__dest_entity_id__"), "");
            if (ids.isEmpty() || ids.contains(srcId)) {
                addNeighborRow(data, rows, seen, relation, "__dest_entity_id__", "out");
            }
            if (ids.isEmpty() || ids.contains(destId)) {
                addNeighborRow(data, rows, seen, relation, "__src_entity_id__", "in");
            }
        }
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    private static void addNeighborRow(
            WorkspaceData data,
            List<Map<String, Object>> rows,
            Set<String> seen,
            Map<String, Object> relation,
            String nodeField,
            String direction
    ) {
        String nodeId = Objects.toString(relation.get(nodeField), "");
        String key = nodeId + "\u0000" + Objects.toString(relation.get("__relation_type__"), "") + "\u0000" + direction;
        if (!seen.add(key)) {
            return;
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("node", entityById(data, relation, nodeField));
        row.put("relation", new LinkedHashMap<>(relation));
        row.put("direction", direction);
        rows.add(row);
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
        return graphCall != null && graphCall.trim().toLowerCase().startsWith(method.toLowerCase() + "(");
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
        Set<String> ids = new HashSet<>();
        Matcher matcher = QUOTED_ARG_PATTERN.matcher(raw);
        while (matcher.find()) {
            ids.add(matcher.group(1) == null ? matcher.group(2) : matcher.group(1));
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
