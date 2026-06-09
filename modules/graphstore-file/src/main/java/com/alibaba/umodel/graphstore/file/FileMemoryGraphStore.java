package com.alibaba.umodel.graphstore.file;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;

public class FileMemoryGraphStore extends MemoryGraphStore {
    private static final String SNAPSHOT_FILE = "graphstore-file-memory.json";

    private final Path dataRoot;
    private final Path snapshotPath;
    private final ObjectMapper objectMapper;

    public FileMemoryGraphStore(Path dataRoot) {
        this.dataRoot = dataRoot;
        this.snapshotPath = dataRoot.resolve(SNAPSHOT_FILE);
        this.objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .enable(SerializationFeature.INDENT_OUTPUT)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        load();
    }

    @Override
    public WriteResult putUModelElements(UModelElementBatch batch) {
        return super.putUModelElements(batch);
    }

    @Override
    public WriteResult deleteUModelElements(String workspace, List<String> ids) {
        return super.deleteUModelElements(workspace, ids);
    }

    @Override
    public WriteResult writeEntities(EntityWriteBatch batch) {
        return super.writeEntities(batch);
    }

    @Override
    public WriteResult writeRelations(RelationWriteBatch batch) {
        return super.writeRelations(batch);
    }

    @Override
    public GraphStoreHealth health() {
        return new GraphStoreHealth(providerName(), "ok", "file.memory graphstore snapshot=" + snapshotPath);
    }

    @Override
    protected String providerName() {
        return "file.memory";
    }

    @Override
    protected synchronized void afterWorkspaceChanged(String workspace) {
        persist();
    }

    private synchronized void load() {
        if (!Files.exists(snapshotPath)) {
            return;
        }
        try {
            PersistedSnapshot snapshot = objectMapper.readValue(snapshotPath.toFile(), PersistedSnapshot.class);
            loadSnapshots(snapshot == null ? List.of() : snapshot.workspaces());
        } catch (IOException e) {
            throw new UModelException(ErrorCodes.PROVIDER_UNAVAILABLE, "failed to load file.memory snapshot");
        }
    }

    private synchronized void persist() {
        try {
            Files.createDirectories(dataRoot);
            Path tmp = dataRoot.resolve(SNAPSHOT_FILE + ".tmp");
            objectMapper.writeValue(tmp.toFile(), new PersistedSnapshot(snapshots()));
            try {
                Files.move(tmp, snapshotPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicMoveFailure) {
                Files.move(tmp, snapshotPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new UModelException(ErrorCodes.PROVIDER_UNAVAILABLE, "failed to persist file.memory snapshot");
        }
    }

    private record PersistedSnapshot(List<WorkspaceSnapshot> workspaces) {
    }
}
