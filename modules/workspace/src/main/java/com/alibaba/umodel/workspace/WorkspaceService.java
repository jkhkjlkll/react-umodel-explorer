package com.alibaba.umodel.workspace;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.Page;
import com.alibaba.umodel.contract.UModelModels.UpdateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WorkspacePaths;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class WorkspaceService {
    private final Map<String, WorkspaceMetadata> workspaces = new ConcurrentHashMap<>();

    public WorkspaceMetadata createWorkspace(CreateWorkspaceRequest request) {
        String id = requireWorkspaceId(request == null ? null : request.id());
        Instant now = Instant.now();
        WorkspaceMetadata metadata = new WorkspaceMetadata(
                id,
                blankToDefault(request == null ? null : request.name(), id),
                request == null ? null : request.description(),
                "active",
                copyMap(request == null ? null : request.labels()),
                copyMap(request == null ? null : request.config()),
                paths(id),
                1,
                now,
                now,
                null
        );
        WorkspaceMetadata previous = workspaces.putIfAbsent(id, metadata);
        if (previous != null && previous.deletedAt() == null) {
            throw new UModelException(ErrorCodes.ALREADY_EXISTS, "workspace already exists");
        }
        return metadata;
    }

    public WorkspaceMetadata getWorkspace(String id) {
        WorkspaceMetadata metadata = workspaces.get(requireWorkspaceId(id));
        if (metadata == null || metadata.deletedAt() != null) {
            throw new UModelException(ErrorCodes.NOT_FOUND, "workspace not found");
        }
        return metadata;
    }

    public Page<WorkspaceMetadata> listWorkspaces(boolean includeDeleted) {
        return new Page<>(
                workspaces.values().stream()
                        .filter(workspace -> includeDeleted || workspace.deletedAt() == null)
                        .sorted((left, right) -> left.id().compareTo(right.id()))
                        .toList(),
                null
        );
    }

    public WorkspaceMetadata updateWorkspace(String id, UpdateWorkspaceRequest request) {
        if (request == null) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace update request is required");
        }
        WorkspaceMetadata existing = getWorkspace(id);
        Instant now = Instant.now();
        WorkspaceMetadata updated = new WorkspaceMetadata(
                existing.id(),
                request.name() == null ? existing.name() : request.name(),
                request.description() == null ? existing.description() : request.description(),
                existing.status(),
                request.labels() == null ? existing.labels() : copyMap(request.labels()),
                request.config() == null ? existing.config() : copyMap(request.config()),
                existing.paths(),
                existing.resourceVersion() + 1,
                existing.createdAt(),
                now,
                existing.deletedAt()
        );
        workspaces.put(existing.id(), updated);
        return updated;
    }

    public WorkspaceMetadata deleteWorkspace(String id) {
        WorkspaceMetadata existing = getWorkspace(id);
        Instant now = Instant.now();
        WorkspaceMetadata deleted = new WorkspaceMetadata(
                existing.id(),
                existing.name(),
                existing.description(),
                "deleted",
                existing.labels(),
                existing.config(),
                existing.paths(),
                existing.resourceVersion() + 1,
                existing.createdAt(),
                now,
                now
        );
        workspaces.put(existing.id(), deleted);
        return deleted;
    }

    private static String requireWorkspaceId(String id) {
        if (id == null || id.isBlank()) {
            throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "workspace id is required");
        }
        return id;
    }

    private static String blankToDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private static Map<String, Object> copyMap(Map<String, Object> source) {
        return source == null ? Map.of() : new LinkedHashMap<>(source);
    }

    private static WorkspacePaths paths(String workspace) {
        return new WorkspacePaths("data/workspaces/" + workspace, "data/workspaces/" + workspace + "/tmp");
    }
}
