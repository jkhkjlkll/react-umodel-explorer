package com.alibaba.umodel.server;

import com.alibaba.umodel.agentgateway.AgentGatewayService;
import com.alibaba.umodel.contract.ErrorCodes;
import com.alibaba.umodel.contract.UModelException;
import com.alibaba.umodel.contract.UModelModels.AgentResourceReadRequest;
import com.alibaba.umodel.contract.UModelModels.AgentToolCallRequest;
import com.alibaba.umodel.contract.UModelModels.CreateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.EntityWriteBatch;
import com.alibaba.umodel.contract.UModelModels.ExpireRequest;
import com.alibaba.umodel.contract.UModelModels.GraphStoreHealth;
import com.alibaba.umodel.contract.UModelModels.QueryExecuteData;
import com.alibaba.umodel.contract.UModelModels.QueryExecuteResponse;
import com.alibaba.umodel.contract.UModelModels.QueryRequest;
import com.alibaba.umodel.contract.UModelModels.QueryResponseStatus;
import com.alibaba.umodel.contract.UModelModels.QueryResult;
import com.alibaba.umodel.contract.UModelModels.RelationWriteBatch;
import com.alibaba.umodel.contract.UModelModels.UModelElementBatch;
import com.alibaba.umodel.contract.UModelModels.UModelImportRequest;
import com.alibaba.umodel.contract.UModelModels.UpdateWorkspaceRequest;
import com.alibaba.umodel.contract.UModelModels.ValidationResult;
import com.alibaba.umodel.contract.UModelModels.WorkspaceMetadata;
import com.alibaba.umodel.contract.UModelModels.WriteResult;
import com.alibaba.umodel.entitystore.EntityStoreService;
import com.alibaba.umodel.graphstore.GraphStore;
import com.alibaba.umodel.query.QueryService;
import com.alibaba.umodel.sampledata.SampleDataService;
import com.alibaba.umodel.umodel.UModelService;
import com.alibaba.umodel.workspace.WorkspaceService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping
public class UModelApiController {
    private final WorkspaceService workspaceService;
    private final GraphStore graphStore;
    private final UModelService uModelService;
    private final EntityStoreService entityStoreService;
    private final QueryService queryService;
    private final AgentGatewayService agentGatewayService;
    private final SampleDataService sampleDataService;

    public UModelApiController(
            WorkspaceService workspaceService,
            GraphStore graphStore,
            UModelService uModelService,
            EntityStoreService entityStoreService,
            QueryService queryService,
            AgentGatewayService agentGatewayService,
            SampleDataService sampleDataService
    ) {
        this.workspaceService = workspaceService;
        this.graphStore = graphStore;
        this.uModelService = uModelService;
        this.entityStoreService = entityStoreService;
        this.queryService = queryService;
        this.agentGatewayService = agentGatewayService;
        this.sampleDataService = sampleDataService;
    }

    @GetMapping("/")
    public Map<String, Object> serviceIndex() {
        GraphStoreHealth health = graphStore.health();
        return Map.of(
                "service", "umodel-server-java",
                "status", "ok",
                "graphstore", health,
                "endpoints", Map.of(
                        "health", "/healthz",
                        "workspaces", "/api/v1/workspaces",
                        "samples", "/api/v1/samples/{workspace}/multi-domain-quickstart:import",
                        "query", "/api/v1/query/{workspace}/execute",
                        "queryExplain", "/api/v1/query/{workspace}/explain",
                        "agent", "/api/v1/agent/{workspace}/discover"
                )
        );
    }

    @GetMapping("/healthz")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "graphstore", graphStore.health());
    }

    @PostMapping("/api/v1/workspaces")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceMetadata createWorkspace(@RequestBody CreateWorkspaceRequest request) {
        WorkspaceMetadata metadata = workspaceService.createWorkspace(request);
        graphStore.openWorkspace(metadata);
        return metadata;
    }

    @GetMapping("/api/v1/workspaces")
    public Object listWorkspaces(@RequestParam(name = "include_deleted", defaultValue = "false") boolean includeDeleted) {
        return workspaceService.listWorkspaces(includeDeleted);
    }

    @GetMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata getWorkspace(@PathVariable String workspace) {
        return workspaceService.getWorkspace(workspace);
    }

    @PutMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata updateWorkspace(@PathVariable String workspace, @RequestBody UpdateWorkspaceRequest request) {
        return workspaceService.updateWorkspace(workspace, request);
    }

    @DeleteMapping("/api/v1/workspaces/{workspace}")
    public WorkspaceMetadata deleteWorkspace(@PathVariable String workspace) {
        return workspaceService.deleteWorkspace(workspace);
    }

    @PostMapping("/api/v1/umodel/{workspace}/validate")
    public ValidationResult validateUModel(@PathVariable String workspace, @RequestBody UModelElementBatch request) {
        return uModelService.validate(workspace, request == null ? List.of() : request.elements());
    }

    @PostMapping("/api/v1/umodel/{workspace}/import")
    public Object importUModel(@PathVariable String workspace, @RequestBody UModelImportRequest request) {
        return uModelService.importElements(workspace, request);
    }

    @PostMapping("/api/v1/umodel/{workspace}/elements")
    public WriteResult putUModelElements(@PathVariable String workspace, @RequestBody UModelElementBatch request) {
        return uModelService.putElements(workspace, request);
    }

    @DeleteMapping("/api/v1/umodel/{workspace}/elements")
    public WriteResult deleteUModelElements(@PathVariable String workspace, @RequestBody Map<String, List<String>> request) {
        return uModelService.deleteElements(workspace, request == null ? List.of() : request.get("ids"));
    }

    @PostMapping("/api/v1/entitystore/{workspace}/entities:write")
    public WriteResult writeEntities(@PathVariable String workspace, @RequestBody EntityWriteBatch request) {
        return entityStoreService.writeEntities(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/entities:expire")
    public WriteResult expireEntities(@PathVariable String workspace, @RequestBody ExpireRequest request) {
        return entityStoreService.expireEntities(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/relations:write")
    public WriteResult writeRelations(@PathVariable String workspace, @RequestBody RelationWriteBatch request) {
        return entityStoreService.writeRelations(workspace, request);
    }

    @PostMapping("/api/v1/entitystore/{workspace}/relations:expire")
    public WriteResult expireRelations(@PathVariable String workspace, @RequestBody ExpireRequest request) {
        return entityStoreService.expireRelations(workspace, request);
    }

    @PostMapping("/api/v1/samples/{workspace}/multi-domain-quickstart:import")
    public Object importQuickstart(@PathVariable String workspace) {
        ensureWorkspace(workspace);
        return sampleDataService.importSample(workspace, SampleDataService.MULTI_DOMAIN_QUICKSTART);
    }

    @PostMapping("/api/v1/query/{workspace}/execute")
    public QueryExecuteResponse executeQuery(@PathVariable String workspace, @RequestBody QueryRequest request) {
        return queryExecuteResponse(queryService.execute(workspace, request));
    }

    @PostMapping("/api/v1/query/{workspace}/explain")
    public Object explainQuery(@PathVariable String workspace, @RequestBody QueryRequest request) {
        return queryService.explain(workspace, request);
    }

    @GetMapping("/api/v1/agent/{workspace}/discover")
    public Object discoverAgent(@PathVariable String workspace) {
        return agentGatewayService.discover(workspace);
    }

    @PostMapping("/api/v1/agent/{workspace}/tools:execute")
    public Object executeAgentTool(@PathVariable String workspace, @RequestBody AgentToolCallRequest request) {
        return agentGatewayService.executeTool(workspace, request);
    }

    @PostMapping("/api/v1/agent/{workspace}/resources:read")
    public Object readAgentResource(@PathVariable String workspace, @RequestBody AgentResourceReadRequest request) {
        return agentGatewayService.readResource(workspace, request);
    }

    private void ensureWorkspace(String workspace) {
        try {
            workspaceService.getWorkspace(workspace);
        } catch (UModelException e) {
            if (!ErrorCodes.NOT_FOUND.equals(e.code())) {
                throw e;
            }
            createWorkspace(new CreateWorkspaceRequest(
                    workspace,
                    "Demo",
                    "Multi-domain quickstart demo",
                    Map.of("umodel.io/quickstart", "true"),
                    Map.of()
            ));
        }
    }

    private static QueryExecuteResponse queryExecuteResponse(QueryResult result) {
        List<String> header = queryMatrixHeader(result.columns(), result.rows());
        return new QueryExecuteResponse(
                "200",
                new QueryExecuteData(
                        queryRowsAsMatrix(header, result.rows()),
                        header,
                        new QueryResponseStatus("Success", "None", "Info", List.of())
                ),
                "successful",
                true
        );
    }

    private static List<String> queryMatrixHeader(List<String> columns, List<Map<String, Object>> rows) {
        List<String> header = new ArrayList<>(columns == null ? List.of() : columns);
        Map<String, Boolean> seen = new LinkedHashMap<>();
        for (String column : header) {
            seen.put(column, true);
        }
        for (Map<String, Object> row : rows == null ? List.<Map<String, Object>>of() : rows) {
            for (String key : row.keySet()) {
                if (!seen.containsKey(key)) {
                    seen.put(key, true);
                    header.add(key);
                }
            }
        }
        return header;
    }

    private static List<List<Object>> queryRowsAsMatrix(List<String> header, List<Map<String, Object>> rows) {
        List<List<Object>> matrix = new ArrayList<>();
        for (Map<String, Object> row : rows == null ? List.<Map<String, Object>>of() : rows) {
            List<Object> values = new ArrayList<>();
            for (String column : header) {
                values.add(row.get(column));
            }
            matrix.add(values);
        }
        return matrix;
    }
}

