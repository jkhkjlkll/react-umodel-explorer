package com.alibaba.umodel.sdk.model;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.util.List;

public final class UModelCodec {
    private final UModelTypeRegistry registry;
    private final ObjectMapper json;
    private final ObjectMapper yaml;

    public UModelCodec() {
        this(UModelTypeRegistry.standard());
    }

    public UModelCodec(UModelTypeRegistry registry) {
        this.registry = registry;
        this.json = new ObjectMapper();
        this.yaml = new ObjectMapper(new YAMLFactory());
    }

    public UModelObject parseJson(String content) {
        return parse(content, json, "JSON");
    }

    public UModelObject parseYaml(String content) {
        return parse(content, yaml, "YAML");
    }

    public <T extends UModelObject> T parseJson(String content, Class<T> type) {
        return parseTyped(content, type, json, "JSON");
    }

    public <T extends UModelObject> T parseYaml(String content, Class<T> type) {
        return parseTyped(content, type, yaml, "YAML");
    }

    public String toJson(UModelObject value) {
        return write(value, json, "JSON");
    }

    public String toYaml(UModelObject value) {
        return write(value, yaml, "YAML");
    }

    public UModelTypeRegistry registry() {
        return registry;
    }

    private UModelObject parse(String content, ObjectMapper mapper, String format) {
        try {
            JsonNode root = mapper.readTree(content);
            String kind = requiredText(root, "kind");
            JsonNode schema = root.get("schema");
            if (schema == null || !schema.isObject()) {
                throw missing("schema", "required object is missing");
            }
            String version = requiredText(schema, "version", "schema.version");
            Class<? extends UModelObject> type = registry.resolve(kind, version);
            if (type == null) {
                boolean knownKind = registry.knownTypes().stream().anyMatch(key -> key.startsWith(kind + ":"));
                UModelSdkException.Category category = knownKind
                        ? UModelSdkException.Category.UNSUPPORTED_VERSION
                        : UModelSdkException.Category.UNKNOWN_TYPE;
                throw new UModelSdkException(category, knownKind ? "schema.version" : "kind", "unsupported UModel type " + UModelTypeRegistry.key(kind, version));
            }
            UModelObject value = mapper.treeToValue(root, type);
            validate(value);
            return value;
        } catch (UModelSdkException error) {
            throw error;
        } catch (JsonProcessingException error) {
            throw new UModelSdkException(UModelSdkException.Category.PARSE_ERROR, "", "invalid " + format + ": " + error.getOriginalMessage(), error);
        }
    }

    private <T extends UModelObject> T parseTyped(String content, Class<T> type, ObjectMapper mapper, String format) {
        try {
            T value = mapper.readValue(content, type);
            validate(value);
            return value;
        } catch (UModelSdkException error) {
            throw error;
        } catch (JsonProcessingException error) {
            throw new UModelSdkException(UModelSdkException.Category.PARSE_ERROR, "", "invalid " + format + ": " + error.getOriginalMessage(), error);
        }
    }

    private static String write(UModelObject value, ObjectMapper mapper, String format) {
        validate(value);
        try {
            return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new UModelSdkException(UModelSdkException.Category.PARSE_ERROR, "", "cannot serialize " + format + ": " + error.getOriginalMessage(), error);
        }
    }

    private static void validate(UModelObject value) {
        if (value == null) {
            throw new UModelSdkException(UModelSdkException.Category.VALIDATION_ERROR, "", "UModel object is required");
        }
        List<ValidationError> errors = value.validate();
        if (!errors.isEmpty()) {
            ValidationError first = errors.get(0);
            UModelSdkException.Category category = first.message().contains("missing")
                    ? UModelSdkException.Category.MISSING_FIELD
                    : UModelSdkException.Category.VALIDATION_ERROR;
            throw new UModelSdkException(category, first.path(), first.message());
        }
    }

    private static String requiredText(JsonNode node, String field) {
        return requiredText(node, field, field);
    }

    private static String requiredText(JsonNode node, String field, String path) {
        JsonNode value = node == null ? null : node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw missing(path, "required text field is missing");
        }
        return value.asText();
    }

    private static UModelSdkException missing(String path, String message) {
        return new UModelSdkException(UModelSdkException.Category.MISSING_FIELD, path, message);
    }
}
