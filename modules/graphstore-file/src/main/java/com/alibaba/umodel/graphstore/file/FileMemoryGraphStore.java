package com.alibaba.umodel.graphstore.file;

import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;

import java.nio.file.Path;

public class FileMemoryGraphStore extends MemoryGraphStore {
    private final Path dataRoot;

    public FileMemoryGraphStore(Path dataRoot) {
        this.dataRoot = dataRoot;
    }

    @Override
    public GraphStoreHealth health() {
        return new GraphStoreHealth(providerName(), "ok", "file.memory graphstore path=" + dataRoot);
    }

    @Override
    protected String providerName() {
        return "file.memory";
    }
}

