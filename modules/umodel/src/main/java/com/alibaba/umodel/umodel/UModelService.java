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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class UModelService {
    private final GraphStore graphStore;

    public UModelService(GraphStore graphStore) {
        this.graphStore = graphStore;
    }

    public ValidationResult validate(String workspace, List<UModelElement> elements) {
        List<ErrorDetail> errors = new ArrayList<>();
        List<UModelElement> safeElements = elements == null ? List.of() : elements;
        for (int i = 0; i < safeElements.size(); i++) {
            UModelElement element = safeElements.get(i);
            if (element.kind() == null || element.kind().isBlank()
                    || element.domain() == null || element.domain().isBlank()
                    || element.name() == null || element.name().isBlank()) {
                errors.add(new ErrorDetail(
                        "elements[" + i + "].kind/domain/name",
                        "umodel element kind, domain, and name are required"
                ));
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
        List<UModelElement> elements = request == null || request.elements() == null ? List.of() : request.elements();
        WriteResult result = putElements(workspace, new UModelElementBatch(workspace, elements, false, null));
        return new UModelImportResult(workspace, request == null ? null : request.path(), result.accepted(), 0, elements, List.of());
    }

    public WriteResult deleteElements(String workspace, List<String> ids) {
        String targetWorkspace = requireWorkspace(workspace);
        List<String> safeIds = ids == null ? List.of() : ids;
        return new WriteResult(
                0,
                safeIds.size(),
                safeIds.stream()
                        .map(id -> new com.alibaba.umodel.contract.UModelModels.BatchItemResult(
                                id,
                                false,
                                ErrorCodes.NOT_IMPLEMENTED,
                                "delete dependency checks are not implemented in the Java subset",
                                List.of()
                        ))
                        .toList(),
                List.of(new ErrorDetail("workspace", "delete not implemented for workspace " + targetWorkspace))
        );
    }

    private static String requireWorkspace(String workspace) {
        if (workspace == null || workspace.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace is required");
        }
        return workspace;
    }
}
