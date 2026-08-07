package com.alibaba.umodel.sdk.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = false)
public abstract class BaseUModelObject implements UModelObject {
    @JsonProperty("kind")
    private String kind;
    @JsonProperty("schema")
    private Map<String, Object> schema = new LinkedHashMap<>();
    @JsonProperty("metadata")
    private Map<String, Object> metadata = new LinkedHashMap<>();
    @JsonProperty("spec")
    private Map<String, Object> spec = new LinkedHashMap<>();
    @JsonIgnore
    private final Map<String, Object> additionalProperties = new LinkedHashMap<>();
    @JsonIgnore
    private final String expectedKind;

    protected BaseUModelObject(String expectedKind) {
        this.expectedKind = expectedKind;
        this.kind = expectedKind;
    }

    @JsonIgnore
    public String expectedKind() {
        return expectedKind;
    }

    @Override
    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    @Override
    public Map<String, Object> getSchema() {
        return schema;
    }

    public void setSchema(Map<String, Object> schema) {
        this.schema = copy(schema);
    }

    @Override
    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = copy(metadata);
    }

    @Override
    public Map<String, Object> getSpec() {
        return spec;
    }

    public void setSpec(Map<String, Object> spec) {
        this.spec = copy(spec);
    }

    @JsonAnySetter
    public void putAdditionalProperty(String name, Object value) {
        additionalProperties.put(name, value);
    }

    @JsonAnyGetter
    public Map<String, Object> additionalProperties() {
        return additionalProperties;
    }

    @Override
    public List<ValidationError> validate() {
        List<ValidationError> errors = new ArrayList<>();
        required(errors, "kind", kind);
        if (kind != null && !kind.isBlank() && !expectedKind().equals(kind)) {
            errors.add(new ValidationError("kind", "expected " + expectedKind() + " but got " + kind));
        }
        required(errors, "schema.version", schema.get("version"));
        required(errors, "metadata.domain", metadata.get("domain"));
        required(errors, "metadata.name", metadata.get("name"));
        return errors;
    }

    protected static void required(List<ValidationError> errors, String path, Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            errors.add(new ValidationError(path, "required field is missing"));
        }
    }

    private static Map<String, Object> copy(Map<String, Object> value) {
        return value == null ? new LinkedHashMap<>() : new LinkedHashMap<>(value);
    }
}
