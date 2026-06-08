package com.alibaba.umodel.query;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.QueryExplain;
import com.alibaba.umodel.contract.UModelModels.QueryPage;
import com.alibaba.umodel.contract.UModelModels.QueryPlan;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.graphstore.GraphStore;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class QueryService {
    private static final Pattern WITH_PATTERN = Pattern.compile("^with\\((.*)\\)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LIMIT_PATTERN = Pattern.compile("^limit\\s+(\\d+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PROJECT_PATTERN = Pattern.compile("^project\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SORT_PATTERN = Pattern.compile("^sort\\s+([^\\s]+).*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GRAPH_CALL_PATTERN = Pattern.compile("^graph-call\\s+(.+)$", Pattern.CASE_INSENSITIVE);

    private final GraphStore graphStore;

    public QueryService(GraphStore graphStore) {
        this.graphStore = graphStore;
    }

    public QueryResult execute(String workspace, QueryRequest request) {
        QueryPlan plan = plan(workspace, request);
        QueryResult result = switch (plan.source()) {
            case ".umodel" -> executeUModel(plan);
            case ".entity" -> graphStore.queryEntities(plan);
            case ".topo" -> graphStore.queryTopo(plan);
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported query source");
        };
        List<Map<String, Object>> rows = applyProject(result.rows(), plan.project());
        QueryExplain explain = explainFromPlan(plan);
        return new QueryResult(rows, columns(rows), page(plan.limit()), explain);
    }

    public QueryExplain explain(String workspace, QueryRequest request) {
        return explainFromPlan(plan(workspace, request));
    }

    public List<String> examples() {
        return List.of(
                ".umodel with(kind='entity_set') | project domain,name,kind | sort domain,name | limit 20",
                ".entity with(domain='devops', name='devops.service', query='checkout', topk=20)",
                ".topo | graph-call getDirectRelations([]) | limit 20"
        );
    }

    public QueryPlan plan(String workspace, QueryRequest request) {
        if (workspace == null || workspace.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace is required");
        }
        String query = request == null ? null : request.query();
        if (query == null || query.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "query is required");
        }
        String[] parts = query.trim().split("\\|");
        String first = parts[0].trim();
        String source = first.split("\\s+", 2)[0].trim();
        if (!List.of(".umodel", ".entity", ".topo").contains(source)) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "query source must be .umodel, .entity, or .topo");
        }

        Map<String, Object> filters = new LinkedHashMap<>();
        List<String> project = List.of();
        String sortField = null;
        int limit = request.limit() == null ? 0 : request.limit();
        String graphCall = null;

        Map<String, Object> params = request.parameters() == null ? Map.of() : request.parameters();
        List<String> operations = new ArrayList<>();
        String firstRemainder = first.substring(source.length()).trim();
        if (!firstRemainder.isBlank()) {
            operations.add(firstRemainder);
        }
        for (int i = 1; i < parts.length; i++) {
            operations.add(parts[i].trim());
        }
        for (String op : operations) {
            Matcher withMatcher = WITH_PATTERN.matcher(op);
            Matcher limitMatcher = LIMIT_PATTERN.matcher(op);
            Matcher projectMatcher = PROJECT_PATTERN.matcher(op);
            Matcher sortMatcher = SORT_PATTERN.matcher(op);
            Matcher graphCallMatcher = GRAPH_CALL_PATTERN.matcher(op);
            if (withMatcher.matches()) {
                filters.putAll(parseFilters(withMatcher.group(1), params));
            } else if (limitMatcher.matches()) {
                limit = Integer.parseInt(limitMatcher.group(1));
            } else if (projectMatcher.matches()) {
                project = parseCsv(projectMatcher.group(1));
            } else if (sortMatcher.matches()) {
                sortField = parseCsv(sortMatcher.group(1)).stream().findFirst().orElse(null);
            } else if (graphCallMatcher.matches()) {
                graphCall = graphCallMatcher.group(1);
            }
        }

        return new QueryPlan(workspace, source, filters, project, sortField, limit, graphCall);
    }

    private QueryResult executeUModel(QueryPlan plan) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UModelElement element : graphStore.getUModelSnapshot(plan.workspace()).elements()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", element.stableId());
            row.put("kind", element.kind());
            row.put("domain", element.domain());
            row.put("name", element.name());
            row.put("spec", element.spec());
            row.put("metadata", element.metadata());
            if (matchesFilters(plan.filters(), row)) {
                rows.add(row);
            }
        }
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    private QueryExplain explainFromPlan(QueryPlan plan) {
        return new QueryExplain(
                plan.source(),
                graphStore.capabilities().provider(),
                graphStore.health().provider(),
                List.of(),
                List.of(),
                List.of("source", "with", "project", "sort", "limit"),
                null,
                plan.filters(),
                plan.limit() <= 0 ? null : plan.limit(),
                null,
                false,
                null,
                null,
                null
        );
    }

    private static Map<String, Object> parseFilters(String value, Map<String, Object> params) {
        Map<String, Object> filters = new LinkedHashMap<>();
        for (String item : splitFilterItems(value)) {
            int idx = item.indexOf('=');
            if (idx <= 0) {
                continue;
            }
            String key = item.substring(0, idx).trim();
            String raw = item.substring(idx + 1).trim();
            filters.put(key, parseValue(raw, params));
        }
        return filters;
    }

    private static List<String> splitFilterItems(String value) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '\'') {
                quoted = !quoted;
            }
            if (ch == ',' && !quoted) {
                parts.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        if (current.length() > 0) {
            parts.add(current.toString().trim());
        }
        return parts;
    }

    private static Object parseValue(String raw, Map<String, Object> params) {
        if (raw.startsWith("$")) {
            return params.get(raw.substring(1));
        }
        if (raw.length() >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
            return raw.substring(1, raw.length() - 1);
        }
        if ("true".equalsIgnoreCase(raw)) {
            return true;
        }
        if ("false".equalsIgnoreCase(raw)) {
            return false;
        }
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException ignored) {
            return raw;
        }
    }

    private static List<String> parseCsv(String value) {
        List<String> fields = new ArrayList<>();
        for (String field : value.split(",")) {
            String trimmed = field.trim();
            if (!trimmed.isBlank()) {
                fields.add(trimmed);
            }
        }
        return fields;
    }

    private static boolean matchesFilters(Map<String, Object> filters, Map<String, Object> row) {
        if (filters == null || filters.isEmpty()) {
            return true;
        }
        for (Map.Entry<String, Object> filter : filters.entrySet()) {
            if ("query".equals(filter.getKey()) || "topk".equals(filter.getKey()) || "mode".equals(filter.getKey())) {
                continue;
            }
            Object actual = row.get(filter.getKey());
            if (!Objects.equals(Objects.toString(filter.getValue(), ""), Objects.toString(actual, ""))) {
                return false;
            }
        }
        return true;
    }

    private static List<Map<String, Object>> applyProject(List<Map<String, Object>> rows, List<String> project) {
        if (project == null || project.isEmpty()) {
            return rows == null ? List.of() : rows;
        }
        List<Map<String, Object>> projected = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> next = new LinkedHashMap<>();
            for (String field : project) {
                next.put(field, row.get(field));
            }
            projected.add(next);
        }
        return projected;
    }

    private static List<Map<String, Object>> sortAndLimit(List<Map<String, Object>> rows, String sortField, int limit) {
        if (sortField != null && !sortField.isBlank()) {
            rows.sort(Comparator.comparing(row -> Objects.toString(row.get(sortField), "")));
        }
        int effectiveLimit = limit <= 0 ? rows.size() : Math.min(limit, rows.size());
        return new ArrayList<>(rows.subList(0, effectiveLimit));
    }

    private static List<String> columns(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        return new ArrayList<>(rows.get(0).keySet());
    }

    private static QueryPage page(int limit) {
        return new QueryPage(limit <= 0 ? null : limit, null);
    }
}
