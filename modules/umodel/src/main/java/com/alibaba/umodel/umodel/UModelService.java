package com.alibaba.umodel.umodel;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.ErrorDetail;
import com.alibaba.umodel.contract.UModelModels.UModelElement;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UModelImportResult;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.graphstore.GraphStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

public class UModelService {
    private static final Set<String> SUPPORTED_IMPORT_EXTENSIONS = Set.of(".json", ".yaml", ".yml");
    private static final Set<String> LINK_KINDS = Set.of(
            "entity_set_link",
            "entity_source_link",
            "runbook_link",
            "storage_link",
            "data_link"
    );

    private final GraphStore graphStore;
    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());

    public UModelService(GraphStore graphStore) {
        this.graphStore = graphStore;
    }

    public ValidationResult validate(String workspace, List<UModelElement> elements) {
        List<ErrorDetail> errors = new ArrayList<>();
        List<UModelElement> safeElements = elements == null ? List.of() : elements;
        for (int i = 0; i < safeElements.size(); i++) {
            UModelElement element = safeElements.get(i);
            if (element == null) {
                errors.add(new ErrorDetail("elements[" + i + "]", "umodel element is required"));
                continue;
            }
            if (element.kind() == null || element.kind().isBlank()
                    || element.domain() == null || element.domain().isBlank()
                    || element.name() == null || element.name().isBlank()) {
                errors.add(new ErrorDetail(
                        "elements[" + i + "].kind/domain/name",
                        "umodel element kind, domain, and name are required"
                ));
            }
            Map<String, Object> spec = element.spec() == null ? Map.of() : element.spec();
            if ("entity_set".equals(element.kind())) {
                Object fields = spec.get("fields");
                boolean hasListFields = fields instanceof List<?> list && !list.isEmpty();
                boolean hasMapFields = fields instanceof Map<?, ?> map && !map.isEmpty();
                if (!hasListFields && !hasMapFields) {
                    errors.add(new ErrorDetail("elements[" + i + "].spec.fields", "entity_set spec.fields is required"));
                }
            }
            if (LINK_KINDS.contains(element.kind())) {
                boolean hasGoStyleEndpoints = spec.containsKey("src") && spec.containsKey("dest");
                boolean hasCompactEndpoints = spec.containsKey("source") && spec.containsKey("target");
                if (!hasGoStyleEndpoints && !hasCompactEndpoints) {
                    errors.add(new ErrorDetail(
                            "elements[" + i + "].spec.src/dest",
                            "link spec requires src/dest or source/target"
                    ));
                }
            }
        }
        return new ValidationResult(errors.isEmpty(), errors, List.of());
    }

    public WriteResult putElements(String workspace, UModelElementBatch batch) {
        String targetWorkspace = requireWorkspace(workspace);
        List<UModelElement> elements = batch == null || batch.elements() == null ? List.of() : batch.elements();
        ValidationResult validation = validate(targetWorkspace, elements);
        if (!validation.valid()) {
            ErrorDetail first = validation.errors().get(0);
            throw new UModelException(
                    ErrorCodes.VALIDATION_FAILED,
                    "umodel validation failed",
                    Map.of("field", first.field(), "reason", first.reason())
            );
        }
        return graphStore.putUModelElements(new UModelElementBatch(
                targetWorkspace,
                elements,
                batch != null && batch.partialSuccess(),
                batch == null ? null : batch.idempotencyKey()
        ));
    }

    public UModelImportResult importElements(String workspace, UModelImportRequest request) {
        String targetWorkspace = requireWorkspace(workspace);
        List<UModelElement> elements = request == null || request.elements() == null
                ? importPath(request == null ? null : request.path())
                : request.elements();
        WriteResult result = putElements(targetWorkspace, new UModelElementBatch(targetWorkspace, elements, false, null));
        return new UModelImportResult(targetWorkspace, request == null ? null : request.path(), result.accepted(), 0, elements, List.of());
    }

    public WriteResult deleteElements(String workspace, List<String> ids) {
        String targetWorkspace = requireWorkspace(workspace);
        List<String> safeIds = ids == null ? List.of() : ids;
        return graphStore.deleteUModelElements(targetWorkspace, safeIds);
    }

    private List<UModelElement> importPath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "umodel import path or elements are required");
        }
        Path path = Path.of(rawPath).normalize();
        if (!Files.exists(path)) {
            throw new UModelException(ErrorCodes.NOT_FOUND, "umodel import path not found");
        }
        List<UModelElement> elements = new ArrayList<>();
        try {
            if (Files.isDirectory(path)) {
                try (Stream<Path> stream = Files.walk(path)) {
                    List<Path> files = stream
                            .filter(Files::isRegularFile)
                            .filter(UModelService::isSupportedImportFile)
                            .sorted()
                            .toList();
                    for (Path file : files) {
                        elements.addAll(readElements(file));
                    }
                }
            } else if (isSupportedImportFile(path)) {
                elements.addAll(readElements(path));
            } else {
                throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "umodel import path must be YAML or JSON");
            }
        } catch (IOException e) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "failed to read umodel import path");
        }
        if (elements.isEmpty()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "no UModel elements found in import path");
        }
        return elements;
    }

    private List<UModelElement> readElements(Path file) throws IOException {
        Object value = mapperFor(file).readValue(file.toFile(), Object.class);
        List<UModelElement> elements = new ArrayList<>();
        collectElements(value, elements);
        return elements;
    }

    @SuppressWarnings("unchecked")
    private void collectElements(Object value, List<UModelElement> elements) {
        if (value instanceof List<?> list) {
            for (Object item : list) {
                collectElements(item, elements);
            }
            return;
        }
        if (!(value instanceof Map<?, ?> rawMap)) {
            return;
        }
        Map<String, Object> map = new LinkedHashMap<>((Map<String, Object>) rawMap);
        Object nestedElements = map.get("elements");
        if (nestedElements != null) {
            collectElements(nestedElements, elements);
            return;
        }
        if (map.get("kind") == null) {
            return;
        }
        elements.add(toElement(map));
    }

    private UModelElement toElement(Map<String, Object> map) {
        Map<String, Object> metadata = asMap(map.get("metadata"));
        Map<String, Object> normalizedMetadata = new LinkedHashMap<>(metadata);
        if (map.get("schema") != null) {
            normalizedMetadata.putIfAbsent("schema", map.get("schema"));
        }
        return new UModelElement(
                stringValue(firstNonNull(map.get("id"), metadata.get("id"))),
                stringValue(map.get("kind")),
                stringValue(firstNonNull(map.get("domain"), metadata.get("domain"))),
                stringValue(firstNonNull(map.get("name"), metadata.get("name"))),
                asMap(map.get("spec")),
                normalizedMetadata
        );
    }

    private ObjectMapper mapperFor(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        return name.endsWith(".json") ? jsonMapper : yamlMapper;
    }

    private static boolean isSupportedImportFile(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return SUPPORTED_IMPORT_EXTENSIONS.stream().anyMatch(name::endsWith);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : Map.of();
    }

    private static Object firstNonNull(Object first, Object second) {
        return first == null ? second : first;
    }

    private static String stringValue(Object value) {
        return value == null ? null : Objects.toString(value, null);
    }

    private static String requireWorkspace(String workspace) {
        if (workspace == null || workspace.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace is required");
        }
        return workspace;
    }
}
