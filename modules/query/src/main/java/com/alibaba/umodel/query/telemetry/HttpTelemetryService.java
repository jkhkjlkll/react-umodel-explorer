package com.alibaba.umodel.query.telemetry;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.TelemetryCapabilities;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataRequest;
import com.alibaba.umodel.contract.UModelModels.TelemetryDataResult;
import com.alibaba.umodel.contract.UModelModels.TelemetryHealth;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class HttpTelemetryService implements TelemetryService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final HttpClient httpClient;
    private final Duration timeout;

    public HttpTelemetryService() {
        this(Duration.ofSeconds(15));
    }

    public HttpTelemetryService(Duration timeout) {
        this.timeout = timeout;
        this.httpClient = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    @Override
    public TelemetryDataResult execute(TelemetryDataRequest request) {
        Map<String, Object> plan = safeMap(request == null ? null : request.plan());
        String operation = stringValue(request == null ? null : request.operation());
        if ("get_metrics".equals(operation)) {
            return executeMetrics(request, plan);
        }
        if ("get_logs".equals(operation)) {
            return executeLogs(request, plan);
        }
        throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unsupported telemetry operation: " + operation);
    }

    @Override
    public TelemetryCapabilities capabilities() {
        return new TelemetryCapabilities("http", true, true, false, false);
    }

    @Override
    public TelemetryHealth health() {
        return new TelemetryHealth("http", "ok", "HTTP telemetry provider is configured");
    }

    private TelemetryDataResult executeMetrics(TelemetryDataRequest request, Map<String, Object> plan) {
        Map<String, Object> query = safeMap(plan.get("query"));
        String endpoint = required(query, "endpoint");
        String apiPrefix = firstNonEmpty(stringValue(query.get("api_prefix")), "/api/v1");
        List<Map<String, Object>> queryItems = listOfMaps(query.get("queries"));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> item : queryItems) {
            String promql = firstNonEmpty(stringValue(item.get("promql")), stringValue(item.get("generator")), stringValue(item.get("name")));
            String path = "instant".equalsIgnoreCase(stringValue(query.get("query_type"))) ? "/query" : "/query_range";
            Map<String, String> params = new LinkedHashMap<>();
            params.put("query", promql);
            if (!"instant".equalsIgnoreCase(stringValue(query.get("query_type")))) {
                if (!stringValue(query.get("step")).isBlank()) {
                    params.put("step", stringValue(query.get("step")));
                }
            }
            Map<String, Object> response = getJson(endpoint + apiPrefix + path + "?" + query(params), query);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("metric", item.get("name"));
            row.put("promql", promql);
            row.put("response", response);
            rows.add(row);
        }
        return new TelemetryDataResult(rows, rows.isEmpty() ? List.of() : List.of("metric", "promql", "response"), Map.<String, Object>of("provider", "http"));
    }

    private TelemetryDataResult executeLogs(TelemetryDataRequest request, Map<String, Object> plan) {
        Map<String, Object> query = safeMap(plan.get("query"));
        String endpoint = required(query, "endpoint");
        String index = required(query, "index");
        Map<String, Object> body = safeMap(query.get("body"));
        Map<String, Object> response = postJson(endpoint + "/" + index + "/_search", body, query);
        List<Map<String, Object>> rows = new ArrayList<>();
        Object hits = safeMap(response.get("hits")).get("hits");
        if (hits instanceof List<?> list) {
            for (Object item : list) {
                Map<String, Object> hit = safeMap(item);
                Object source = hit.get("_source");
                rows.add(source instanceof Map<?, ?> ? safeMap(source) : hit);
            }
        }
        if (rows.isEmpty()) {
            rows.add(Map.<String, Object>of("response", response));
        }
        return new TelemetryDataResult(rows, columns(rows), Map.<String, Object>of("provider", "http"));
    }

    private Map<String, Object> getJson(String uri, Map<String, Object> planQuery) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(uri)).timeout(timeout).GET();
        applyHeaders(builder, planQuery);
        return send(builder.build());
    }

    private Map<String, Object> postJson(String uri, Map<String, Object> body, Map<String, Object> planQuery) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(uri))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json(body)));
        applyHeaders(builder, planQuery);
        return send(builder.build());
    }

    private static void applyHeaders(HttpRequest.Builder builder, Map<String, Object> planQuery) {
        String tenantHeader = stringValue(planQuery.get("tenant_header"));
        String tenant = stringValue(planQuery.get("tenant"));
        if (!tenantHeader.isBlank() && !tenant.isBlank()) {
            builder.header(tenantHeader, tenant);
        }
    }

    private Map<String, Object> send(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new UModelException(ErrorCodes.PROVIDER_UNAVAILABLE, "telemetry provider returned HTTP " + response.statusCode());
            }
            return safeMap(JSON.readValue(response.body(), Object.class));
        } catch (IOException e) {
            throw new UModelException(ErrorCodes.PROVIDER_UNAVAILABLE, "failed to call telemetry provider: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UModelException(ErrorCodes.PROVIDER_UNAVAILABLE, "telemetry provider call interrupted");
        }
    }

    private static String query(Map<String, String> params) {
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (entry.getValue() == null || entry.getValue().isBlank()) {
                continue;
            }
            parts.add(url(entry.getKey()) + "=" + url(entry.getValue()));
        }
        return String.join("&", parts);
    }

    private static String url(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String required(Map<String, Object> map, String key) {
        String value = stringValue(map.get(key));
        if (value.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "telemetry plan query." + key + " is required");
        }
        return value;
    }

    private static List<String> columns(List<Map<String, Object>> rows) {
        return rows == null || rows.isEmpty() ? List.of() : new ArrayList<>(rows.get(0).keySet());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> safeMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            out.put(stringValue(entry.getKey()), entry.getValue());
        }
        return out;
    }

    private static List<Map<String, Object>> listOfMaps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            out.add(safeMap(item));
        }
        return out;
    }

    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "failed to encode telemetry request");
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
