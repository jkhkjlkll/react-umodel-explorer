package com.alibaba.umodel.query;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityCallParam;
import com.alibaba.umodel.contract.UModelModels.EntityCallPlan;
import com.alibaba.umodel.contract.UModelModels.QueryExplain;
import com.alibaba.umodel.contract.UModelModels.QueryPage;
import com.alibaba.umodel.contract.UModelModels.QueryPlan;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.graphstore.GraphStore;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.alibaba.umodel.contract.UModelModels.AGENT_PLAN_RESULT_COLUMN;
import static com.alibaba.umodel.contract.UModelModels.FORMAT_AGENT;
import static com.alibaba.umodel.contract.UModelModels.FORMAT_ASSISTANT;

public class QueryService {
    private static final Pattern WITH_PATTERN = Pattern.compile("^with\\((.*)\\)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHERE_PATTERN = Pattern.compile("^where\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LIMIT_PATTERN = Pattern.compile("^limit\\s+(\\d+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PROJECT_PATTERN = Pattern.compile("^project\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SORT_PATTERN = Pattern.compile("^sort\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern GRAPH_CALL_PATTERN = Pattern.compile("^graph-call\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern ENTITY_CALL_PATTERN = Pattern.compile("^entity-call\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIMPLE_PREDICATE_PATTERN = Pattern.compile("^([A-Za-z0-9_.$-]+)\\s*=\\s*(.+)$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GraphStore graphStore;

    public QueryService(GraphStore graphStore) {
        this.graphStore = graphStore;
    }

    public QueryResult execute(String workspace, QueryRequest request) {
        QueryPlan plan = plan(workspace, request);
        QueryResult result = switch (plan.source()) {
            case ".umodel" -> executeUModel(plan);
            case ".entity_set" -> executeEntitySet(plan);
            case ".entity" -> graphStore.queryEntities(plan);
            case ".topo" -> graphStore.queryTopo(plan);
            case ".runbook_set" -> executeRunbookSet(plan);
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported query source");
        };
        if (isAgentPlanResult(result)) {
            return result;
        }
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
                ".entity with(domain='k8s', name='k8s.workload', query='checkout', topk=20)",
                ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call __list_method__()",
                ".entity_set with(domain='devops', name='devops.service') | entity-call list_data_set(['metric_set', 'log_set', 'event_set'], true)",
                ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_logs('devops', 'devops.log.service', query='level = \"ERROR\"')",
                ".entity_set with(domain='devops', name='devops.service', ids=['10000000000000000000000000000101']) | entity-call get_metrics('devops', 'devops.metric.service', 'request_count', step='30s')",
                ".runbook_set with(domain='devops', type='knowledge', query='checkout', mode='hyper', topk=5)",
                ".topo | graph-call getNeighborNodes('full', 2, [(:\"devops@devops.service\" {__entity_id__: '10000000000000000000000000000101'})]) | limit 20",
                ".topo | graph-call getDirectRelations([(:\"devops@devops.service\" {__entity_id__: '10000000000000000000000000000101'})]) | limit 20",
                ".topo | graph-call cypher(`MATCH (src)-[r]->(dest) RETURN src, r AS relation, dest LIMIT 20`)"
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
        String format = normalizeFormat(request == null ? null : request.format());
        String mode = normalizeMode(request == null ? null : request.mode());
        List<String> parts = splitTopLevel(query.trim(), '|');
        String first = parts.get(0).trim();
        String source = first.split("\\s+", 2)[0].trim();
        if (!List.of(".umodel", ".entity_set", ".entity", ".topo", ".runbook_set").contains(source)) {
            throw new UModelException(
                    ErrorCodes.INVALID_ARGUMENT,
                    "query source must be .umodel, .entity_set, .entity, .topo, or .runbook_set"
            );
        }

        Map<String, Object> filters = new LinkedHashMap<>();
        List<String> project = List.of();
        String sortField = null;
        int limit = request == null || request.limit() == null ? 0 : request.limit();
        String graphCall = null;
        EntityCallPlan entityCall = null;

        Map<String, Object> params = request == null || request.parameters() == null ? Map.of() : request.parameters();
        List<String> operations = new ArrayList<>();
        String firstRemainder = first.substring(source.length()).trim();
        if (!firstRemainder.isBlank()) {
            operations.add(firstRemainder);
        }
        for (int i = 1; i < parts.size(); i++) {
            operations.add(parts.get(i).trim());
        }
        for (String op : operations) {
            Matcher withMatcher = WITH_PATTERN.matcher(op);
            Matcher whereMatcher = WHERE_PATTERN.matcher(op);
            Matcher limitMatcher = LIMIT_PATTERN.matcher(op);
            Matcher projectMatcher = PROJECT_PATTERN.matcher(op);
            Matcher sortMatcher = SORT_PATTERN.matcher(op);
            Matcher graphCallMatcher = GRAPH_CALL_PATTERN.matcher(op);
            Matcher entityCallMatcher = ENTITY_CALL_PATTERN.matcher(op);
            if (withMatcher.matches()) {
                filters.putAll(parseFilters(withMatcher.group(1), params));
            } else if (whereMatcher.matches()) {
                filters.putAll(parseWhere(whereMatcher.group(1), params));
            } else if (limitMatcher.matches()) {
                limit = Integer.parseInt(limitMatcher.group(1));
            } else if (projectMatcher.matches()) {
                project = parseCsv(projectMatcher.group(1));
            } else if (sortMatcher.matches()) {
                sortField = parseCsv(sortMatcher.group(1).replaceAll("(?i)\\s+desc$", "")).stream().findFirst().orElse(null);
            } else if (graphCallMatcher.matches()) {
                if (!".topo".equals(source)) {
                    throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "graph-call is only supported for .topo");
                }
                graphCall = graphCallMatcher.group(1).trim();
            } else if (entityCallMatcher.matches()) {
                if (!".entity_set".equals(source)) {
                    throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "entity-call is only supported for .entity_set");
                }
                entityCall = normalizeEntityCall(parseEntityCall(entityCallMatcher.group(1).trim(), params));
            }
        }
        if (filters.get("mode") != null && (request == null || request.mode() == null || request.mode().isBlank())) {
            mode = normalizeMode(stringValue(filters.get("mode")));
        }

        if (".entity_set".equals(source)) {
            if (stringValue(filters.get("domain")).isBlank()) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, ".entity_set requires with(domain=...)");
            }
            if (stringValue(filters.get("name")).isBlank()) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, ".entity_set requires with(name=...)");
            }
            if (entityCall == null) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, ".entity_set requires entity-call");
            }
        }

        int topK = intValue(filters.get("topk"));
        if (limit <= 0 && topK > 0) {
            limit = topK;
        }

        return new QueryPlan(
                workspace,
                source,
                query,
                filters,
                project,
                sortField,
                limit,
                graphCall,
                entityCall,
                format,
                request != null && request.includeSpecEnabled(),
                mode,
                topK <= 0 ? null : topK
        );
    }

    private QueryResult executeUModel(QueryPlan plan) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UModelElement element : graphStore.getUModelSnapshot(plan.workspace()).elements()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", element.stableId());
            row.put("kind", element.kind());
            row.put("domain", element.domain());
            row.put("name", element.name());
            row.put("spec", safeMap(element.spec()));
            row.put("metadata", element.metadata());
            if (matchesFilters(plan.filters(), row)) {
                rows.add(row);
            }
        }
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    private QueryResult executeRunbookSet(QueryPlan plan) {
        String domain = stringValue(plan.filters().get("domain"));
        String query = stringValue(plan.filters().get("query")).toLowerCase(Locale.ROOT);
        String type = stringValue(plan.filters().get("type"));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UModelElement element : graphStore.getUModelSnapshot(plan.workspace()).elements()) {
            if (!"runbook_set".equals(element.kind())) {
                continue;
            }
            if (!domain.isBlank() && !domain.equals(element.domain())) {
                continue;
            }
            Map<String, Object> spec = safeMap(element.spec());
            List<Map<String, Object>> chunks = runbookChunks(element, spec);
            for (Map<String, Object> chunk : chunks) {
                if (!type.isBlank() && !type.equals(stringValue(chunk.get("type")))) {
                    continue;
                }
                double score = searchScore(query, chunk);
                if (!query.isBlank() && score <= 0) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("type", element.domain() + ".runbook_set");
                row.put("domain", element.domain());
                row.put("kind", element.kind());
                row.put("name", element.name());
                row.put("section", chunk.get("section"));
                row.put("title", chunk.get("title"));
                row.put("content", chunk.get("content"));
                row.put("spec", spec);
                row.put("__score__", query.isBlank() ? 1.0 : score);
                rows.add(row);
            }
        }
        rows.sort(Comparator.comparing(row -> -doubleValue(row.get("__score__"))));
        rows = sortAndLimit(rows, plan.sortField(), plan.limit());
        return new QueryResult(rows, columns(rows), page(plan.limit()), null);
    }

    private QueryResult executeEntitySet(QueryPlan plan) {
        EntityCallPlan call = plan.entityCall();
        return switch (call.name()) {
            case "__list_method__" -> assistantRawResponse(listMethodHeader(), listMethodRows());
            case "list_data_set" -> executeListDataSet(plan);
            case "get_logs" -> executeGetLogs(plan);
            case "get_metrics" -> executeGetMetrics(plan);
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported entity-call method");
        };
    }

    private QueryResult executeListDataSet(QueryPlan plan) {
        List<UModelElement> elements = graphStore.getUModelSnapshot(plan.workspace()).elements();
        Set<String> types = dataSetTypeSet(plan.entityCall().parameters().get("data_set_types"));
        boolean detail = boolValue(plan.entityCall().parameters().get("detail"));
        List<Map<String, Object>> data = new ArrayList<>();
        for (RelatedDataSet related : relatedDataSets(elements, stringValue(plan.filters().get("domain")), stringValue(plan.filters().get("name")), types)) {
            data.add(valuesRow(listDataSetValues(elements, related, detail)));
        }
        return assistantRawResponse(listDataSetHeader(), data);
    }

    private QueryResult executeGetLogs(QueryPlan plan) {
        List<UModelElement> elements = graphStore.getUModelSnapshot(plan.workspace()).elements();
        EntityCallPlan call = plan.entityCall();
        UModelElement dataSet = findRelatedDataSet(
                elements,
                stringValue(plan.filters().get("domain")),
                stringValue(plan.filters().get("name")),
                "log_set",
                stringValue(call.parameters().get("domain")),
                stringValue(call.parameters().get("name"))
        );
        UModelElement dataLink = findDataLink(
                elements,
                stringValue(plan.filters().get("domain")),
                stringValue(plan.filters().get("name")),
                dataSet.kind(),
                dataSet.domain(),
                dataSet.name()
        );
        StorageBinding binding = storageBindings(elements, dataSet).stream().findFirst()
                .orElseThrow(() -> new UModelException(ErrorCodes.INVALID_ARGUMENT, "log_set storage not found"));
        Map<String, Object> queryPlan = logQueryPlan(plan, dataSet, dataLink, binding);
        return planResponse(plan, queryPlan);
    }

    private QueryResult executeGetMetrics(QueryPlan plan) {
        List<UModelElement> elements = graphStore.getUModelSnapshot(plan.workspace()).elements();
        EntityCallPlan call = plan.entityCall();
        UModelElement dataSet = findRelatedDataSet(
                elements,
                stringValue(plan.filters().get("domain")),
                stringValue(plan.filters().get("name")),
                "metric_set",
                stringValue(call.parameters().get("domain")),
                stringValue(call.parameters().get("name"))
        );
        UModelElement dataLink = findDataLink(
                elements,
                stringValue(plan.filters().get("domain")),
                stringValue(plan.filters().get("name")),
                dataSet.kind(),
                dataSet.domain(),
                dataSet.name()
        );
        StorageBinding binding = storageBindings(elements, dataSet).stream().findFirst()
                .orElseThrow(() -> new UModelException(ErrorCodes.INVALID_ARGUMENT, "metric_set storage not found"));
        List<Map<String, Object>> metrics = selectedMetrics(dataSet, stringValue(call.parameters().get("metric")));
        Map<String, Object> queryPlan = metricQueryPlan(plan, dataSet, dataLink, binding, metrics);
        return planResponse(plan, queryPlan);
    }

    private QueryResult planResponse(QueryPlan plan, Map<String, Object> queryPlan) {
        if (FORMAT_AGENT.equals(plan.format())) {
            return new QueryResult(
                    List.of(Map.of(AGENT_PLAN_RESULT_COLUMN, queryPlan)),
                    List.of(AGENT_PLAN_RESULT_COLUMN),
                    page(plan.limit()),
                    null
            );
        }
        return assistantQueryResponse(json(queryPlan));
    }

    private QueryExplain explainFromPlan(QueryPlan plan) {
        List<String> operators = new ArrayList<>(List.of("source"));
        if (!plan.filters().isEmpty()) {
            operators.add("with");
        }
        if (plan.entityCall() != null) {
            operators.add("entity-call:" + plan.entityCall().name());
        }
        if (plan.graphCall() != null) {
            operators.add("graph-call");
        }
        if (!plan.project().isEmpty()) {
            operators.add("project");
        }
        if (plan.sortField() != null) {
            operators.add("sort");
        }
        if (plan.limit() > 0) {
            operators.add("limit");
        }
        return new QueryExplain(
                plan.source(),
                graphStore.capabilities().provider(),
                graphStore.health().provider(),
                List.of(),
                List.of(),
                operators,
                null,
                plan.filters(),
                plan.limit() <= 0 ? null : plan.limit(),
                null,
                false,
                searchMode(plan),
                searchProvider(plan),
                ".runbook_set".equals(plan.source()) || semanticEntitySearch(plan) ? "memory-keyword-fallback" : null,
                plan.entityCall()
        );
    }

    private static String normalizeFormat(String format) {
        if (format == null || format.isBlank() || FORMAT_ASSISTANT.equals(format)) {
            return FORMAT_ASSISTANT;
        }
        if (FORMAT_AGENT.equals(format)) {
            return FORMAT_AGENT;
        }
        throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported query format: " + format);
    }

    private static String normalizeMode(String mode) {
        if (mode == null || mode.isBlank() || "plan".equalsIgnoreCase(mode)) {
            return "plan";
        }
        String normalized = mode.toLowerCase(Locale.ROOT);
        if (List.of("keyword", "vector", "hyper", "hybrid").contains(normalized)) {
            return normalized;
        }
        if ("data".equalsIgnoreCase(mode)) {
            throw new UModelException(ErrorCodes.NOT_IMPLEMENTED, "mode=data requires a telemetry data provider; Java backend currently returns executable plans");
        }
        throw new UModelException(ErrorCodes.NOT_IMPLEMENTED, "unsupported query mode: " + mode);
    }

    private static QueryResult assistantRawResponse(List<String> header, List<Map<String, Object>> data) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("responseType", 2);
        row.put("query", "");
        row.put("header", header);
        row.put("data", data);
        return new QueryResult(List.of(row), List.of("responseType", "query", "header", "data"), page(0), null);
    }

    private static QueryResult assistantQueryResponse(String query) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("responseType", 1);
        row.put("query", query);
        row.put("header", List.of());
        row.put("data", List.of());
        return new QueryResult(List.of(row), List.of("responseType", "query", "header", "data"), page(0), null);
    }

    private static List<String> listMethodHeader() {
        return List.of("name", "display_name", "description", "params", "returns");
    }

    private static List<Map<String, Object>> listMethodRows() {
        return List.of(
                methodInfo("__list_method__", "List Available Methods", "Get all methods supported by current EntitySet", List.of(), listMethodHeader()),
                methodInfo("list_data_set", "List DataSets", "Get DataSets related to EntitySet", List.of(
                        new EntityCallParam("data_set_types", "array<varchar>", "Data Set Types", "metric_set, log_set, trace_set, event_set", false, null),
                        new EntityCallParam("detail", "boolean", "Detail Info", "If true, return all fields of DataSet", false, false)
                ), listDataSetHeader()),
                methodInfo("get_logs", "Get Logs", "Get log query plan from a LogSet", List.of(
                        new EntityCallParam("domain", "varchar", "log_set Domain", "", true, null),
                        new EntityCallParam("name", "varchar", "log_set Name", "", true, null),
                        new EntityCallParam("query", "varchar", "Query expression", "Basic SPL where syntax.", false, null),
                        new EntityCallParam("storage_domain", "varchar", "Storage Domain", "", false, null),
                        new EntityCallParam("storage_name", "varchar", "Storage Name", "", false, null),
                        new EntityCallParam("storage_kind", "varchar", "Storage Kind", "", false, null)
                ), List.of("query")),
                methodInfo("get_metrics", "Get Metrics", "Get metric query plan from a MetricSet", List.of(
                        new EntityCallParam("domain", "varchar", "metric_set Domain", "", true, null),
                        new EntityCallParam("name", "varchar", "metric_set Name", "", true, null),
                        new EntityCallParam("metric", "varchar", "Metric name", "", false, null),
                        new EntityCallParam("query", "varchar", "Query expression", "Basic SPL where syntax.", false, null),
                        new EntityCallParam("query_type", "varchar", "Prometheus query type", "range or instant", false, null),
                        new EntityCallParam("step", "varchar", "Range query step", "", false, null),
                        new EntityCallParam("aggregate", "boolean", "Aggregate time series", "", false, true),
                        new EntityCallParam("storage_domain", "varchar", "Storage Domain", "", false, null),
                        new EntityCallParam("storage_name", "varchar", "Storage Name", "", false, null),
                        new EntityCallParam("storage_kind", "varchar", "Storage Kind", "", false, null)
                ), List.of("query"))
        );
    }

    private static Map<String, Object> methodInfo(
            String name,
            String displayName,
            String description,
            List<EntityCallParam> params,
            List<String> returns
    ) {
        return valuesRow(List.of(name, displayName, description, json(params), json(returns)));
    }

    private static List<String> listDataSetHeader() {
        return List.of(
                "data_set_id",
                "data_set_type",
                "domain",
                "name",
                "fields_mapping",
                "filterable_fields",
                "data_set_fields",
                "storage_info",
                "storage_link_info",
                "data_link_detail",
                "data_set_detail",
                "storage_detail",
                "storage_link_detail"
        );
    }

    private static List<String> listDataSetValues(List<UModelElement> elements, RelatedDataSet related, boolean detail) {
        UModelElement dataSet = related.dataSet();
        List<StorageBinding> bindings = storageBindings(elements, dataSet);
        UModelElement link = related.link();
        Object dataLinkDetail = detail && link != null ? linkMap(link) : "{}";
        Object dataSetDetail = detail ? linkMap(dataSet) : "{}";
        Object storageDetail = detail ? bindings.stream().map(binding -> linkMap(binding.storage())).toList() : List.of();
        Object storageLinkDetail = detail ? bindings.stream().map(binding -> linkMap(binding.link())).toList() : List.of();
        return List.of(
                uniqueId(dataSet.domain(), dataSet.kind(), dataSet.name()),
                dataSet.kind(),
                dataSet.domain(),
                dataSet.name(),
                json(link == null ? Map.of() : mapValue(spec(link).get("fields_mapping"))),
                json(filterableFields(dataSet)),
                json(dataSetFields(dataSet)),
                json(bindings.stream().map(binding -> storageInfo(binding.storage())).toList()),
                json(bindings.stream().map(binding -> storageLinkInfo(binding.link())).toList()),
                json(dataLinkDetail),
                json(dataSetDetail),
                json(storageDetail),
                json(storageLinkDetail)
        );
    }

    private static Map<String, Object> metricQueryPlan(QueryPlan plan, UModelElement metricSet, UModelElement dataLink, StorageBinding binding, List<Map<String, Object>> metrics) {
        EntityCallPlan call = plan.entityCall();
        String metric = stringValue(call.parameters().get("metric"));
        String step = stringValue(call.parameters().get("step"));
        String queryType = firstNonEmpty(stringValue(call.parameters().get("query_type")), stringValue(spec(metricSet).get("query_type")), "range");
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("dialect", storageDialect(binding.storage(), "prometheus_promql"));
        query.put("endpoint", spec(binding.storage()).get("endpoint"));
        query.put("query_type", queryType);
        query.put("step", firstNonEmpty(step, stringValue(spec(binding.storage()).get("default_step"))));
        query.put("metrics", metrics.stream().map(QueryService::metricItem).toList());
        query.put("label_matchers", labelMatchers(dataLink, binding.link(), plan));
        query.put("limit", plan.limit());

        Map<String, Object> out = basePlan(plan, "get_metrics", metricSet, dataLink, binding);
        out.put("description", describeMetricPlan(metricSet, binding.storage(), metric, stringValue(call.parameters().get("query")), queryType, step));
        out.put("query", query);
        return out;
    }

    private static Map<String, Object> logQueryPlan(QueryPlan plan, UModelElement logSet, UModelElement dataLink, StorageBinding binding) {
        EntityCallPlan call = plan.entityCall();
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("dialect", storageDialect(binding.storage(), "elasticsearch_dsl"));
        query.put("endpoint", spec(binding.storage()).get("endpoint"));
        query.put("index", firstNonEmpty(stringValue(spec(logSet).get("index")), stringValue(spec(binding.storage()).get("index"))));
        query.put("filters", labelMatchers(dataLink, binding.link(), plan));
        query.put("query", stringValue(call.parameters().get("query")));
        query.put("limit", plan.limit());

        Map<String, Object> out = basePlan(plan, "get_logs", logSet, dataLink, binding);
        out.put("description", describeLogPlan(logSet, binding.storage(), stringValue(call.parameters().get("query"))));
        out.put("query", query);
        return out;
    }

    private static Map<String, Object> basePlan(QueryPlan plan, String operation, UModelElement dataSet, UModelElement dataLink, StorageBinding binding) {
        boolean agent = FORMAT_AGENT.equals(plan.format());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", "plan");
        out.put("version", agent ? "v1.1" : "v1");
        out.put("operation", operation);
        out.put("next_action", "execute_query");
        out.put("source_query", plan.query());
        Map<String, Object> dataSource = new LinkedHashMap<>();
        dataSource.put("data_set", dataSetRef(dataSet, agent, plan.includeSpec()));
        dataSource.put("storage", storageRef(binding.storage(), agent, plan.includeSpec()));
        dataSource.put("data_link", linkRef(dataLink, agent, plan.includeSpec()));
        dataSource.put("storage_link", linkRef(binding.link(), agent, plan.includeSpec()));
        out.put("data_source", dataSource);
        out.put("params_echo", echoParams(plan.entityCall().parameters()));
        return out;
    }

    private static List<Map<String, Object>> labelMatchers(UModelElement dataLink, UModelElement storageLink, QueryPlan plan) {
        Map<String, Object> dataLinkMapping = mapValue(spec(dataLink).get("fields_mapping"));
        Map<String, Object> storageLinkMapping = mapValue(spec(storageLink).get("fields_mapping"));
        List<Map<String, Object>> matchers = new ArrayList<>();
        String storageIdField = mappedStorageField(dataLinkMapping, storageLinkMapping, "id");
        for (String id : stringList(plan.filters().get("ids"))) {
            if (!storageIdField.isBlank()) {
                matchers.add(matcher(storageIdField, "=", id));
            }
        }
        addSimpleFilterMatchers(matchers, dataLinkMapping, storageLinkMapping, stringValue(plan.filters().get("query")), true);
        if (plan.entityCall() != null) {
            addSimpleFilterMatchers(matchers, dataLinkMapping, storageLinkMapping, stringValue(plan.entityCall().parameters().get("query")), false);
        }
        return dedupeMatchers(matchers);
    }

    private static void addSimpleFilterMatchers(
            List<Map<String, Object>> matchers,
            Map<String, Object> dataLinkMapping,
            Map<String, Object> storageLinkMapping,
            String raw,
            boolean entityField
    ) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        for (String part : splitConjunctions(raw)) {
            String item = part.trim();
            Matcher matcher = SIMPLE_PREDICATE_PATTERN.matcher(item);
            if (!matcher.matches()) {
                continue;
            }
            String field = matcher.group(1).trim();
            String mapped = entityField
                    ? mappedStorageField(dataLinkMapping, storageLinkMapping, field)
                    : stringValue(storageLinkMapping.getOrDefault(field, field));
            Object value = parseValue(matcher.group(2).trim(), Map.of());
            if (!mapped.isBlank() && value != null) {
                matchers.add(matcher(mapped, "=", stringValue(value)));
            }
        }
    }

    private static List<Map<String, Object>> dedupeMatchers(List<Map<String, Object>> matchers) {
        Set<String> seen = new LinkedHashSet<>();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> matcher : matchers) {
            String key = matcher.toString();
            if (seen.add(key)) {
                out.add(matcher);
            }
        }
        return out;
    }

    private static Map<String, Object> matcher(String label, String operator, String value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("label", label);
        out.put("operator", operator);
        out.put("value", value);
        return out;
    }

    private static String mappedStorageField(Map<String, Object> dataLinkMapping, Map<String, Object> storageLinkMapping, String entityField) {
        String dataSetField = stringValue(dataLinkMapping.getOrDefault(entityField, entityField));
        return stringValue(storageLinkMapping.getOrDefault(dataSetField, dataSetField));
    }

    private static Map<String, Object> dataSetRef(UModelElement element, boolean agent, boolean includeSpec) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!agent) {
            out.put("domain", element.domain());
            out.put("kind", element.kind());
            out.put("name", element.name());
            return out;
        }
        out.put("ref", element.domain() + "/" + element.name());
        out.put("kind", element.kind());
        if (includeSpec) {
            out.put("spec", safeMap(element.spec()));
        }
        return out;
    }

    private static Map<String, Object> storageRef(UModelElement element, boolean agent, boolean includeSpec) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!agent) {
            out.put("domain", element.domain());
            out.put("type", element.kind());
            out.put("name", element.name());
            out.put("config", safeMap(element.spec()));
            return out;
        }
        out.put("ref", element.domain() + "/" + element.name());
        out.put("type", element.kind());
        if (includeSpec) {
            out.put("config", safeMap(element.spec()));
        }
        return out;
    }

    private static Map<String, Object> linkRef(UModelElement element, boolean agent, boolean includeSpec) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!agent) {
            out.put("domain", element.domain());
            out.put("name", element.name());
            out.put("spec", safeMap(element.spec()));
            return out;
        }
        out.put("ref", element.domain() + "/" + element.name());
        out.put("kind", element.kind());
        if (includeSpec) {
            out.put("spec", safeMap(element.spec()));
        }
        return out;
    }

    private static String describeMetricPlan(UModelElement metricSet, UModelElement storage, String metric, String filter, String queryType, String step) {
        String metricLabel = metric == null || metric.isBlank() ? "all metrics" : "metric \"" + metric + "\"";
        List<String> parts = new ArrayList<>();
        parts.add("Retrieve " + metricLabel + " from MetricSet " + metricSet.domain() + "/" + metricSet.name());
        if (filter != null && !filter.isBlank()) {
            parts.add("filtered by [" + filter + "]");
        }
        if (queryType != null && !queryType.isBlank()) {
            parts.add("as " + queryType + " query");
        }
        if (step != null && !step.isBlank()) {
            parts.add("with step " + step);
        }
        parts.add("(storage: " + storage.kind() + "/" + storage.name() + ").");
        parts.add("The query block is ready to run against that storage; execute it to fetch the time series.");
        return String.join(" ", parts);
    }

    private static String describeLogPlan(UModelElement logSet, UModelElement storage, String filter) {
        List<String> parts = new ArrayList<>();
        parts.add("Retrieve logs from LogSet " + logSet.domain() + "/" + logSet.name());
        if (filter != null && !filter.isBlank()) {
            parts.add("filtered by [" + filter + "]");
        }
        parts.add("(storage: " + storage.kind() + "/" + storage.name() + ").");
        parts.add("The query block is ready to run against that storage; execute it to fetch the log rows.");
        return String.join(" ", parts);
    }

    private static UModelElement findRelatedDataSet(List<UModelElement> elements, String entityDomain, String entityName, String dataSetKind, String dataSetDomain, String dataSetName) {
        for (UModelElement link : elements) {
            if (!"data_link".equals(link.kind())) {
                continue;
            }
            Ref src = refFromSpec(spec(link), "src", "source");
            Ref dest = refFromSpec(spec(link), "dest", "target");
            if (!"entity_set".equals(src.kind()) || !entityDomain.equals(src.domain()) || !entityName.equals(src.name())) {
                continue;
            }
            if (!dataSetKind.equals(dest.kind()) || !dataSetDomain.equals(dest.domain()) || !dataSetName.equals(dest.name())) {
                continue;
            }
            return findElement(elements, dest.kind(), dest.domain(), dest.name());
        }
        throw new UModelException(ErrorCodes.INVALID_ARGUMENT, dataSetKind + " not found for entity_set");
    }

    private static UModelElement findDataLink(List<UModelElement> elements, String entityDomain, String entityName, String dataSetKind, String dataSetDomain, String dataSetName) {
        for (UModelElement link : elements) {
            if (!"data_link".equals(link.kind())) {
                continue;
            }
            Ref src = refFromSpec(spec(link), "src", "source");
            Ref dest = refFromSpec(spec(link), "dest", "target");
            if ("entity_set".equals(src.kind())
                    && entityDomain.equals(src.domain())
                    && entityName.equals(src.name())
                    && dataSetKind.equals(dest.kind())
                    && dataSetDomain.equals(dest.domain())
                    && dataSetName.equals(dest.name())) {
                return link;
            }
        }
        throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "data_link not found for entity_set and dataset");
    }

    private static List<RelatedDataSet> relatedDataSets(List<UModelElement> elements, String entityDomain, String entityName, Set<String> types) {
        List<RelatedDataSet> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (UModelElement link : elements) {
            if (!"data_link".equals(link.kind())) {
                continue;
            }
            Ref src = refFromSpec(spec(link), "src", "source");
            Ref dest = refFromSpec(spec(link), "dest", "target");
            if (!"entity_set".equals(src.kind()) || !entityDomain.equals(src.domain()) || !entityName.equals(src.name())) {
                continue;
            }
            if (!dataSetAllowed(types, dest.kind())) {
                continue;
            }
            UModelElement dataSet = findElementOrNull(elements, dest.kind(), dest.domain(), dest.name());
            if (dataSet == null) {
                continue;
            }
            out.add(new RelatedDataSet(link, dataSet));
            seen.add(uniqueId(dataSet.domain(), dataSet.kind(), dataSet.name()));
        }
        for (UModelElement dataSet : elements) {
            if (!"default".equals(dataSet.domain()) || !dataSetAllowed(types, dataSet.kind())) {
                continue;
            }
            if (seen.add(uniqueId(dataSet.domain(), dataSet.kind(), dataSet.name()))) {
                out.add(new RelatedDataSet(null, dataSet));
            }
        }
        return out;
    }

    private static List<StorageBinding> storageBindings(List<UModelElement> elements, UModelElement dataSet) {
        List<StorageBinding> out = new ArrayList<>();
        for (UModelElement link : elements) {
            if (!"storage_link".equals(link.kind())) {
                continue;
            }
            Ref src = refFromSpec(spec(link), "src", "source");
            if (!dataSet.domain().equals(src.domain()) || !dataSet.kind().equals(src.kind()) || !dataSet.name().equals(src.name())) {
                continue;
            }
            Ref dest = refFromSpec(spec(link), "dest", "target");
            UModelElement storage = findElementOrNull(elements, dest.kind(), dest.domain(), dest.name());
            if (storage != null) {
                out.add(new StorageBinding(link, storage));
            }
        }
        return out;
    }

    private static UModelElement findElement(List<UModelElement> elements, String kind, String domain, String name) {
        UModelElement element = findElementOrNull(elements, kind, domain, name);
        if (element == null) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "umodel element not found: " + kind + " " + domain + "/" + name);
        }
        return element;
    }

    private static UModelElement findElementOrNull(List<UModelElement> elements, String kind, String domain, String name) {
        for (UModelElement element : elements) {
            if (Objects.equals(kind, element.kind())
                    && Objects.equals(domain, element.domain())
                    && Objects.equals(name, element.name())) {
                return element;
            }
        }
        return null;
    }

    private static EntityCallPlan parseEntityCall(String expression, Map<String, Object> params) {
        int open = expression.indexOf('(');
        int close = expression.lastIndexOf(')');
        if (open <= 0 || close < open) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "entity-call requires a function call");
        }
        String name = expression.substring(0, open).trim();
        String argsText = expression.substring(open + 1, close).trim();
        List<Object> args = new ArrayList<>();
        Map<String, Object> named = new LinkedHashMap<>();
        if (!argsText.isBlank()) {
            for (String item : splitTopLevel(argsText, ',')) {
                int idx = topLevelEquals(item);
                if (idx > 0) {
                    String key = item.substring(0, idx).trim();
                    named.put(key, parseValue(item.substring(idx + 1).trim(), params));
                } else {
                    args.add(parseValue(item.trim(), params));
                }
            }
        }
        return new EntityCallPlan(name, args, named, Map.of(), List.of());
    }

    private static EntityCallPlan normalizeEntityCall(EntityCallPlan call) {
        MethodSpec spec = methodSpec(call.name());
        if (call.arguments().size() > spec.params().size()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "entity-call has too many arguments");
        }
        Map<String, Object> parameters = new LinkedHashMap<>();
        for (int i = 0; i < call.arguments().size(); i++) {
            EntityCallParam param = spec.params().get(i);
            if (call.namedArguments().containsKey(param.key())) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "entity-call argument is provided twice: " + param.key());
            }
            parameters.put(param.key(), call.arguments().get(i));
        }
        for (Map.Entry<String, Object> entry : call.namedArguments().entrySet()) {
            EntityCallParam param = spec.param(entry.getKey());
            if (param == null) {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported entity-call named argument: " + entry.getKey());
            }
            parameters.put(entry.getKey(), entry.getValue());
        }
        for (EntityCallParam param : spec.params()) {
            if (!parameters.containsKey(param.key())) {
                if (param.required()) {
                    throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "entity-call required argument is missing: " + param.key());
                }
                parameters.put(param.key(), param.defaultValue());
            }
        }
        return new EntityCallPlan(spec.name(), call.arguments(), call.namedArguments(), parameters, spec.params());
    }

    private static MethodSpec methodSpec(String rawName) {
        return switch (rawName) {
            case "__list_method__" -> new MethodSpec("__list_method__", List.of());
            case "list_dataset", "list_data_set" -> new MethodSpec("list_data_set", List.of(
                    new EntityCallParam("data_set_types", "array<varchar>", "Data Set Types", "", false, null),
                    new EntityCallParam("detail", "boolean", "Detail Info", "", false, false)
            ));
            case "get_log", "get_logs" -> new MethodSpec("get_logs", List.of(
                    new EntityCallParam("domain", "varchar", "log_set Domain", "", true, null),
                    new EntityCallParam("name", "varchar", "log_set Name", "", true, null),
                    new EntityCallParam("query", "varchar", "Query expression", "", false, null),
                    new EntityCallParam("storage_domain", "varchar", "Storage Domain", "", false, null),
                    new EntityCallParam("storage_name", "varchar", "Storage Name", "", false, null),
                    new EntityCallParam("storage_kind", "varchar", "Storage Kind", "", false, null)
            ));
            case "get_metric", "get_metrics" -> new MethodSpec("get_metrics", List.of(
                    new EntityCallParam("domain", "varchar", "metric_set Domain", "", true, null),
                    new EntityCallParam("name", "varchar", "metric_set Name", "", true, null),
                    new EntityCallParam("metric", "varchar", "Metric name", "", false, null),
                    new EntityCallParam("query", "varchar", "Query expression", "", false, null),
                    new EntityCallParam("query_type", "varchar", "Prometheus query type", "", false, null),
                    new EntityCallParam("step", "varchar", "Range query step", "", false, null),
                    new EntityCallParam("aggregate", "boolean", "Aggregate time series", "", false, true),
                    new EntityCallParam("storage_domain", "varchar", "Storage Domain", "", false, null),
                    new EntityCallParam("storage_name", "varchar", "Storage Name", "", false, null),
                    new EntityCallParam("storage_kind", "varchar", "Storage Kind", "", false, null)
            ));
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported entity-call method: " + rawName);
        };
    }

    private static Map<String, Object> parseFilters(String value, Map<String, Object> params) {
        Map<String, Object> filters = new LinkedHashMap<>();
        for (String item : splitTopLevel(value, ',')) {
            int idx = topLevelEquals(item);
            if (idx <= 0) {
                continue;
            }
            filters.put(item.substring(0, idx).trim(), parseValue(item.substring(idx + 1).trim(), params));
        }
        return filters;
    }

    private static Map<String, Object> parseWhere(String value, Map<String, Object> params) {
        Map<String, Object> filters = new LinkedHashMap<>();
        Matcher matcher = SIMPLE_PREDICATE_PATTERN.matcher(value.trim());
        if (matcher.matches()) {
            filters.put(matcher.group(1).trim(), parseValue(matcher.group(2).trim(), params));
        }
        return filters;
    }

    private static Object parseValue(String raw, Map<String, Object> params) {
        raw = raw.trim();
        if (raw.startsWith("$")) {
            return params.get(raw.substring(1));
        }
        if (raw.length() >= 2 && ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith("\"") && raw.endsWith("\"")))) {
            return raw.substring(1, raw.length() - 1);
        }
        if (raw.startsWith("[") && raw.endsWith("]")) {
            String inner = raw.substring(1, raw.length() - 1).trim();
            if (inner.isBlank()) {
                return List.of();
            }
            return splitTopLevel(inner, ',').stream().map(item -> parseValue(item.trim(), params)).toList();
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

    private static List<String> splitTopLevel(String value, char delimiter) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        int parenDepth = 0;
        boolean singleQuoted = false;
        boolean doubleQuoted = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '\'' && !doubleQuoted) {
                singleQuoted = !singleQuoted;
            } else if (ch == '"' && !singleQuoted) {
                doubleQuoted = !doubleQuoted;
            } else if (!singleQuoted && !doubleQuoted) {
                if (ch == '[') {
                    bracketDepth++;
                } else if (ch == ']') {
                    bracketDepth--;
                } else if (ch == '(') {
                    parenDepth++;
                } else if (ch == ')') {
                    parenDepth--;
                }
            }
            if (ch == delimiter && bracketDepth == 0 && parenDepth == 0 && !singleQuoted && !doubleQuoted) {
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

    private static List<String> splitConjunctions(String value) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean singleQuoted = false;
        boolean doubleQuoted = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '\'' && !doubleQuoted) {
                singleQuoted = !singleQuoted;
            } else if (ch == '"' && !singleQuoted) {
                doubleQuoted = !doubleQuoted;
            }
            if (!singleQuoted && !doubleQuoted && value.startsWith("&&", i)) {
                parts.add(current.toString().trim());
                current.setLength(0);
                i++;
                continue;
            }
            if (!singleQuoted && !doubleQuoted && startsWithWord(value, i, "and")) {
                parts.add(current.toString().trim());
                current.setLength(0);
                i += 2;
                continue;
            }
            current.append(ch);
        }
        if (current.length() > 0) {
            parts.add(current.toString().trim());
        }
        return parts.stream().filter(part -> !part.isBlank()).toList();
    }

    private static boolean startsWithWord(String value, int index, String word) {
        if (index < 0 || index + word.length() > value.length()) {
            return false;
        }
        if (!value.regionMatches(true, index, word, 0, word.length())) {
            return false;
        }
        boolean before = index == 0 || Character.isWhitespace(value.charAt(index - 1));
        int end = index + word.length();
        boolean after = end >= value.length() || Character.isWhitespace(value.charAt(end));
        return before && after;
    }

    private static int topLevelEquals(String value) {
        int bracketDepth = 0;
        boolean singleQuoted = false;
        boolean doubleQuoted = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '\'' && !doubleQuoted) {
                singleQuoted = !singleQuoted;
            } else if (ch == '"' && !singleQuoted) {
                doubleQuoted = !doubleQuoted;
            } else if (!singleQuoted && !doubleQuoted) {
                if (ch == '[') {
                    bracketDepth++;
                } else if (ch == ']') {
                    bracketDepth--;
                } else if (ch == '=' && bracketDepth == 0) {
                    return i;
                }
            }
        }
        return -1;
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
            if (List.of("query", "topk", "mode", "hybrid_k", "ids").contains(filter.getKey())) {
                if ("query".equals(filter.getKey()) && filter.getValue() != null) {
                    String needle = stringValue(filter.getValue()).toLowerCase(Locale.ROOT);
                    if (row.values().stream().map(value -> stringValue(value).toLowerCase(Locale.ROOT)).noneMatch(value -> value.contains(needle))) {
                        return false;
                    }
                }
                continue;
            }
            Object actual = row.get(filter.getKey());
            if (!Objects.equals(stringValue(filter.getValue()), stringValue(actual))) {
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
            rows.sort(Comparator.comparing(row -> stringValue(row.get(sortField))));
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

    private static boolean isAgentPlanResult(QueryResult result) {
        return result != null && result.columns() != null && result.columns().size() == 1
                && AGENT_PLAN_RESULT_COLUMN.equals(result.columns().get(0));
    }

    private static Set<String> dataSetTypeSet(Object value) {
        List<String> types = stringList(value);
        return types.isEmpty() ? Set.of() : new LinkedHashSet<>(types);
    }

    private static boolean dataSetAllowed(Set<String> types, String kind) {
        return types == null || types.isEmpty() || types.contains(kind);
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

    private static Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    private static Map<String, Object> spec(UModelElement element) {
        return element == null ? Map.of() : safeMap(element.spec());
    }

    private static List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item != null && !stringValue(item).isBlank()) {
                    out.add(stringValue(item));
                }
            }
            return out;
        }
        if (value instanceof String text && !text.isBlank()) {
            return List.of(text);
        }
        return List.of();
    }

    private static List<Map<String, Object>> selectedMetrics(UModelElement metricSet, String metricName) {
        Object raw = spec(metricSet).get("metrics");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "metric_set metrics not found");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            Map<String, Object> metric = mapValue(item);
            if (metricName == null || metricName.isBlank() || metricName.equals(stringValue(metric.get("name")))) {
                out.add(metric);
            }
        }
        if (out.isEmpty()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "metric not found in metric_set");
        }
        return out;
    }

    private static Map<String, Object> metricItem(Map<String, Object> metric) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("name", metric.get("name"));
        for (String key : List.of("unit", "data_format", "type", "query_mode", "aggregator", "display_type", "golden_metric")) {
            if (metric.containsKey(key)) {
                item.put(key, metric.get(key));
            }
        }
        return item;
    }

    private static Map<String, Object> storageInfo(UModelElement storage) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", storage.domain());
        out.put("type", storage.kind());
        out.put("name", storage.name());
        out.put("config", safeMap(storage.spec()));
        return out;
    }

    private static Map<String, Object> storageLinkInfo(UModelElement link) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", link.domain());
        out.put("name", link.name());
        out.put("spec", safeMap(link.spec()));
        return out;
    }

    private static Map<String, Object> linkMap(UModelElement element) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", element.kind());
        out.put("domain", element.domain());
        out.put("name", element.name());
        out.put("spec", safeMap(element.spec()));
        return out;
    }

    private static List<Map<String, Object>> filterableFields(UModelElement dataSet) {
        Object fields = spec(dataSet).get("fields");
        if (!(fields instanceof Map<?, ?> map)) {
            return List.of();
        }
        return map.keySet().stream().map(key -> Map.<String, Object>of("name", stringValue(key))).toList();
    }

    private static Object dataSetFields(UModelElement dataSet) {
        return spec(dataSet).getOrDefault("fields", Map.of());
    }

    private static Map<String, Object> valuesRow(List<String> values) {
        return Map.of("values", values);
    }

    private static Ref refFromSpec(Map<String, Object> spec, String mapKey, String compactKey) {
        Object value = spec == null ? null : spec.get(mapKey);
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> ref = mapValue(map);
            return new Ref(
                    stringValue(ref.get("domain")),
                    stringValue(ref.get("kind")),
                    stringValue(ref.get("name"))
            );
        }
        Object compact = spec == null ? null : spec.get(compactKey);
        String text = stringValue(compact);
        if (!text.isBlank()) {
            return new Ref("", "", text);
        }
        return new Ref("", "", "");
    }

    private static String uniqueId(String domain, String kind, String name) {
        return domain + "/" + kind + "/" + name;
    }

    private static String storageDialect(UModelElement storage, String fallback) {
        return switch (storage.kind()) {
            case "prometheus", "aliyun_prometheus" -> "prometheus_promql";
            case "elasticsearch", "sls_logstore" -> "elasticsearch_dsl";
            default -> fallback == null ? storage.kind() : fallback;
        };
    }

    private static String searchMode(QueryPlan plan) {
        if (".runbook_set".equals(plan.source())) {
            String mode = stringValue(plan.filters().get("mode"));
            if (!mode.isBlank()) {
                return mode;
            }
            return "plan".equals(plan.mode()) ? "keyword" : plan.mode();
        }
        if (semanticEntitySearch(plan)) {
            return plan.mode();
        }
        return null;
    }

    private static String searchProvider(QueryPlan plan) {
        if (".runbook_set".equals(plan.source()) || semanticEntitySearch(plan)) {
            return "memory";
        }
        return null;
    }

    private static boolean semanticEntitySearch(QueryPlan plan) {
        return ".entity".equals(plan.source()) && List.of("keyword", "vector", "hyper", "hybrid").contains(plan.mode());
    }

    private static List<Map<String, Object>> runbookChunks(UModelElement element, Map<String, Object> spec) {
        List<Map<String, Object>> rows = new ArrayList<>();
        addRunbookItems(rows, element, "knowledge", spec.get("knowledge"));
        addRunbookItems(rows, element, "automation", spec.get("automations"));
        addRunbookItems(rows, element, "automation", spec.get("automation"));
        addRunbookItems(rows, element, "step", spec.get("steps"));
        if (rows.isEmpty()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("type", "runbook");
            row.put("section", "spec");
            row.put("title", firstNonEmpty(stringValue(spec.get("display_name")), element.name()));
            row.put("content", json(spec));
            rows.add(row);
        }
        return rows;
    }

    private static void addRunbookItems(List<Map<String, Object>> rows, UModelElement element, String type, Object raw) {
        if (raw instanceof List<?> list) {
            int index = 0;
            for (Object item : list) {
                rows.add(runbookChunk(element, type, index++, item));
            }
            return;
        }
        if (raw instanceof Map<?, ?> || raw instanceof String) {
            rows.add(runbookChunk(element, type, rows.size(), raw));
        }
    }

    private static Map<String, Object> runbookChunk(UModelElement element, String type, int index, Object item) {
        Map<String, Object> map = mapValue(item);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("type", type);
        row.put("section", type + "[" + index + "]");
        row.put("title", firstNonEmpty(
                stringValue(map.get("title")),
                stringValue(map.get("name")),
                stringValue(map.get("summary")),
                element.name()
        ));
        row.put("content", item instanceof String text ? text : json(item));
        return row;
    }

    private static double searchScore(String query, Map<String, Object> row) {
        if (query == null || query.isBlank()) {
            return 1.0;
        }
        String haystack = row.values().stream()
                .map(QueryService::stringValue)
                .reduce("", (left, right) -> left + " " + right)
                .toLowerCase(Locale.ROOT);
        double score = 0.0;
        for (String term : query.split("\\s+")) {
            if (term.isBlank()) {
                continue;
            }
            if (haystack.contains(term)) {
                score += 1.0;
            }
        }
        return score;
    }

    private static double doubleValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(stringValue(value));
        } catch (NumberFormatException ignored) {
            return 0.0;
        }
    }

    private static Map<String, Object> echoParams(Map<String, Object> params) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (params == null) {
            return out;
        }
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            Object value = entry.getValue();
            if (value == null || (value instanceof String text && text.isBlank())) {
                continue;
            }
            out.put(entry.getKey(), value);
        }
        return out;
    }

    private static boolean boolValue(Object value) {
        return value instanceof Boolean bool ? bool : Boolean.parseBoolean(stringValue(value));
    }

    private static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(stringValue(value));
        } catch (NumberFormatException ignored) {
            return 0;
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
        return value == null ? "" : Objects.toString(value, "");
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "failed to encode query plan JSON");
        }
    }

    private record Ref(String domain, String kind, String name) {
    }

    private record RelatedDataSet(UModelElement link, UModelElement dataSet) {
    }

    private record StorageBinding(UModelElement link, UModelElement storage) {
    }

    private record MethodSpec(String name, List<EntityCallParam> params) {
        EntityCallParam param(String key) {
            for (EntityCallParam param : params) {
                if (param.key().equals(key)) {
                    return param;
                }
            }
            return null;
        }
    }
}
