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
import java.util.LinkedHashMap;
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
                                "environment", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "k8s", "k8s.workload", Map.of(
                        "display_name", "Kubernetes workload",
                        "fields", Map.of(
                                "namespace", Map.of("type", "string"),
                                "name", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "devops", "devops.gateway", Map.of(
                        "display_name", "API gateway",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "environment", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "devops", "devops.job", Map.of(
                        "display_name", "Scheduled job",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "schedule", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "k8s", "k8s.pod", Map.of(
                        "display_name", "Kubernetes pod",
                        "fields", Map.of(
                                "namespace", Map.of("type", "string"),
                                "name", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "k8s", "k8s.node", Map.of(
                        "display_name", "Kubernetes node",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "cloud", "cloud.slb", Map.of(
                        "display_name", "Server load balancer",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "db", "db.mysql", Map.of(
                        "display_name", "MySQL database",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "engine", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "cache", "cache.redis", Map.of(
                        "display_name", "Redis cache",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "engine", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set", "mq", "mq.kafka_topic", Map.of(
                        "display_name", "Kafka topic",
                        "fields", Map.of(
                                "name", Map.of("type", "string"),
                                "cluster", Map.of("type", "string"),
                                "regine_code", Map.of("type", "string"),
                                "az_code", Map.of("type", "string")
                        )
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "service_to_workload", Map.of(
                        "source", "devops.service",
                        "target", "k8s.workload",
                        "relation", "runs_on"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "gateway_to_service", Map.of(
                        "source", "devops.gateway",
                        "target", "devops.service",
                        "relation", "routes_to"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "k8s", "workload_to_pod", Map.of(
                        "source", "k8s.workload",
                        "target", "k8s.pod",
                        "relation", "creates"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "k8s", "pod_to_node", Map.of(
                        "source", "k8s.pod",
                        "target", "k8s.node",
                        "relation", "scheduled_on"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "service_to_mysql", Map.of(
                        "source", "devops.service",
                        "target", "db.mysql",
                        "relation", "reads_writes"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "service_to_redis", Map.of(
                        "source", "devops.service",
                        "target", "cache.redis",
                        "relation", "uses_cache"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "devops", "service_to_topic", Map.of(
                        "source", "devops.service",
                        "target", "mq.kafka_topic",
                        "relation", "publishes"
                ), Map.of()),
                new UModelElement(null, "entity_set_link", "cloud", "slb_to_gateway", Map.of(
                        "source", "cloud.slb",
                        "target", "devops.gateway",
                        "relation", "forwards_to"
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
        List<Map<String, Object>> entities = withLocationFields(List.of(
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
                        "__domain__", "devops",
                        "__entity_type__", "devops.service",
                        "__entity_id__", "10000000000000000000000000000102",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "id", "10000000000000000000000000000102",
                        "name", "payment",
                        "display_name", "Payment Service",
                        "environment", "prod"
                ),
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.service",
                        "__entity_id__", "10000000000000000000000000000103",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "id", "10000000000000000000000000000103",
                        "name", "inventory",
                        "display_name", "Inventory Service",
                        "environment", "prod"
                ),
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.service",
                        "__entity_id__", "10000000000000000000000000000104",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "id", "10000000000000000000000000000104",
                        "name", "order",
                        "display_name", "Order Service",
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
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.workload",
                        "__entity_id__", "10000000000000000000000000000202",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "payment"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.workload",
                        "__entity_id__", "10000000000000000000000000000203",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "inventory"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.workload",
                        "__entity_id__", "10000000000000000000000000000204",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "order"
                ),
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.service",
                        "__entity_id__", "10000000000000000000000000000105",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "id", "10000000000000000000000000000105",
                        "name", "notification",
                        "display_name", "Notification Service",
                        "environment", "prod"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.workload",
                        "__entity_id__", "10000000000000000000000000000205",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "notification"
                ),
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.gateway",
                        "__entity_id__", "10000000000000000000000000000301",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "edge-gateway",
                        "display_name", "Edge Gateway",
                        "environment", "prod"
                ),
                Map.of(
                        "__domain__", "cloud",
                        "__entity_type__", "cloud.slb",
                        "__entity_id__", "10000000000000000000000000000302",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "public-slb",
                        "region", "cn-hangzhou"
                ),
                Map.of(
                        "__domain__", "devops",
                        "__entity_type__", "devops.job",
                        "__entity_id__", "10000000000000000000000000000303",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "inventory-sync",
                        "schedule", "*/5 * * * *"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.pod",
                        "__entity_id__", "10000000000000000000000000000401",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "checkout-7d9f"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.pod",
                        "__entity_id__", "10000000000000000000000000000402",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "namespace", "prod",
                        "name", "payment-6c4d"
                ),
                Map.of(
                        "__domain__", "k8s",
                        "__entity_type__", "k8s.node",
                        "__entity_id__", "10000000000000000000000000000403",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "node-cn-hz-a",
                        "zone", "cn-hangzhou-a"
                ),
                Map.of(
                        "__domain__", "db",
                        "__entity_type__", "db.mysql",
                        "__entity_id__", "10000000000000000000000000000501",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "order-mysql",
                        "engine", "mysql"
                ),
                Map.of(
                        "__domain__", "cache",
                        "__entity_type__", "cache.redis",
                        "__entity_id__", "10000000000000000000000000000502",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "cart-redis",
                        "engine", "redis"
                ),
                Map.of(
                        "__domain__", "mq",
                        "__entity_type__", "mq.kafka_topic",
                        "__entity_id__", "10000000000000000000000000000503",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now,
                        "name", "order-events",
                        "cluster", "prod-kafka"
                )
        ));
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
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000102",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.workload",
                        "__dest_entity_id__", "10000000000000000000000000000202",
                        "__relation_type__", "runs_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000103",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.workload",
                        "__dest_entity_id__", "10000000000000000000000000000203",
                        "__relation_type__", "runs_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000104",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.workload",
                        "__dest_entity_id__", "10000000000000000000000000000204",
                        "__relation_type__", "runs_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000105",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.workload",
                        "__dest_entity_id__", "10000000000000000000000000000205",
                        "__relation_type__", "runs_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "cloud",
                        "__src_entity_type__", "cloud.slb",
                        "__src_entity_id__", "10000000000000000000000000000302",
                        "__dest_domain__", "devops",
                        "__dest_entity_type__", "devops.gateway",
                        "__dest_entity_id__", "10000000000000000000000000000301",
                        "__relation_type__", "forwards_to",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.gateway",
                        "__src_entity_id__", "10000000000000000000000000000301",
                        "__dest_domain__", "devops",
                        "__dest_entity_type__", "devops.service",
                        "__dest_entity_id__", "10000000000000000000000000000101",
                        "__relation_type__", "routes_to",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.gateway",
                        "__src_entity_id__", "10000000000000000000000000000301",
                        "__dest_domain__", "devops",
                        "__dest_entity_type__", "devops.service",
                        "__dest_entity_id__", "10000000000000000000000000000102",
                        "__relation_type__", "routes_to",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "k8s",
                        "__src_entity_type__", "k8s.workload",
                        "__src_entity_id__", "10000000000000000000000000000201",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.pod",
                        "__dest_entity_id__", "10000000000000000000000000000401",
                        "__relation_type__", "creates",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "k8s",
                        "__src_entity_type__", "k8s.workload",
                        "__src_entity_id__", "10000000000000000000000000000202",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.pod",
                        "__dest_entity_id__", "10000000000000000000000000000402",
                        "__relation_type__", "creates",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "k8s",
                        "__src_entity_type__", "k8s.pod",
                        "__src_entity_id__", "10000000000000000000000000000401",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.node",
                        "__dest_entity_id__", "10000000000000000000000000000403",
                        "__relation_type__", "scheduled_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "k8s",
                        "__src_entity_type__", "k8s.pod",
                        "__src_entity_id__", "10000000000000000000000000000402",
                        "__dest_domain__", "k8s",
                        "__dest_entity_type__", "k8s.node",
                        "__dest_entity_id__", "10000000000000000000000000000403",
                        "__relation_type__", "scheduled_on",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000104",
                        "__dest_domain__", "db",
                        "__dest_entity_type__", "db.mysql",
                        "__dest_entity_id__", "10000000000000000000000000000501",
                        "__relation_type__", "reads_writes",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000101",
                        "__dest_domain__", "cache",
                        "__dest_entity_type__", "cache.redis",
                        "__dest_entity_id__", "10000000000000000000000000000502",
                        "__relation_type__", "uses_cache",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.service",
                        "__src_entity_id__", "10000000000000000000000000000104",
                        "__dest_domain__", "mq",
                        "__dest_entity_type__", "mq.kafka_topic",
                        "__dest_entity_id__", "10000000000000000000000000000503",
                        "__relation_type__", "publishes",
                        "__method__", "Create",
                        "__first_observed_time__", now,
                        "__last_observed_time__", now
                ),
                Map.of(
                        "__src_domain__", "devops",
                        "__src_entity_type__", "devops.job",
                        "__src_entity_id__", "10000000000000000000000000000303",
                        "__dest_domain__", "devops",
                        "__dest_entity_type__", "devops.service",
                        "__dest_entity_id__", "10000000000000000000000000000103",
                        "__relation_type__", "triggers",
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

    private static List<Map<String, Object>> withLocationFields(List<Map<String, Object>> entities) {
        return entities.stream()
                .map(entity -> {
                    Map<String, Object> copy = new LinkedHashMap<>(entity);
                    String name = String.valueOf(copy.getOrDefault("name", copy.getOrDefault("display_name", ""))).toLowerCase();
                    String[] location = locationForEntity(name, String.valueOf(copy.get("__entity_type__")));
                    copy.putIfAbsent("regine_code", location[0]);
                    copy.putIfAbsent("az_code", location[1]);
                    return Map.copyOf(copy);
                })
                .toList();
    }

    private static String[] locationForEntity(String name, String type) {
        if (name.contains("payment") || name.contains("redis")) {
            return new String[]{"cn-shanghai", "cn-shanghai-b"};
        }
        if (name.contains("inventory") || name.contains("sync") || type.contains("kafka")) {
            return new String[]{"cn-beijing", "cn-beijing-a"};
        }
        if (name.contains("notification")) {
            return new String[]{"cn-shanghai", "cn-shanghai-a"};
        }
        if (name.contains("node-cn-hz-a") || name.contains("checkout") || name.contains("public-slb") || name.contains("edge-gateway")) {
            return new String[]{"cn-hangzhou", "cn-hangzhou-a"};
        }
        if (name.contains("order") || type.contains("mysql")) {
            return new String[]{"cn-hangzhou", "cn-hangzhou-b"};
        }
        return new String[]{"cn-hangzhou", "cn-hangzhou-a"};
    }
}
