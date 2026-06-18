package com.alibaba.umodel.query;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.TelemetryCapabilities;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataRequest;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataResult;
import com.alibaba.umodel.contract.UModelModels.TelemetryHealth;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;
import com.alibaba.umodel.query.telemetry.TelemetryService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static com.alibaba.umodel.contract.UModelModels.AGENT_PLAN_RESULT_COLUMN;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueryServiceParityTest {
    private static final String WORKSPACE = "demo";

    @Test
    void metricPlanIncludesPrometheusParityFields() {
        QueryResult result = serviceWithFixture().execute(WORKSPACE, new QueryRequest(
                ".entity_set with(domain='devops', name='devops.service', ids=['svc-1']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', query='environment = \"prod\"', step='30s')",
                Map.of(),
                20,
                null,
                null,
                "agent"
        ));

        Map<String, Object> plan = agentPlan(result);
        Map<String, Object> query = map(plan.get("query"));

        assertEquals("get_metrics", plan.get("operation"));
        assertEquals("prometheus_promql", query.get("dialect"));
        assertEquals("/api/v1", query.get("api_prefix"));
        assertEquals("tenant-a", query.get("tenant"));
        assertEquals(Map.of("cluster", "prod-a"), query.get("external_labels"));
        assertTrue(stringValue(query.get("entity_ids")).contains("svc-1"));
        assertTrue(stringValue(query.get("label_matchers")).contains("service_id"));
        assertTrue(stringValue(query.get("label_matchers")).contains("environment"));
        assertTrue(stringValue(query.get("queries")).contains("service_id=\"svc-1\""));
        assertTrue(stringValue(query.get("queries")).contains("environment=\"prod\""));
    }

    @Test
    void logPlanIncludesElasticsearchBodyAndMappedSourceFields() {
        QueryResult result = serviceWithFixture().execute(WORKSPACE, new QueryRequest(
                ".entity_set with(domain='devops', name='devops.service', ids=['svc-1']) | entity-call get_logs('devops', 'devops.log.service', query='severity = \"ERROR\"')",
                Map.of(),
                20,
                null,
                null,
                "agent"
        ));

        Map<String, Object> plan = agentPlan(result);
        Map<String, Object> query = map(plan.get("query"));
        Map<String, Object> body = map(query.get("body"));

        assertEquals("get_logs", plan.get("operation"));
        assertEquals("elasticsearch_dsl", query.get("dialect"));
        assertEquals("devops-service-logs-*", query.get("index"));
        assertEquals(20, body.get("size"));
        assertTrue(stringValue(body.get("query")).contains("svc_id"));
        assertTrue(stringValue(body.get("query")).contains("ERROR"));
        assertTrue(stringValue(body.get("_source")).contains("svc_id"));
        assertTrue(stringValue(body.get("_source")).contains("severity"));
    }

    @Test
    void runbookSetSearchIncludesSkillSectionsAndSingularAlias() {
        QueryResult result = serviceWithFixture().execute(WORKSPACE, new QueryRequest(
                ".runbook_set with(domain='devops', type='skill', query='rca', mode='hyper', topk=5)",
                Map.of(),
                20,
                null,
                null,
                null
        ));

        assertFalse(result.rows().isEmpty());
        assertEquals("skills", result.rows().get(0).get("type"));
        assertEquals("devops.runbook_set", result.rows().get(0).get("source"));
        assertEquals("memory", result.explain().searchProvider());
        assertEquals("memory-token-overlap", result.explain().embedModel());
    }

    @Test
    void dataModeExecutesTelemetryProviderWhenConfigured() {
        MemoryGraphStore graphStore = graphStoreWithFixture();
        QueryService service = new QueryService(graphStore, null, new FakeTelemetryService());

        QueryResult result = service.execute(WORKSPACE, new QueryRequest(
                ".entity_set with(domain='devops', name='devops.service', ids=['svc-1']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count')",
                Map.of(),
                20,
                null,
                null,
                null,
                "data",
                null
        ));

        assertTrue(result.columns().contains("operation"));
        assertTrue(result.columns().contains("workspace"));
        assertEquals("get_metrics", result.rows().get(0).get("operation"));
        assertEquals(WORKSPACE, result.rows().get(0).get("workspace"));
    }

    @Test
    void dataModeRejectsSourcesWithoutTelemetryMeaning() {
        UModelException error = assertThrows(UModelException.class, () -> serviceWithFixture().execute(WORKSPACE, new QueryRequest(
                ".umodel | limit 1",
                Map.of(),
                20,
                null,
                null,
                null,
                "data",
                null
        )));

        assertEquals(ErrorCodes.INVALID_ARGUMENT, error.code());
        assertTrue(error.getMessage().contains("mode=data"));
    }

    private static QueryService serviceWithFixture() {
        return new QueryService(graphStoreWithFixture());
    }

    private static MemoryGraphStore graphStoreWithFixture() {
        MemoryGraphStore graphStore = new MemoryGraphStore();
        graphStore.putUModelElements(new UModelElementBatch(WORKSPACE, fixtureElements(), false, "query-parity-fixture"));
        return graphStore;
    }

    private static List<UModelElement> fixtureElements() {
        return List.of(
                new UModelElement(null, "entity_set", "devops", "devops.service", Map.of(
                        "fields", Map.of(
                                "id", Map.of("type", "string"),
                                "environment", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "metric_set", "devops", "devops.metric.service", Map.of(
                        "fields", Map.of(
                                "service_id", Map.of("type", "string"),
                                "environment", Map.of("type", "string")
                        ),
                        "metrics", List.of(
                                Map.of(
                                        "name", "request_count",
                                        "unit", "count",
                                        "query_mode", "range",
                                        "generator", "sum(rate(request_count{service_id=\"$service_id\"}[5m]))"
                                )
                        )
                ), Map.of()),
                new UModelElement(null, "log_set", "devops", "devops.log.service", Map.of(
                        "fields", Map.of(
                                "service_id", Map.of("type", "string"),
                                "severity", Map.of("type", "string"),
                                "message", Map.of("type", "string")
                        ),
                        "index", "devops-service-logs-*"
                ), Map.of()),
                new UModelElement(null, "prometheus", "devops", "devops.prometheus.core", Map.of(
                        "endpoint", "http://localhost:9090",
                        "api_prefix", "/api/v1",
                        "tenant", "tenant-a",
                        "external_labels", Map.of("cluster", "prod-a")
                ), Map.of()),
                new UModelElement(null, "elasticsearch", "devops", "devops.elasticsearch.logs", Map.of(
                        "endpoint", "http://localhost:9200",
                        "index", "devops-service-logs-*",
                        "default_size", 1000
                ), Map.of()),
                new UModelElement(null, "data_link", "devops", "devops.service_to_metrics", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "fields_mapping", Map.of("id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "data_link", "devops", "devops.service_to_logs", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "log_set", "name", "devops.log.service"),
                        "fields_mapping", Map.of("id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "storage_link", "devops", "devops.metric_to_prometheus", Map.of(
                        "src", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "dest", Map.of("domain", "devops", "kind", "prometheus", "name", "devops.prometheus.core"),
                        "fields_mapping", Map.of("service_id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "storage_link", "devops", "devops.log_to_elasticsearch", Map.of(
                        "src", Map.of("domain", "devops", "kind", "log_set", "name", "devops.log.service"),
                        "dest", Map.of("domain", "devops", "kind", "elasticsearch", "name", "devops.elasticsearch.logs"),
                        "fields_mapping", Map.of("service_id", "svc_id", "severity", "severity", "message", "message")
                ), Map.of()),
                new UModelElement(null, "runbook_set", "devops", "devops.service.ops", Map.of(
                        "skills", List.of(
                                Map.of(
                                        "name", "umodel-rca",
                                        "title", "Java RCA skill",
                                        "description", "Use rca queries for incidents."
                                )
                        )
                ), Map.of())
        );
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> agentPlan(QueryResult result) {
        assertEquals(List.of(AGENT_PLAN_RESULT_COLUMN), result.columns());
        Object payload = result.rows().get(0).get(AGENT_PLAN_RESULT_COLUMN);
        return assertInstanceOf(Map.class, payload);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return assertInstanceOf(Map.class, value);
    }

    private static String stringValue(Object value) {
        return String.valueOf(value);
    }

    private static final class FakeTelemetryService implements TelemetryService {
        @Override
        public TelemetryDataResult execute(TelemetryDataRequest request) {
            return new TelemetryDataResult(
                    List.of(Map.<String, Object>of("operation", request.operation(), "workspace", request.workspace())),
                    List.of("operation", "workspace"),
                    Map.<String, Object>of("provider", "fake")
            );
        }

        @Override
        public TelemetryCapabilities capabilities() {
            return new TelemetryCapabilities("fake", true, true, false, false);
        }

        @Override
        public TelemetryHealth health() {
            return new TelemetryHealth("fake", "ok", "test telemetry provider");
        }
    }
}
