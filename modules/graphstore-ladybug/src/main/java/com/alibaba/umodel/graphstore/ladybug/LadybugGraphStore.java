package com.alibaba.umodel.graphstore.ladybug;

import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.GraphStoreCapabilities;
import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.contract.UModelModels.QueryPlan;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelSnapshot;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.graphstore.GraphStore;

import java.util.List;

public class LadybugGraphStore implements GraphStore {
    @Override
    public void openWorkspace(WorkspaceMetadata workspace) {
    }

    @Override
    public WriteResult putUModelElements(UModelElementBatch batch) {
        throw unavailable();
    }

    @Override
    public WriteResult deleteUModelElements(String workspace, List<String> ids) {
        throw unavailable();
    }

    @Override
    public UModelSnapshot getUModelSnapshot(String workspace) {
        throw unavailable();
    }

    @Override
    public WriteResult writeEntities(EntityWriteBatch batch) {
        throw unavailable();
    }

    @Override
    public WriteResult writeRelations(RelationWriteBatch batch) {
        throw unavailable();
    }

    @Override
    public QueryResult queryEntities(QueryPlan plan) {
        throw unavailable();
    }

    @Override
    public QueryResult queryTopo(QueryPlan plan) {
        throw unavailable();
    }

    @Override
    public GraphStoreCapabilities capabilities() {
        return new GraphStoreCapabilities("local.ladybug", true, true);
    }

    @Override
    public GraphStoreHealth health() {
        return new GraphStoreHealth(
                "local.ladybug",
                "unavailable",
                "Java local.ladybug provider is a compatibility stub; add a Ladybug Java runtime adapter to enable it"
        );
    }

    private static UModelException unavailable() {
        return new UModelException(
                ErrorCodes.PROVIDER_UNAVAILABLE,
                "local.ladybug provider is unavailable in the Java backend until a Ladybug Java adapter is configured"
        );
    }
}
