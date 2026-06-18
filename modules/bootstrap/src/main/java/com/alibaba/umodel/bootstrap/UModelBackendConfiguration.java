package com.alibaba.umodel.bootstrap;

import com.alibaba.umodel.agentgateway.AgentGatewayService;
import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.graphstore.GraphStore;
import com.alibaba.umodel.graphstore.file.FileMemoryGraphStore;
import com.alibaba.umodel.graphstore.ladybug.LadybugGraphStore;
import com.alibaba.umodel.graphstore.memory.MemoryGraphStore;
import com.alibaba.umodel.query.QueryService;
import com.alibaba.umodel.sampledata.SampleDataService;
import com.alibaba.umodel.umodel.UModelService;
import com.alibaba.umodel.workspace.WorkspaceService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

@Configuration
public class UModelBackendConfiguration {
    @Bean
    public GraphStore graphStore(
            @Value("${umodel.graphstore:memory}") String provider,
            @Value("${umodel.data-root:data}") String dataRoot
    ) {
        return switch (provider == null ? "memory" : provider) {
            case "memory" -> new MemoryGraphStore();
            case "file.memory" -> new FileMemoryGraphStore(Path.of(dataRoot));
            case "local.ladybug" -> new LadybugGraphStore();
            default -> throw new UModelException(ErrorCodes.INVALID_ARGUMENT, "unknown graphstore provider: " + provider);
        };
    }

    @Bean
    public WorkspaceService workspaceService() {
        return new WorkspaceService();
    }

    @Bean
    public UModelService uModelService(GraphStore graphStore) {
        return new UModelService(graphStore);
    }

    @Bean
    public EntityStoreService entityStoreService(GraphStore graphStore) {
        return new EntityStoreService(graphStore);
    }

    @Bean
    public QueryService queryService(GraphStore graphStore) {
        return new QueryService(graphStore);
    }

    @Bean
    public AgentGatewayService agentGatewayService(
            QueryService queryService,
            UModelService uModelService,
            EntityStoreService entityStoreService,
            @Value("${umodel.agent.write-enabled:false}") boolean writeEnabled
    ) {
        return new AgentGatewayService(queryService, uModelService, entityStoreService, writeEnabled);
    }

    @Bean
    public SampleDataService sampleDataService(UModelService uModelService, EntityStoreService entityStoreService) {
        return new SampleDataService(uModelService, entityStoreService);
    }
}
