package com.alibaba.umodel.entitystore;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.ErrorDetail;
import com.alibaba.umodel.contract.UModelModels.ExpireRequest;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.graphstore.GraphStore;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class EntityStoreService {
    private static final List<String> ENTITY_REQUIRED_FIELDS = List.of(
            "__domain__",
            "__entity_type__",
            "__entity_id__",
            "__method__",
            "__first_observed_time__",
            "__last_observed_time__"
    );

    private static final List<String> RELATION_REQUIRED_FIELDS = List.of(
            "__src_domain__",
            "__src_entity_type__",
            "__src_entity_id__",
            "__dest_domain__",
            "__dest_entity_type__",
            "__dest_entity_id__",
            "__relation_type__",
            "__method__",
            "__first_observed_time__",
            "__last_observed_time__"
    );

    private final GraphStore graphStore;

    public EntityStoreService(GraphStore graphStore) {
        this.graphStore = graphStore;
    }

    public WriteResult writeEntities(String workspace, EntityWriteBatch batch) {
        String targetWorkspace = requireWorkspace(workspace);
        List<Map<String, Object>> entities = batch == null || batch.entities() == null ? List.of() : batch.entities();
        for (Map<String, Object> entity : entities) {
            ValidationResult validation = validatePayload(entity, ENTITY_REQUIRED_FIELDS);
            if (!validation.valid()) {
                ErrorDetail first = validation.errors().get(0);
                throw new UModelException(
                        ErrorCodes.VALIDATION_FAILED,
                        "entity payload validation failed",
                        Map.of("field", first.field(), "reason", first.reason())
                );
            }
        }
        return graphStore.writeEntities(new EntityWriteBatch(
                targetWorkspace,
                batch == null ? null : batch.idempotencyKey(),
                batch != null && batch.partialSuccess(),
                entities
        ));
    }

    public WriteResult writeRelations(String workspace, RelationWriteBatch batch) {
        String targetWorkspace = requireWorkspace(workspace);
        List<Map<String, Object>> relations = batch == null || batch.relations() == null ? List.of() : batch.relations();
        for (Map<String, Object> relation : relations) {
            ValidationResult validation = validatePayload(relation, RELATION_REQUIRED_FIELDS);
            if (!validation.valid()) {
                ErrorDetail first = validation.errors().get(0);
                throw new UModelException(
                        ErrorCodes.VALIDATION_FAILED,
                        "relation payload validation failed",
                        Map.of("field", first.field(), "reason", first.reason())
                );
            }
        }
        return graphStore.writeRelations(new RelationWriteBatch(
                targetWorkspace,
                batch == null ? null : batch.idempotencyKey(),
                batch != null && batch.partialSuccess(),
                relations
        ));
    }

    public WriteResult expireEntities(String workspace, ExpireRequest request) {
        long now = Instant.now().getEpochSecond();
        List<Map<String, Object>> payloads = request == null || request.ids() == null
                ? List.of()
                : request.ids().stream().map(id -> expireEntityPayload(id, now)).toList();
        return graphStore.writeEntities(new EntityWriteBatch(workspace, null, true, payloads));
    }

    public WriteResult expireRelations(String workspace, ExpireRequest request) {
        long now = Instant.now().getEpochSecond();
        List<Map<String, Object>> payloads = request == null || request.ids() == null
                ? List.of()
                : request.ids().stream().map(id -> expireRelationPayload(id, now)).toList();
        return graphStore.writeRelations(new RelationWriteBatch(workspace, null, true, payloads));
    }

    private static ValidationResult validatePayload(Map<String, Object> payload, List<String> fields) {
        for (String field : fields) {
            Object value = payload == null ? null : payload.get(field);
            if (value == null || Objects.toString(value, "").isBlank()) {
                return ValidationResult.invalid(field, "required CMS 2.0 field is missing");
            }
        }
        return ValidationResult.ok();
    }

    private static Map<String, Object> expireEntityPayload(String id, long now) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("__entity_id__", id);
        payload.put("__method__", "Expire");
        payload.put("__first_observed_time__", now);
        payload.put("__last_observed_time__", now);
        return payload;
    }

    private static Map<String, Object> expireRelationPayload(String id, long now) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("__relation_id__", id);
        payload.put("__method__", "Expire");
        payload.put("__first_observed_time__", now);
        payload.put("__last_observed_time__", now);
        return payload;
    }

    private static String requireWorkspace(String workspace) {
        if (workspace == null || workspace.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace is required");
        }
        return workspace;
    }
}
