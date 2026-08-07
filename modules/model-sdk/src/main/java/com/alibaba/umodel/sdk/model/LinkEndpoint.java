package com.alibaba.umodel.sdk.model;

import java.util.LinkedHashMap;
import java.util.Map;

public record LinkEndpoint(String domain, String kind, String name, String filter) {
    public static LinkEndpoint from(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return null;
        }
        return new LinkEndpoint(text(map.get("domain")), text(map.get("kind")), text(map.get("name")), text(map.get("filter")));
    }

    public Map<String, Object> toMap() {
        Map<String, Object> result = new LinkedHashMap<>();
        put(result, "domain", domain);
        put(result, "kind", kind);
        put(result, "name", name);
        put(result, "filter", filter);
        return result;
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static void put(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }
}
