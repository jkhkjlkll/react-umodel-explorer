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
                                "id", Map.of("type", "string"),
                                "name", Map.of("type", "string"),
                                "display_name", Map.of("type", "string"),
                                "environment", Map.of("type", "string")
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
                ), Map.of()),
                new UModelElement(null, "metric_set", "devops", "devops.metric.service", Map.of(
                        "display_name", "Service metrics",
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
                                ),
                                Map.of(
                                        "name", "latency_p99_ms",
                                        "unit", "ms",
                                        "query_mode", "range",
                                        "generator", "histogram_quantile(0.99, sum(rate(request_duration_bucket{service_id=\"$service_id\"}[5m])) by (le))"
                                )
                        )
                ), Map.of()),
                new UModelElement(null, "log_set", "devops", "devops.log.service", Map.of(
                        "display_name", "Service logs",
                        "fields", Map.of(
                                "service_id", Map.of("type", "string"),
                                "severity", Map.of("type", "string"),
                                "message", Map.of("type", "string")
                        ),
                        "index", "devops-service-logs-*"
                ), Map.of()),
                new UModelElement(null, "prometheus", "devops", "devops.prometheus.core", Map.of(
                        "endpoint", "http://localhost:9090",
                        "default_step", "30s"
                ), Map.of()),
                new UModelElement(null, "elasticsearch", "devops", "devops.elasticsearch.logs", Map.of(
                        "endpoint", "http://localhost:9200",
                        "index", "devops-service-logs-*"
                ), Map.of()),
                new UModelElement(null, "data_link", "devops", "devops.service_related_to_devops.metric.service", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "fields_mapping", Map.of("id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "data_link", "devops", "devops.service_related_to_devops.log.service", Map.of(
                        "src", Map.of("domain", "devops", "kind", "entity_set", "name", "devops.service"),
                        "dest", Map.of("domain", "devops", "kind", "log_set", "name", "devops.log.service"),
                        "fields_mapping", Map.of("id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "storage_link", "devops", "devops.metric.service_to_prometheus", Map.of(
                        "src", Map.of("domain", "devops", "kind", "metric_set", "name", "devops.metric.service"),
                        "dest", Map.of("domain", "devops", "kind", "prometheus", "name", "devops.prometheus.core"),
                        "fields_mapping", Map.of("service_id", "service_id", "environment", "environment")
                ), Map.of()),
                new UModelElement(null, "storage_link", "devops", "devops.log.service_to_elasticsearch", Map.of(
                        "src", Map.of("domain", "devops", "kind", "log_set", "name", "devops.log.service"),
                        "dest", Map.of("domain", "devops", "kind", "elasticsearch", "name", "devops.elasticsearch.logs"),
                        "fields_mapping", Map.of("service_id", "svc_id", "severity", "severity")
                ), Map.of()),
                new UModelElement(null, "runbook_set", "devops", "devops.service.ops", Map.of(
                        "display_name", "Service operations runbook",
                        "knowledge", List.of(
                                Map.of(
                                        "name", "checkout-latency",
                                        "title", "Checkout latency investigation",
                                        "summary", "Use service metrics, error logs, and runs_on topology to separate application latency from workload placement issues.",
                                        "signals", List.of("latency_p99_ms", "request_count", "ERROR logs"),
                                        "actions", List.of("Check get_metrics latency_p99_ms", "Check get_logs ERROR", "Traverse k8s workload with getNeighborNodes")
                                ),
                                Map.of(
                                        "name", "retry-or-load-spike",
                                        "title", "Retry or traffic spike",
                                        "summary", "A request_count increase with ERROR logs can indicate retry amplification or upstream traffic change.",
                                        "actions", List.of("Compare request_count against baseline", "Look for timeout messages", "Confirm topology direction")
                                )
                        ),
                        "observations", List.of(
                                Map.of(
                                        "name", "checkout-error-signature",
                                        "description", "ERROR logs plus rising latency_p99_ms indicate a service-side symptom that should be correlated with topology."
                                )
                        ),
                        "actions", List.of(
                                Map.of(
                                        "name", "inspect_checkout_neighbors",
                                        "action_type", "mcp",
                                        "description", "Use query_spl_execute to inspect direct and multi-hop topology neighbors before recommending remediation."
                                )
                        ),
                        "automations", List.of(
                                Map.of(
                                        "name", "collect_checkout_context",
                                        "description", "Collect checkout service metrics, logs, and direct topology neighbors."
                                )
                        ),
                        "skills", List.of(
                                Map.of(
                                        "name", "umodel-rca",
                                        "display_name", Map.of("en_us", "UModel Java RCA", "zh_cn", "UModel Java 根因分析"),
                                        "description", Map.of(
                                                "en_us", "Investigate incidents through Java backend entity, topology, telemetry plan, and runbook queries.",
                                                "zh_cn", "通过 Java 后端实体、拓扑、遥测计划和 Runbook 查询排查故障。"
                                        ),
                                        "compatibility", "Java backend HTTP/MCP query surfaces"
                                )
                        )
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
                        "id", "10000000000000000000000000000101",
                        "name", "checkout",
                        "display_name", "Checkout Service",
                        "environment", "prod"
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
