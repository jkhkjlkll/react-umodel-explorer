package com.alibaba.umodel.sdk.model;

import java.lang.reflect.InvocationTargetException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static com.alibaba.umodel.sdk.model.StandardModelTypes.*;

public final class UModelTypeRegistry {
    public static final String STABLE_VERSION = "v1.0.0";

    private final Map<String, Class<? extends UModelObject>> types = new LinkedHashMap<>();

    public UModelTypeRegistry() {
    }

    public static UModelTypeRegistry standard() {
        UModelTypeRegistry registry = new UModelTypeRegistry();
        registry.register("aliyun_prometheus", STABLE_VERSION, AliyunPrometheusV100.class);
        registry.register("data_link", STABLE_VERSION, DataLinkV100.class);
        registry.register("elasticsearch", STABLE_VERSION, ElasticsearchV100.class);
        registry.register("entity_set", STABLE_VERSION, EntitySetV100.class);
        registry.register("entity_set_link", STABLE_VERSION, EntitySetLinkV100.class);
        registry.register("entity_source", STABLE_VERSION, EntitySourceV100.class);
        registry.register("entity_source_link", STABLE_VERSION, EntitySourceLinkV100.class);
        registry.register("event_set", STABLE_VERSION, EventSetV100.class);
        registry.register("explorer", STABLE_VERSION, ExplorerV100.class);
        registry.register("explorer_link", STABLE_VERSION, ExplorerLinkV100.class);
        registry.register("external_storage", STABLE_VERSION, ExternalStorageV100.class);
        registry.register("log_set", STABLE_VERSION, LogSetV100.class);
        registry.register("metric_set", STABLE_VERSION, MetricSetV100.class);
        registry.register("mysql", STABLE_VERSION, MysqlV100.class);
        registry.register("profile_set", STABLE_VERSION, ProfileSetV100.class);
        registry.register("prometheus", STABLE_VERSION, PrometheusV100.class);
        registry.register("runbook_link", STABLE_VERSION, RunbookLinkV100.class);
        registry.register("runbook_set", STABLE_VERSION, RunbookSetV100.class);
        registry.register("sls_entitystore", STABLE_VERSION, SlsEntitystoreV100.class);
        registry.register("sls_logstore", STABLE_VERSION, SlsLogstoreV100.class);
        registry.register("sls_metricstore", STABLE_VERSION, SlsMetricstoreV100.class);
        registry.register("storage_link", STABLE_VERSION, StorageLinkV100.class);
        registry.register("trace_set", STABLE_VERSION, TraceSetV100.class);
        return registry;
    }

    public UModelTypeRegistry register(String kind, String version, Class<? extends UModelObject> type) {
        if (blank(kind) || blank(version) || type == null) {
            throw new IllegalArgumentException("kind, version, and type are required");
        }
        types.put(key(kind, version), type);
        return this;
    }

    public boolean supports(String kind, String version) {
        return resolve(kind, version) != null;
    }

    public Class<? extends UModelObject> resolve(String kind, String version) {
        Class<? extends UModelObject> exact = types.get(key(kind, version));
        if (exact != null) {
            return exact;
        }
        if (version != null && version.startsWith("v0.")) {
            return types.get(key(kind, STABLE_VERSION));
        }
        return null;
    }

    public UModelObject create(String kind, String version) {
        Class<? extends UModelObject> type = resolve(kind, version);
        if (type == null) {
            throw new UModelSdkException(UModelSdkException.Category.UNKNOWN_TYPE, "kind", "unknown UModel type " + key(kind, version));
        }
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (InstantiationException | IllegalAccessException | InvocationTargetException | NoSuchMethodException error) {
            throw new UModelSdkException(UModelSdkException.Category.PARSE_ERROR, "kind", "cannot create UModel type " + type.getName(), error);
        }
    }

    public Set<String> knownTypes() {
        return Collections.unmodifiableSet(new TreeSet<>(types.keySet()));
    }

    public Map<String, Class<? extends UModelObject>> types() {
        return Collections.unmodifiableMap(types);
    }

    public static String key(String kind, String version) {
        return String.valueOf(kind) + ":" + String.valueOf(version);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
