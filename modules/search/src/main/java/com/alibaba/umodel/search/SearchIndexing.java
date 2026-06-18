package com.alibaba.umodel.search;

import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class SearchIndexing {
    private static final ObjectMapper JSON = new ObjectMapper();

    private SearchIndexing() {
    }

    public static List<SearchChunk> uModelChunks(List<UModelElement> elements) {
        List<SearchChunk> chunks = new ArrayList<>();
        for (UModelElement element : elements == null ? List.<UModelElement>of() : elements) {
            if (element == null) {
                continue;
            }
            if ("runbook_set".equals(element.kind())) {
                chunks.addAll(runbookChunks(element));
            } else {
                chunks.add(elementChunk(element));
            }
        }
        return chunks;
    }

    public static List<String> uModelDocIds(List<UModelElement> elements) {
        List<String> ids = new ArrayList<>();
        for (UModelElement element : elements == null ? List.<UModelElement>of() : elements) {
            if (element == null) {
                continue;
            }
            String prefix = element.stableId();
            ids.add(prefix);
            for (String section : List.of("knowledge", "observations", "actions", "automations", "automation", "skills", "steps")) {
                Object raw = safeMap(element.spec()).get(section);
                int size = raw instanceof List<?> list ? list.size() : raw == null ? 0 : 1;
                for (int i = 0; i < size; i++) {
                    ids.add(prefix + "#" + section + "[" + i + "]");
                }
            }
        }
        return ids;
    }

    public static List<SearchChunk> entityChunks(List<Map<String, Object>> entities) {
        List<SearchChunk> chunks = new ArrayList<>();
        for (Map<String, Object> entity : entities == null ? List.<Map<String, Object>>of() : entities) {
            if (entity == null || isDeleteMethod(entity)) {
                continue;
            }
            String domain = stringValue(entity.get("__domain__"));
            String kind = stringValue(entity.get("__entity_type__"));
            String id = stringValue(entity.get("__entity_id__"));
            if (id.isBlank()) {
                continue;
            }
            Map<String, Object> attrs = new LinkedHashMap<>(entity);
            chunks.add(new SearchChunk(
                    "entity:" + domain + ":" + kind + ":" + id,
                    ".entity",
                    kind,
                    domain,
                    kind,
                    searchableText(entity),
                    attrs,
                    Map.of(),
                    new LinkedHashMap<>(entity)
            ));
        }
        return chunks;
    }

    public static List<String> entityDocIds(List<Map<String, Object>> entities) {
        List<String> ids = new ArrayList<>();
        for (Map<String, Object> entity : entities == null ? List.<Map<String, Object>>of() : entities) {
            String id = stringValue(entity == null ? null : entity.get("__entity_id__"));
            if (id.isBlank()) {
                continue;
            }
            String domain = stringValue(entity.get("__domain__"));
            String kind = stringValue(entity.get("__entity_type__"));
            if (domain.isBlank() || kind.isBlank()) {
                ids.add("entity:::" + id);
            } else {
                ids.add("entity:" + domain + ":" + kind + ":" + id);
            }
        }
        return ids;
    }

    private static SearchChunk elementChunk(UModelElement element) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("kind", element.kind());
        attrs.put("domain", element.domain());
        attrs.put("name", element.name());
        return new SearchChunk(
                element.stableId(),
                ".umodel",
                element.kind(),
                element.domain(),
                element.name(),
                element.kind() + " " + element.domain() + " " + element.name() + " " + json(safeMap(element.spec())),
                attrs,
                safeMap(element.metadata()),
                safeMap(element.spec())
        );
    }

    private static List<SearchChunk> runbookChunks(UModelElement element) {
        List<SearchChunk> chunks = new ArrayList<>();
        Map<String, Object> spec = safeMap(element.spec());
        addRunbookItems(chunks, element, "knowledge", spec.get("knowledge"));
        addRunbookItems(chunks, element, "observations", spec.get("observations"));
        addRunbookItems(chunks, element, "actions", spec.get("actions"));
        addRunbookItems(chunks, element, "automations", spec.get("automations"));
        addRunbookItems(chunks, element, "automations", spec.get("automation"));
        addRunbookItems(chunks, element, "skills", spec.get("skills"));
        addRunbookItems(chunks, element, "steps", spec.get("steps"));
        if (chunks.isEmpty()) {
            Map<String, Object> attrs = runbookAttrs("runbook", "spec", element.name());
            Map<String, Object> chunk = new LinkedHashMap<>(attrs);
            chunk.put("content", json(spec));
            Map<String, Object> outSpec = new LinkedHashMap<>(spec);
            outSpec.put("__chunk__", chunk);
            chunks.add(new SearchChunk(
                    element.stableId() + "#spec",
                    ".runbook_set",
                    element.kind(),
                    element.domain(),
                    element.name(),
                    json(spec),
                    attrs,
                    safeMap(element.metadata()),
                    outSpec
            ));
        }
        return chunks;
    }

    private static void addRunbookItems(List<SearchChunk> chunks, UModelElement element, String type, Object raw) {
        if (raw instanceof List<?> list) {
            for (int i = 0; i < list.size(); i++) {
                chunks.add(runbookChunk(element, type, i, list.get(i)));
            }
            return;
        }
        if (raw instanceof Map<?, ?> || raw instanceof String) {
            chunks.add(runbookChunk(element, type, chunks.size(), raw));
        }
    }

    private static SearchChunk runbookChunk(UModelElement element, String type, int index, Object item) {
        Map<String, Object> itemMap = mapValue(item);
        String title = firstNonEmpty(
                stringValue(itemMap.get("title")),
                stringValue(itemMap.get("name")),
                stringValue(itemMap.get("summary")),
                element.name()
        );
        String section = type + "[" + index + "]";
        Map<String, Object> attrs = runbookAttrs(type, section, title);
        Map<String, Object> spec = new LinkedHashMap<>(safeMap(element.spec()));
        Map<String, Object> chunk = new LinkedHashMap<>(attrs);
        chunk.put("content", item instanceof String text ? text : json(item));
        spec.put("__chunk__", chunk);
        return new SearchChunk(
                element.stableId() + "#" + section,
                ".runbook_set",
                element.kind(),
                element.domain(),
                element.name(),
                title + " " + (item instanceof String text ? text : json(item)),
                attrs,
                safeMap(element.metadata()),
                spec
        );
    }

    private static Map<String, Object> runbookAttrs(String type, String section, String title) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("type", type);
        attrs.put("section", section);
        attrs.put("title", title);
        return attrs;
    }

    private static String searchableText(Map<String, Object> values) {
        return values.values().stream()
                .map(SearchIndexing::stringValue)
                .reduce("", (left, right) -> left + " " + right)
                .toLowerCase(Locale.ROOT);
    }

    private static boolean isDeleteMethod(Map<String, Object> payload) {
        String method = stringValue(payload.get("__method__"));
        return "Delete".equalsIgnoreCase(method) || "Expire".equalsIgnoreCase(method);
    }

    private static Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            out.put(stringValue(entry.getKey()), entry.getValue());
        }
        return out;
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return stringValue(value);
        }
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
