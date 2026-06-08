package com.alibaba.umodel.sampledata;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.SampleImportResult;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UModelImportResult;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.umodel.UModelService;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public class SampleDataService {
    public static final String MULTI_DOMAIN_QUICKSTART = "multi-domain-quickstart";

    private final UModelService umodelService;
    private final EntityStoreService entityStoreService;

    public SampleDataService(UModelService umodelService, EntityStoreService entityStoreService) {
        this.umodelService = umodelService;
        this.entityStoreService = entityStoreService;
    }

    public SampleImportResult importSample(String workspace, String sample) {
        if (!isQuickstart(sample)) {
            throw new UModelException(ErrorCodes.NOT_FOUND, "sample not found");
        }
        List<UModelElement> elements = List.of(
                new UModelElement(null, "entity_set", "devops", "devops.service", Map.of(
                        "display_name", "Service",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "display_name", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "k8s", "k8s.workload", Map.of(
                        "display_name", "Kubernetes workload",
                        "fields", Map.of(
                                "namespace", Map.of("type", "string"),
                                "name", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "service_to_workload", Map.of(
                        "source", "devops.service",
                        "target", "k8s.workload",
                        "relation", "runs_on"
                ), Map.of())
        );
        UModelImportResult umodel = umodelService.importElements(
                workspace,
                new UModelImportRequest("builtin:" + MULTI_DOMAIN_QUICKSTART, elements)
        );

        long now = Instant.now().getEpochSecond();
        List<Map<String, Object>> entities = List.of(
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.service",
                        "__entity_id__", "10000000000000000000000000000101",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "checkout",
                        "display_name", "Checkout Service"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.workload",
                        "__entity_id__", "10000000000000000000000000000201",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "checkout"
                )
        );
        WriteResult entityResult = entityStoreService.writeEntities(
                workspace,
                new EntityWriteBatch(workspace, MULTI_DOMAIN_QUICKSTART + ":entities:v1", false, entities)
        );

        List<Map<String, Object>> relations = List.of(
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000101",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.workload",
                        "__dest_entity_id__", "10000000000000000000000000000201",
                        "__relation_type__", "runs_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                )
        );
        WriteResult relationResult = entityStoreService.writeRelations(
                workspace,
                new RelationWriteBatch(workspace, MULTI_DOMAIN_QUICKSTART + ":relations:v1", false, relations)
        );
        return new SampleImportResult(
                workspace,
                MULTI_DOMAIN_QUICKSTART,
                umodel,
                entityResult,
                relationResult,
                entities.size(),
                relations.size()
        );
    }

    private static boolean isQuickstart(String sample) {
        if (sample == null || sample.isBlank()) {
            return true;
        }
        String normalized = sample.trim().toLowerCase();
        return MULTI_DOMAIN_QUICKSTART.equals(normalized)
                || "quickstart".equals(normalized)
                || "quickstart-multidomain".equals(normalized);
    }
}

