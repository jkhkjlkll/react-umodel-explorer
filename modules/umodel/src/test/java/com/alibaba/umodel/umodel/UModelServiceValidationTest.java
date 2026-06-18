package com.alibaba.umodel.umodel;

import com.alibaba.umodel.contract.UModelModels.ErrorDetail;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UModelServiceValidationTest {
    private static final String WORKSPACE = "demo";

    @Test
    void acceptsListFieldSchemasWithNameAndType() {
        ValidationResult result = service().validate(WORKSPACE, List.of(
                new UModelElement(null, "entity_set", "devops", "devops.service", Map.of(
                        "fields", List.of(
                                Map.of("name", "id", "type", "string"),
                                Map.of("name", "environment", "type", "string")
                        )
                ), Map.of())
        ));

        assertTrue(result.valid(), () -> result.errors().toString());
    }

    @Test
    void rejectsListFieldSchemasWithoutNameOrType() {
        ValidationResult result = service().validate(WORKSPACE, List.of(
                new UModelElement(null, "entity_set", "devops", "devops.service", Map.of(
                        "fields", List.of(
                                Map.of("name", "id"),
                                Map.of("type", "string")
                        )
                ), Map.of())
        ));

        assertFalse(result.valid());
        assertErrorContains(result, "spec.fields[0].type");
        assertErrorContains(result, "spec.fields[1].name");
    }

    @Test
    void rejectsMetricItemsWithoutName() {
        ValidationResult result = service().validate(WORKSPACE, List.of(
                new UModelElement(null, "metric_set", "devops", "devops.metric.service", Map.of(
                        "fields", Map.of("service_id", Map.of("type", "string")),
                        "metrics", List.of(Map.of("unit", "count"))
                ), Map.of())
        ));

        assertFalse(result.valid());
        assertErrorContains(result, "spec.metrics[0].name");
    }

    @Test
    void rejectsInvalidDataLinkAndStorageLinkEndpointKinds() {
        ValidationResult result = service().validate(WORKSPACE, List.of(
                entitySet(),
                metricSet(),
                storage(),
                new UModelElement(null, "data_link", "devops", "bad.data.link", Map.of(
                        "src", Map.of("domain", "devops", "kind", "prometheus", "name", "devops.prometheus.core"),
                        "dest", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "fields_mapping", Map.of("id", "service_id")
                ), Map.of()),
                new UModelElement(null, "storage_link", "devops", "bad.storage.link", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "fields_mapping", Map.of("service_id", "service_id")
                ), Map.of())
        ));

        assertFalse(result.valid());
        assertErrorContains(result, "source must be entity_set or data set kind");
        assertErrorContains(result, "source must be a data set kind");
    }

    @Test
    void rejectsEmptyFieldsMapping() {
        ValidationResult result = service().validate(WORKSPACE, List.of(
                entitySet(),
                metricSet(),
                new UModelElement(null, "data_link", "devops", "empty.mapping", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "fields_mapping", Map.of()
                ), Map.of())
        ));

        assertFalse(result.valid());
        assertErrorContains(result, "fields_mapping must not be empty");
    }

    private static UModelService service() {
        return new UModelService(new MemoryGraphStore());
    }

    private static UModelElement entitySet() {
        return new UModelElement(null, "entity_set", "devops", "devops.service", Map.of(
                "fields", Map.of("id", Map.of("type", "string"))
        ), Map.of());
    }

    private static UModelElement metricSet() {
        return new UModelElement(null, "metric_set", "devops", "devops.metric.service", Map.of(
                "fields", Map.of("service_id", Map.of("type", "string")),
                "metrics", List.of(Map.of("name", "request_count"))
        ), Map.of());
    }

    private static UModelElement storage() {
        return new UModelElement(null, "prometheus", "devops", "devops.prometheus.core", Map.of(
                "endpoint", "http://localhost:9090"
        ), Map.of());
    }

    private static void assertErrorContains(ValidationResult result, String text) {
        assertTrue(result.errors().stream().map(ErrorDetail::field).anyMatch(field -> field.contains(text))
                        || result.errors().stream().map(ErrorDetail::reason).anyMatch(reason -> reason.contains(text)),
                () -> result.errors().toString());
    }

}
