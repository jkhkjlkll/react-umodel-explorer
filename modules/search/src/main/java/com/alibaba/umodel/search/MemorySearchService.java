package com.alibaba.umodel.search;

import com.alibaba.umodel.contract.UModelModels.SearchCapabilities;
import com.alibaba.umodel.contract.UModelModels.SearchHealth;
import com.alibaba.umodel.contract.UModelModels.SearchRequest;
import com.alibaba.umodel.contract.UModelModels.SearchResult;
import com.alibaba.umodel.contract.UModelModels.SearchRow;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class MemorySearchService implements SearchService {
    private static final int DEFAULT_TOP_K = 10;
    private static final int DEFAULT_HYBRID_K = 60;

    private final Map<String, Map<String, SearchChunk>> workspaces = new ConcurrentHashMap<>();

    @Override
    public void openWorkspace(String workspace) {
        workspaces.computeIfAbsent(workspaceKey(workspace), ignored -> new ConcurrentHashMap<>());
    }

    @Override
    public void index(String workspace, List<SearchChunk> chunks) {
        Map<String, SearchChunk> bucket = workspaces.computeIfAbsent(workspaceKey(workspace), ignored -> new ConcurrentHashMap<>());
        for (SearchChunk chunk : chunks == null ? List.<SearchChunk>of() : chunks) {
            if (chunk != null && chunk.docId() != null && !chunk.docId().isBlank()) {
                bucket.put(chunk.docId(), chunk);
            }
        }
    }

    @Override
    public void deleteByDocId(String workspace, List<String> docIds) {
        Map<String, SearchChunk> bucket = workspaces.get(workspaceKey(workspace));
        if (bucket == null) {
            return;
        }
        for (String docId : docIds == null ? List.<String>of() : docIds) {
            bucket.remove(docId);
            if (docId != null && !docId.isBlank()) {
                bucket.keySet().removeIf(key -> key.startsWith(docId + "#"));
                String entityId = docId.startsWith("entity:::") ? docId.substring("entity:::".length()) : docId;
                bucket.keySet().removeIf(key -> key.endsWith(":" + entityId));
            }
        }
    }

    @Override
    public SearchResult keyword(String workspace, SearchRequest request) {
        return search(workspace, request, SearchAxis.KEYWORD);
    }

    @Override
    public SearchResult vector(String workspace, SearchRequest request) {
        return search(workspace, request, SearchAxis.VECTOR);
    }

    @Override
    public SearchResult hybrid(String workspace, SearchRequest request) {
        List<SearchHit> keywordHits = hits(workspace, request, SearchAxis.KEYWORD);
        List<SearchHit> vectorHits = hits(workspace, request, SearchAxis.VECTOR);
        int k = request == null || request.hybridK() == null || request.hybridK() <= 0
                ? DEFAULT_HYBRID_K
                : request.hybridK();
        Map<String, Double> scores = new LinkedHashMap<>();
        Map<String, SearchHit> merged = new LinkedHashMap<>();
        double keywordWeight = weight(request, "keyword");
        double vectorWeight = weight(request, "vector");
        for (int i = 0; i < keywordHits.size(); i++) {
            SearchHit hit = keywordHits.get(i);
            scores.merge(hit.chunk().docId(), keywordWeight / (k + i + 1.0), Double::sum);
            merged.putIfAbsent(hit.chunk().docId(), hit);
        }
        for (int i = 0; i < vectorHits.size(); i++) {
            SearchHit hit = vectorHits.get(i);
            scores.merge(hit.chunk().docId(), vectorWeight / (k + i + 1.0), Double::sum);
            merged.putIfAbsent(hit.chunk().docId(), hit);
        }
        List<SearchHit> fused = new ArrayList<>();
        for (Map.Entry<String, Double> entry : scores.entrySet()) {
            SearchHit hit = merged.get(entry.getKey());
            fused.add(new SearchHit(hit.chunk(), entry.getValue()));
        }
        fused.sort(hitComparator());
        return new SearchResult(rows(fused, topK(request)));
    }

    @Override
    public SearchCapabilities capabilities() {
        return new SearchCapabilities(true, true, true, true, false, "memory-token-overlap", null);
    }

    @Override
    public SearchHealth health() {
        return new SearchHealth("memory", "ok", "in-memory keyword/vector/hybrid search is available");
    }

    private SearchResult search(String workspace, SearchRequest request, SearchAxis axis) {
        return new SearchResult(rows(hits(workspace, request, axis), topK(request)));
    }

    private List<SearchHit> hits(String workspace, SearchRequest request, SearchAxis axis) {
        Map<String, SearchChunk> bucket = workspaces.getOrDefault(workspaceKey(workspace), Map.of());
        List<SearchHit> hits = new ArrayList<>();
        String query = lower(request == null ? null : request.query());
        for (SearchChunk chunk : bucket.values()) {
            if (!matches(request, chunk)) {
                continue;
            }
            double score = score(chunk, query, axis);
            if (score <= 0 && query != null && !query.isBlank()) {
                continue;
            }
            hits.add(new SearchHit(chunk, query == null || query.isBlank() ? 1.0 : score));
        }
        hits.sort(hitComparator());
        int limit = topK(request);
        return limit > 0 && hits.size() > limit ? new ArrayList<>(hits.subList(0, limit)) : hits;
    }

    private static boolean matches(SearchRequest request, SearchChunk chunk) {
        if (request == null) {
            return true;
        }
        if (!blank(request.source()) && !Objects.equals(request.source(), chunk.source())) {
            return false;
        }
        if (!blank(request.domain()) && !Objects.equals(request.domain(), chunk.domain())) {
            return false;
        }
        if (request.names() != null && !request.names().isEmpty() && !request.names().contains(chunk.name())) {
            return false;
        }
        if (request.kinds() != null && !request.kinds().isEmpty() && !request.kinds().contains(chunk.kind())) {
            return false;
        }
        String requestedType = stringValue(request.filters() == null ? null : request.filters().get("type"));
        if (!requestedType.isBlank()) {
            String actualType = stringValue(chunk.attrs() == null ? null : chunk.attrs().get("type"));
            if (!runbookTypeMatches(requestedType, actualType)) {
                return false;
            }
        }
        if (request.filters() != null) {
            Set<String> ignored = Set.of("type", "mode", "query", "topk", "hybrid_k", "ids");
            for (Map.Entry<String, Object> entry : request.filters().entrySet()) {
                if (ignored.contains(entry.getKey())) {
                    continue;
                }
                Object actual = chunk.attrs() == null ? null : chunk.attrs().get(entry.getKey());
                if (!Objects.equals(stringValue(entry.getValue()), stringValue(actual))) {
                    return false;
                }
            }
        }
        return true;
    }

    private static double score(SearchChunk chunk, String query, SearchAxis axis) {
        if (query == null || query.isBlank()) {
            return 1.0;
        }
        String corpus = lower(chunk.text());
        if (axis == SearchAxis.KEYWORD) {
            int idx = corpus.indexOf(query);
            if (idx >= 0) {
                return 1.0 - (double) idx / (corpus.length() + 1);
            }
        }
        String[] terms = query.split("\\s+");
        double hit = 0;
        for (String term : terms) {
            if (!term.isBlank() && corpus.contains(term)) {
                hit++;
            }
        }
        if (axis == SearchAxis.VECTOR) {
            return terms.length == 0 ? 0 : hit / terms.length;
        }
        return hit;
    }

    private static List<SearchRow> rows(List<SearchHit> hits, int topK) {
        List<SearchRow> rows = new ArrayList<>();
        int count = topK <= 0 ? hits.size() : Math.min(topK, hits.size());
        for (int i = 0; i < count; i++) {
            SearchHit hit = hits.get(i);
            SearchChunk chunk = hit.chunk();
            rows.add(new SearchRow(
                    typeFromChunk(chunk),
                    chunk.domain(),
                    chunk.kind(),
                    chunk.name(),
                    safeMap(chunk.metadata()),
                    safeMap(chunk.spec()),
                    hit.score(),
                    "memory",
                    "memory-token-overlap"
            ));
        }
        return rows;
    }

    private static Comparator<SearchHit> hitComparator() {
        return (left, right) -> {
            int byScore = Double.compare(right.score(), left.score());
            if (byScore != 0) {
                return byScore;
            }
            return stringValue(left.chunk().docId()).compareTo(stringValue(right.chunk().docId()));
        };
    }

    private static int topK(SearchRequest request) {
        if (request != null && request.topK() != null && request.topK() > 0) {
            return request.topK();
        }
        return DEFAULT_TOP_K;
    }

    private static double weight(SearchRequest request, String key) {
        if (request != null && request.weights() != null && request.weights().get(key) != null) {
            return request.weights().get(key);
        }
        return 1.0;
    }

    private static String typeFromChunk(SearchChunk chunk) {
        String type = stringValue(chunk.attrs() == null ? null : chunk.attrs().get("type"));
        if (!type.isBlank()) {
            return type;
        }
        return !blank(chunk.name()) ? chunk.name() : chunk.kind();
    }

    private static String workspaceKey(String workspace) {
        return workspace == null || workspace.isBlank() ? "default" : workspace;
    }

    private static boolean runbookTypeMatches(String requested, String actual) {
        if (requested == null || requested.isBlank()) {
            return true;
        }
        return normalizeRunbookType(requested).equals(normalizeRunbookType(actual));
    }

    private static String normalizeRunbookType(String value) {
        return switch (stringValue(value).toLowerCase(Locale.ROOT)) {
            case "observation" -> "observations";
            case "action" -> "actions";
            case "automation" -> "automations";
            case "skill" -> "skills";
            case "step" -> "steps";
            default -> stringValue(value).toLowerCase(Locale.ROOT);
        };
    }

    private static Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    private static String lower(String value) {
        return stringValue(value).toLowerCase(Locale.ROOT);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private enum SearchAxis {
        KEYWORD,
        VECTOR
    }

    private record SearchHit(SearchChunk chunk, double score) {
    }
}
