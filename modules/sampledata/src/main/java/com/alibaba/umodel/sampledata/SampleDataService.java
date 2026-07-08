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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class SampleDataService {
    public static final String MULTI_DOMAIN_QUICKSTART = "multi-domain-quickstart";

    private static final List<EntitySampleType> GENERATED_ENTITY_TYPES = List.of(
            new EntitySampleType("devops", "devops.service", 220),
            new EntitySampleType("devops", "devops.gateway", 32),
            new EntitySampleType("devops", "devops.job", 45),
            new EntitySampleType("k8s", "k8s.workload", 180),
            new EntitySampleType("k8s", "k8s.pod", 360),
            new EntitySampleType("k8s", "k8s.node", 80),
            new EntitySampleType("cloud", "cloud.slb", 24),
            new EntitySampleType("cloud", "cloud.ecs", 80),
            new EntitySampleType("cloud", "cloud.vpc", 12),
            new EntitySampleType("cloud", "cloud.nat_gateway", 16),
            new EntitySampleType("security", "security.waf", 16),
            new EntitySampleType("cdn", "cdn.domain", 32),
            new EntitySampleType("oss", "oss.bucket", 40),
            new EntitySampleType("db", "db.mysql", 56),
            new EntitySampleType("db", "db.postgresql", 36),
            new EntitySampleType("search", "search.elasticsearch", 32),
            new EntitySampleType("cache", "cache.redis", 56),
            new EntitySampleType("mq", "mq.kafka_topic", 56),
            new EntitySampleType("mq", "mq.rocketmq_topic", 48),
            new EntitySampleType("observability", "observability.prometheus", 20),
            new EntitySampleType("observability", "observability.logstore", 36),
            new EntitySampleType("scheduler", "scheduler.cronjob", 40)
    );

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
        List<UModelElement> elements = new ArrayList<>(List.of(
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
        ));
        elements.addAll(additionalUModelElements());
        UModelImportResult umodel = umodelService.importElements(
                workspace,
                new UModelImportRequest("builtin:" + MULTI_DOMAIN_QUICKSTART, elements)
        );

        long now = Instant.now().getEpochSecond();
        List<Map<String, Object>> entities = new ArrayList<>(withLocationFields(List.of(
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
        )));
        entities.addAll(generatedEntitySamples(now));
        WriteResult entityResult = entityStoreService.writeEntities(
                workspace,
                new EntityWriteBatch(workspace, MULTI_DOMAIN_QUICKSTART + ":entities:v1", false, entities)
        );

        List<Map<String, Object>> relations = new ArrayList<>(List.of(
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
        ));
        relations.addAll(generatedRelationSamples(now));
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

    private static List<UModelElement> additionalUModelElements() {
        List<UModelElement> elements = new ArrayList<>();
        elements.add(entitySet("cloud", "cloud.ecs", "ECS instance"));
        elements.add(entitySet("cloud", "cloud.vpc", "VPC network"));
        elements.add(entitySet("cloud", "cloud.nat_gateway", "NAT gateway"));
        elements.add(entitySet("security", "security.waf", "WAF instance"));
        elements.add(entitySet("cdn", "cdn.domain", "CDN domain"));
        elements.add(entitySet("oss", "oss.bucket", "OSS bucket"));
        elements.add(entitySet("db", "db.postgresql", "PostgreSQL database"));
        elements.add(entitySet("search", "search.elasticsearch", "Elasticsearch cluster"));
        elements.add(entitySet("mq", "mq.rocketmq_topic", "RocketMQ topic"));
        elements.add(entitySet("observability", "observability.prometheus", "Prometheus workspace"));
        elements.add(entitySet("observability", "observability.logstore", "Logstore"));
        elements.add(entitySet("scheduler", "scheduler.cronjob", "Cron job"));

        elements.add(entitySetLink("cloud", "ecs_to_vpc", "cloud.ecs", "cloud.vpc", "attached_to"));
        elements.add(entitySetLink("cloud", "ecs_to_nat", "cloud.ecs", "cloud.nat_gateway", "egresses_to"));
        elements.add(entitySetLink("security", "waf_to_slb", "security.waf", "cloud.slb", "protects"));
        elements.add(entitySetLink("cdn", "cdn_to_gateway", "cdn.domain", "devops.gateway", "accelerates"));
        elements.add(entitySetLink("devops", "service_to_service", "devops.service", "devops.service", "calls"));
        elements.add(entitySetLink("devops", "service_to_postgresql", "devops.service", "db.postgresql", "reads_from"));
        elements.add(entitySetLink("devops", "service_to_elasticsearch", "devops.service", "search.elasticsearch", "writes_to"));
        elements.add(entitySetLink("devops", "service_to_rocketmq", "devops.service", "mq.rocketmq_topic", "subscribes"));
        elements.add(entitySetLink("observability", "prometheus_to_service", "observability.prometheus", "devops.service", "monitors"));
        elements.add(entitySetLink("observability", "logstore_to_service", "observability.logstore", "devops.service", "collects_logs_from"));
        elements.add(entitySetLink("scheduler", "cronjob_to_service", "scheduler.cronjob", "devops.service", "triggers"));
        elements.add(entitySetLink("oss", "database_to_bucket", "db.mysql", "oss.bucket", "backs_up_to"));
        elements.add(entitySetLink("db", "postgresql_to_mysql", "db.postgresql", "db.mysql", "replicates_to"));
        return elements;
    }

    private static UModelElement entitySet(String domain, String name, String displayName) {
        return new UModelElement(null, "entity_set", domain, name, Map.of(
                "display_name", displayName,
                "fields", Map.of(
                        "id", Map.of("type", "string"),
                        "name", Map.of("type", "string"),
                        "display_name", Map.of("type", "string"),
                        "environment", Map.of("type", "string"),
                        "regine_code", Map.of("type", "string"),
                        "az_code", Map.of("type", "string")
                )
        ), Map.of());
    }

    private static UModelElement entitySetLink(String domain, String name, String source, String target, String relation) {
        return new UModelElement(null, "entity_set_link", domain, name, Map.of(
                "source", source,
                "target", target,
                "relation", relation
        ), Map.of());
    }

    private static List<Map<String, Object>> generatedEntitySamples(long now) {
        List<Map<String, Object>> entities = new ArrayList<>();
        for (EntitySampleType sampleType : GENERATED_ENTITY_TYPES) {
            for (int index = 1; index <= sampleType.count(); index++) {
                entities.add(generatedEntity(now, sampleType.domain(), sampleType.type(), index));
            }
        }
        return entities;
    }

    private static Map<String, Object> generatedEntity(long now, String domain, String type, int index) {
        String id = entityId(type, index);
        String name = entityName(type, index);
        String[] location = locationForIndex(index);
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("__domain__", domain);
        entity.put("__entity_type__", type);
        entity.put("__entity_id__", id);
        entity.put("__method__", "Create");
        entity.put("__first_observed_time__", now);
        entity.put("__last_observed_time__", now);
        entity.put("id", id);
        entity.put("name", name);
        entity.put("display_name", displayName(type, index));
        entity.put("environment", index % 11 == 0 ? "staging" : "prod");
        entity.put("regine_code", location[0]);
        entity.put("az_code", location[1]);
        entity.put("app", applicationName(index));
        entity.put("owner", teamName(index));
        enrichEntity(entity, type, index);
        return Map.copyOf(entity);
    }

    private static void enrichEntity(Map<String, Object> entity, String type, int index) {
        if (type.startsWith("k8s.")) {
            entity.put("namespace", index % 5 == 0 ? "platform" : "prod");
            entity.put("cluster", "ack-prod-" + (index % 4 + 1));
        }
        if (type.startsWith("cloud.")) {
            entity.put("account", "cloud-account-" + (index % 6 + 1));
        }
        if (type.startsWith("db.")) {
            entity.put("engine", type.substring(type.lastIndexOf('.') + 1));
            entity.put("cluster", "db-cluster-" + (index % 8 + 1));
        }
        if (type.startsWith("cache.")) {
            entity.put("engine", "redis");
            entity.put("cluster", "redis-cluster-" + (index % 8 + 1));
        }
        if (type.startsWith("mq.")) {
            entity.put("cluster", "mq-cluster-" + (index % 6 + 1));
        }
        if ("cloud.vpc".equals(type)) {
            entity.put("cidr", "10." + (index % 128) + ".0.0/16");
        }
        if ("oss.bucket".equals(type)) {
            entity.put("storage_class", index % 3 == 0 ? "archive" : "standard");
        }
    }

    private static List<Map<String, Object>> generatedRelationSamples(long now) {
        List<Map<String, Object>> relations = new ArrayList<>();
        for (int index = 1; index <= countForType("devops.service"); index++) {
            relations.add(generatedRelation(now, "devops.service", index, "k8s.workload", cycle(index, "k8s.workload"), "runs_on"));
            relations.add(generatedRelation(now, "devops.service", index, "cache.redis", cycle(index, "cache.redis"), "uses_cache"));
            relations.add(generatedRelation(now, "devops.service", index, "db.mysql", cycle(index, "db.mysql"), index % 2 == 0 ? "reads_writes" : "reads_from"));
            relations.add(generatedRelation(now, "devops.service", index, "db.postgresql", cycle(index + 7, "db.postgresql"), "reads_from"));
            relations.add(generatedRelation(now, "devops.service", index, "search.elasticsearch", cycle(index + 13, "search.elasticsearch"), "writes_to"));
            relations.add(generatedRelation(now, "devops.service", index, "mq.kafka_topic", cycle(index, "mq.kafka_topic"), "publishes"));
            relations.add(generatedRelation(now, "devops.service", index, "mq.rocketmq_topic", cycle(index + 5, "mq.rocketmq_topic"), "subscribes"));
            relations.add(generatedRelation(now, "devops.service", index, "devops.service", cycle(index + 1, "devops.service"), index % 3 == 0 ? "depends_on" : "calls"));
            relations.add(generatedRelation(now, "observability.prometheus", cycle(index, "observability.prometheus"), "devops.service", index, "monitors"));
            relations.add(generatedRelation(now, "observability.logstore", cycle(index, "observability.logstore"), "devops.service", index, "collects_logs_from"));
        }
        for (int index = 1; index <= countForType("k8s.workload"); index++) {
            relations.add(generatedRelation(now, "k8s.workload", index, "k8s.pod", cycle(index * 2 - 1, "k8s.pod"), "creates"));
            relations.add(generatedRelation(now, "k8s.workload", index, "k8s.pod", cycle(index * 2, "k8s.pod"), "creates"));
        }
        for (int index = 1; index <= countForType("k8s.pod"); index++) {
            relations.add(generatedRelation(now, "k8s.pod", index, "k8s.node", cycle(index, "k8s.node"), "scheduled_on"));
        }
        for (int index = 1; index <= countForType("devops.gateway"); index++) {
            relations.add(generatedRelation(now, "cloud.slb", cycle(index, "cloud.slb"), "devops.gateway", index, "forwards_to"));
            relations.add(generatedRelation(now, "security.waf", cycle(index, "security.waf"), "cloud.slb", cycle(index, "cloud.slb"), "protects"));
            relations.add(generatedRelation(now, "cdn.domain", cycle(index, "cdn.domain"), "devops.gateway", index, "accelerates"));
            relations.add(generatedRelation(now, "devops.gateway", index, "devops.service", cycle(index * 3 - 2, "devops.service"), "routes_to"));
            relations.add(generatedRelation(now, "devops.gateway", index, "devops.service", cycle(index * 3 - 1, "devops.service"), "routes_to"));
            relations.add(generatedRelation(now, "devops.gateway", index, "devops.service", cycle(index * 3, "devops.service"), "routes_to"));
        }
        for (int index = 1; index <= countForType("cloud.ecs"); index++) {
            relations.add(generatedRelation(now, "cloud.ecs", index, "cloud.vpc", cycle(index, "cloud.vpc"), "attached_to"));
            relations.add(generatedRelation(now, "cloud.ecs", index, "cloud.nat_gateway", cycle(index, "cloud.nat_gateway"), "egresses_to"));
            relations.add(generatedRelation(now, "k8s.node", cycle(index, "k8s.node"), "cloud.ecs", index, "deployed_on"));
        }
        for (int index = 1; index <= countForType("devops.job"); index++) {
            relations.add(generatedRelation(now, "devops.job", index, "devops.service", cycle(index * 2, "devops.service"), "triggers"));
        }
        for (int index = 1; index <= countForType("scheduler.cronjob"); index++) {
            relations.add(generatedRelation(now, "scheduler.cronjob", index, "devops.service", cycle(index * 4, "devops.service"), "triggers"));
        }
        for (int index = 1; index <= countForType("db.mysql"); index++) {
            relations.add(generatedRelation(now, "db.mysql", index, "oss.bucket", cycle(index, "oss.bucket"), "backs_up_to"));
        }
        for (int index = 1; index <= countForType("db.postgresql"); index++) {
            relations.add(generatedRelation(now, "db.postgresql", index, "db.mysql", cycle(index, "db.mysql"), "replicates_to"));
        }
        return relations;
    }

    private static Map<String, Object> generatedRelation(long now, String srcType, int srcIndex, String destType, int destIndex, String relationType) {
        Map<String, Object> relation = new LinkedHashMap<>();
        relation.put("__src_domain__", domainForType(srcType));
        relation.put("__src_entity_type__", srcType);
        relation.put("__src_entity_id__", entityId(srcType, srcIndex));
        relation.put("__dest_domain__", domainForType(destType));
        relation.put("__dest_entity_type__", destType);
        relation.put("__dest_entity_id__", entityId(destType, destIndex));
        relation.put("__relation_type__", relationType);
        relation.put("__method__", "Create");
        relation.put("__first_observed_time__", now);
        relation.put("__last_observed_time__", now);
        relation.put("calls", 300 + ((srcIndex * 17 + destIndex * 11) % 9000));
        relation.put("errors", (srcIndex + destIndex) % 19);
        relation.put("latency_ms", 8 + ((srcIndex * 7 + destIndex * 5) % 180));
        return Map.copyOf(relation);
    }

    private static String entityId(String type, int index) {
        return "sample:" + type + ":" + String.format("%04d", index);
    }

    private static String entityName(String type, int index) {
        return type.substring(type.lastIndexOf('.') + 1).replace('_', '-') + "-" + String.format("%04d", index);
    }

    private static String displayName(String type, int index) {
        String base = type.substring(type.lastIndexOf('.') + 1).replace('_', ' ');
        return base + " " + String.format("%04d", index);
    }

    private static String applicationName(int index) {
        String[] apps = {"checkout", "payment", "inventory", "order", "member", "search", "fulfillment", "marketing"};
        return apps[Math.floorMod(index - 1, apps.length)];
    }

    private static String teamName(int index) {
        String[] teams = {"sre", "platform", "transaction", "growth", "data", "security"};
        return teams[Math.floorMod(index - 1, teams.length)];
    }

    private static String[] locationForIndex(int index) {
        String[] regions = {"cn-hangzhou", "cn-shanghai", "cn-beijing", "cn-shenzhen", "cn-zhangjiakou"};
        String region = regions[Math.floorMod(index - 1, regions.length)];
        char zone = (char) ('a' + Math.floorMod(index - 1, 3));
        return new String[]{region, region + "-" + zone};
    }

    private static int cycle(int index, String type) {
        return Math.floorMod(index - 1, countForType(type)) + 1;
    }

    private static int countForType(String type) {
        return GENERATED_ENTITY_TYPES.stream()
                .filter(sampleType -> sampleType.type().equals(type))
                .findFirst()
                .map(EntitySampleType::count)
                .orElseThrow(() -> new IllegalArgumentException("unknown sample entity type: " + type));
    }

    private static String domainForType(String type) {
        return GENERATED_ENTITY_TYPES.stream()
                .filter(sampleType -> sampleType.type().equals(type))
                .findFirst()
                .map(EntitySampleType::domain)
                .orElseGet(() -> type.substring(0, type.indexOf('.')));
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

    private record EntitySampleType(String domain, String type, int count) {
    }
}
