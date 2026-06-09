package com.alibaba.umodel.graphstore;

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

import java.util.List;

public interface GraphStore {
    void openWorkspace(WorkspaceMetadata workspace);

    WriteResult putUModelElements(UModelElementBatch batch);

    WriteResult deleteUModelElements(String workspace, List<String> ids);

    UModelSnapshot getUModelSnapshot(String workspace);

    WriteResult writeEntities(EntityWriteBatch batch);

    WriteResult writeRelations(RelationWriteBatch batch);

    QueryResult queryEntities(QueryPlan plan);

    QueryResult queryTopo(QueryPlan plan);

    GraphStoreCapabilities capabilities();

    GraphStoreHealth health();
}
