package com.alibaba.umodel.contract;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public final class UModelModels {
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
            Integer timeoutMs,
            Object timeRange,
            String format
    ) {
    }

    public record QueryPlan(
            String workspace,
            String source,
            Map<String, Object> filters,
            List<String> project,
            String sortField,
            int limit,
            String graphCall
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
            String embedModel
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

    public static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
