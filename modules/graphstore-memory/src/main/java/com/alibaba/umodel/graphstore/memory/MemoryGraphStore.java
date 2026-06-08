package com.alibaba.umodel.graphstore.memory;

import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

public class MemoryGraphStore implements GraphStore {
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
        return WriteResult.accepted(accepted);
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
            String key = entityKey(payload);
            if (isDeleteMethod(payload)) {
                data.entities.remove(key);
            } else {
                data.entities.put(key, new LinkedHashMap<>(payload));
            }
            accepted++;
        }
        data.version++;
        return WriteResult.accepted(accepted);
    }

    @Override
    public WriteResult writeRelations(RelationWriteBatch batch) {
        WorkspaceData data = data(batch.workspace());
        int accepted = 0;
        for (Map<String, Object> payload : nullToList(batch.relations())) {
            String key = relationKey(payload);
            if (isDeleteMethod(payload)) {
                data.relations.remove(key);
            } else {
                data.relations.put(key, new LinkedHashMap<>(payload));
            }
            accepted++;
        }
        data.version++;
        return WriteResult.accepted(accepted);
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
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> relation : data.relations.values()) {
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

    private WorkspaceData data(String workspace) {
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

    private static <T> List<T> nullToList(List<T> values) {
        return values == null ? List.of() : values;
    }

    private static final class WorkspaceData {
        private final Map<String, UModelElement> elements = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> entities = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> relations = new LinkedHashMap<>();
        private long version;
    }
}
