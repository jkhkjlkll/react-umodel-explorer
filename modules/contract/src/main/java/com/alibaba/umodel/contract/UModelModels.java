package com.alibaba.umodel.contract;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UModelModels {
    public static final String FORMAT_ASSISTANT = "";
    public static final String FORMAT_AGENT = "agent";
    public static final String AGENT_PLAN_RESULT_COLUMN = "__agent_plan__";

    private UModelModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record WorkspaceMetadata(
            String id,
            String name,
            String description,
            String status,
            Map<String, Object> labels,
            Map<String, Object> config,
            WorkspacePaths paths,
            long resourceVersion,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {
    }

    public record WorkspacePaths(
            String root,
            String tmp
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateWorkspaceRequest(
            String id,
            String name,
            String description,
            Map<String, Object> labels,
            Map<String, Object> config
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UpdateWorkspaceRequest(
            String name,
            String description,
            Map<String, Object> labels,
            Map<String, Object> config,
            Long ifMatchVersion,
            Boolean replaceLabels,
            Boolean replaceConfig
    ) {
    }

    public record Page<T>(
            List<T> items,
            String nextToken
    ) {
    }

    public record ErrorDetail(
            String field,
            String reason
    ) {
    }

    public record ErrorResponse(
            String code,
            String message,
            Map<String, String> details
    ) {
    }

    public record ErrorEnvelope(
            ErrorBody error
    ) {
    }

    public record ErrorBody(
            String code,
            String message,
            boolean retryable
    ) {
    }

    public record ValidationResult(
            boolean valid,
            List<ErrorDetail> errors,
            List<ErrorDetail> warnings
    ) {
        public static ValidationResult ok() {
            return new ValidationResult(true, List.of(), List.of());
        }

        public static ValidationResult invalid(String field, String reason) {
            return new ValidationResult(false, List.of(new ErrorDetail(field, reason)), List.of());
        }
    }

    public record BatchItemResult(
            String id,
            boolean ok,
            String code,
            String message,
            List<ErrorDetail> details
    ) {
    }

    public record WriteResult(
            int accepted,
            int failed,
            List<BatchItemResult> items,
            List<ErrorDetail> warnings
    ) {
        public static WriteResult accepted(int count) {
            return new WriteResult(count, 0, List.of(), List.of());
        }

        public static WriteResult failed(String id, String code, String message, List<ErrorDetail> details) {
            return new WriteResult(
                    0,
                    1,
                    List.of(new BatchItemResult(id, false, code, message, details)),
                    List.of()
            );
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UModelElement(
            String id,
            String kind,
            String domain,
            String name,
            Map<String, Object> spec,
            Map<String, Object> metadata
    ) {
        public String stableId() {
            if (id != null && !id.isBlank()) {
                return id;
            }
            return nullToEmpty(kind) + ":" + nullToEmpty(domain) + ":" + nullToEmpty(name);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UModelElementBatch(
            String workspace,
            List<UModelElement> elements,
            boolean partialSuccess,
            String idempotencyKey
    ) {
    }

    public record UModelSnapshot(
            String workspace,
            List<UModelElement> elements,
            long version
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UModelImportRequest(
            String path,
            List<UModelElement> elements
    ) {
    }

    public record UModelImportResult(
            String workspace,
            String source,
            int imported,
            int skipped,
            List<UModelElement> elements,
            List<ErrorDetail> errors
    ) {
    }

    public record SampleImportResult(
            String workspace,
            String sample,
            UModelImportResult umodel,
            WriteResult entities,
            WriteResult relations,
            int entityCount,
            int relationCount
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EntityWriteBatch(
            String workspace,
            String idempotencyKey,
            boolean partialSuccess,
            List<Map<String, Object>> entities
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RelationWriteBatch(
            String workspace,
            String idempotencyKey,
            boolean partialSuccess,
            List<Map<String, Object>> relations
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ExpireRequest(
            String workspace,
            List<String> ids
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record QueryRequest(
            String query,
            Map<String, Object> parameters,
            Integer limit,
            @JsonProperty("timeout_ms")
            Integer timeoutMs,
            @JsonProperty("time_range")
            Object timeRange,
            String format,
            String mode,
            @JsonProperty("include_spec")
            Boolean includeSpec
    ) {
        public QueryRequest(
                String query,
                Map<String, Object> parameters,
                Integer limit,
                Integer timeoutMs,
                Object timeRange,
                String format
        ) {
            this(query, parameters, limit, timeoutMs, timeRange, format, null, null);
        }

        public boolean includeSpecEnabled() {
            return Boolean.TRUE.equals(includeSpec);
        }
    }

    public record QueryPlan(
            String workspace,
            String source,
            String query,
            Map<String, Object> filters,
            List<String> project,
            String sortField,
            int limit,
            String graphCall,
            EntityCallPlan entityCall,
            String format,
            boolean includeSpec,
            String mode,
            Integer topK
    ) {
    }

    public record QueryResult(
            List<Map<String, Object>> rows,
            List<String> columns,
            QueryPage page,
            QueryExplain explain
    ) {
    }

    public record QueryPage(
            Integer limit,
            String pageToken
    ) {
    }

    public record QueryExecuteResponse(
            String code,
            QueryExecuteData data,
            String message,
            boolean success
    ) {
    }

    public record QueryExecuteData(
            List<List<Object>> data,
            List<String> header,
            @JsonProperty("responseStatus")
            QueryResponseStatus responseStatus
    ) {
    }

    public record QueryResponseStatus(
            String result,
            @JsonProperty("retryPolicy")
            String retryPolicy,
            String level,
            @JsonProperty("statusItem")
            List<Object> statusItem
    ) {
    }

    public record QueryExplain(
            String source,
            String provider,
            String storageProvider,
            List<String> pushdown,
            List<String> fallback,
            List<String> operators,
            Integer depth,
            Map<String, Object> filters,
            Integer limit,
            Integer timeoutMs,
            Boolean timeRangeApplied,
            String searchMode,
            String searchProvider,
            String embedModel,
            String cypherDialect,
            String cypherEngine,
            EntityCallPlan entityCall
    ) {
        public QueryExplain(
                String source,
                String provider,
                String storageProvider,
                List<String> pushdown,
                List<String> fallback,
                List<String> operators,
                Integer depth,
                Map<String, Object> filters,
                Integer limit,
                Integer timeoutMs,
                Boolean timeRangeApplied,
                String searchMode,
                String searchProvider,
                String embedModel
        ) {
            this(
                    source,
                    provider,
                    storageProvider,
                    pushdown,
                    fallback,
                    operators,
                    depth,
                    filters,
                    limit,
                    timeoutMs,
                    timeRangeApplied,
                    searchMode,
                    searchProvider,
                    embedModel,
                    null,
                    null,
                    null
            );
        }
    }

    public record SearchRequest(
            String workspace,
            String source,
            String domain,
            List<String> kinds,
            List<String> names,
            String query,
            String embedModel,
            Integer topK,
            String origin,
            Map<String, Object> filters,
            Integer hybridK,
            Map<String, Double> weights
    ) {
    }

    public record SearchResult(
            List<SearchRow> rows
    ) {
    }

    public record SearchRow(
            @JsonProperty("__type__")
            String type,
            @JsonProperty("__domain__")
            String domain,
            String kind,
            String name,
            Map<String, Object> metadata,
            Map<String, Object> spec,
            @JsonProperty("__score__")
            double score,
            @JsonProperty("__provider__")
            String provider,
            @JsonProperty("__embedding_model__")
            String embedModel
    ) {
        public Map<String, Object> asMap() {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("__score__", score);
            if (type != null && !type.isBlank()) {
                out.put("__type__", type);
            }
            if (domain != null && !domain.isBlank()) {
                out.put("__domain__", domain);
            }
            if (kind != null && !kind.isBlank()) {
                out.put("kind", kind);
            }
            if (name != null && !name.isBlank()) {
                out.put("name", name);
            }
            if (metadata != null && !metadata.isEmpty()) {
                out.put("metadata", metadata);
            }
            if (spec != null && !spec.isEmpty()) {
                out.put("spec", spec);
            }
            if (provider != null && !provider.isBlank()) {
                out.put("__provider__", provider);
            }
            if (embedModel != null && !embedModel.isBlank()) {
                out.put("__embedding_model__", embedModel);
            }
            return out;
        }
    }

    public record SearchCapabilities(
            boolean vectorSearch,
            boolean hybridSearch,
            boolean filteredVectorSearch,
            boolean rrf,
            boolean chunkChasing,
            String embedderType,
            Integer maxDim
    ) {
    }

    public record SearchHealth(
            String provider,
            String status,
            String message
    ) {
    }

    public record TelemetryDataRequest(
            String workspace,
            String operation,
            Map<String, Object> plan,
            Integer limit
    ) {
    }

    public record TelemetryDataResult(
            List<Map<String, Object>> rows,
            List<String> columns,
            Map<String, Object> metadata
    ) {
    }

    public record TelemetryCapabilities(
            String provider,
            boolean metrics,
            boolean logs,
            boolean events,
            boolean traces
    ) {
    }

    public record TelemetryHealth(
            String provider,
            String status,
            String message
    ) {
    }

    public record CompatibilityGate(
            String name,
            String status,
            String scope,
            String evidence
    ) {
    }

    public record CompatibilityReport(
            String implementation,
            String status,
            List<CompatibilityGate> gates
    ) {
    }

    public record EntityCallParam(
            String key,
            String type,
            @JsonProperty("display_name")
            String displayName,
            String description,
            boolean required,
            @JsonProperty("default")
            Object defaultValue
    ) {
    }

    public record EntityCallPlan(
            String name,
            List<Object> arguments,
            @JsonProperty("named_arguments")
            Map<String, Object> namedArguments,
            Map<String, Object> parameters,
            List<EntityCallParam> signature
    ) {
    }

    public record GraphStoreCapabilities(
            String provider,
            boolean topology,
            boolean cypher
    ) {
    }

    public record GraphStoreHealth(
            String provider,
            String status,
            String message
    ) {
    }

    public record AgentTool(
            String name,
            String description,
            boolean enabled,
            boolean requiresExplicitWriteEnable,
            Object inputSchema,
            Object outputSchema
    ) {
    }

    public record AgentResource(
            String name,
            String uri,
            String kind,
            String description,
            String mimeType,
            boolean readOnly
    ) {
    }

    public record AgentQueryAction(
            String method,
            String path,
            QueryRequest body
    ) {
    }

    public record AgentNextAction(
            String id,
            String title,
            String description,
            String tool,
            AgentQueryAction queryApi
    ) {
    }

    public record AgentDiscovery(
            String workspace,
            List<AgentTool> tools,
            List<AgentResource> resources,
            List<AgentNextAction> nextActions
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AgentToolCallRequest(
            String name,
            Map<String, Object> arguments
    ) {
    }

    public record AgentToolCallResult(
            String name,
            boolean ok,
            Object output
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AgentResourceReadRequest(
            String uri
    ) {
    }

    public record AgentResourceReadResult(
            String uri,
            String mimeType,
            Object content
    ) {
    }

    public static boolean isAgentPlanResult(QueryResult result) {
        return result != null
                && result.columns() != null
                && result.columns().size() == 1
                && AGENT_PLAN_RESULT_COLUMN.equals(result.columns().get(0));
    }

    public static Map<String, Object> agentPlanPayload(QueryResult result) {
        if (!isAgentPlanResult(result) || result.rows() == null || result.rows().isEmpty()) {
            return null;
        }
        Object payload = result.rows().get(0).get(AGENT_PLAN_RESULT_COLUMN);
        if (!(payload instanceof Map<?, ?> map)) {
            return null;
        }
        Map<String, Object> copy = new java.util.LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            copy.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return copy;
    }

    public static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
