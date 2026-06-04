# 内网移植说明

这个目录是 UModel Explorer 的独立 React/Vite 项目，默认使用内置 mock 数据源，不依赖外部后端即可启动几百节点大图。

## 本地启动

```bash
pnpm install --no-frozen-lockfile
pnpm dev -- --port 5181 --strictPort
```

打开：

```text
http://localhost:5181/
```

默认参数：

- `dataSource=mock`
- `workspace=demo`
- mock 图数据包含几百个节点类元素和几百条关系连线

## 切真实接口

同源部署时：

```text
http://localhost:5181/?dataSource=api&workspace=demo
```

跨域或独立 API 域名时：

```text
http://localhost:5181/?dataSource=api&apiBase=http://your-intranet-api.example.com&workspace=demo
```

开发代理：

```bash
UMODEL_API_TARGET=http://your-intranet-api.example.com pnpm dev -- --port 5181 --strictPort
```

## 接口预留位置

页面只依赖 `src/api/client.ts` 里的 `UModelApiClient` 接口：

```ts
export interface UModelApiClient {
  health(): Promise<HealthResponse>
  getWorkspace(workspace: string): Promise<WorkspaceMetadata>
  listUModel(workspace: string, limit?: number): Promise<QueryResult>
  importSampleData(workspace: string, sample?: string): Promise<SampleImportResult>
  validateUModel(workspace: string, elements: UModelElement[]): Promise<ValidationResult>
  putUModel(workspace: string, elements: UModelElement[]): Promise<WriteResult>
  deleteUModel(workspace: string, ids: string[]): Promise<WriteResult>
}
```

已有两个实现：

- `src/api/mockClient.ts`: 本地 mock，默认启用。
- `src/api/client.ts`: 真实 HTTP API，按 `docs/API.md` 调用后端。

入口选择逻辑在 `src/StandaloneExplorerApp.tsx`：

```ts
dataSource === 'mock' ? new MockUModelApi(360) : new UModelApi(apiBase)
```

## 需要保留的原版实现

下面这些文件是原版 Explorer 的核心逻辑，已经直接复制，不建议在内网移植时重写：

- `src/features/umodel/UModelPage.tsx`
- `src/features/umodel/UModelGraphView.tsx`
- `src/features/umodel/graphModel.ts`
- `src/features/umodel/model.ts`
- `src/features/umodel/umodel.css`

图形连线由 React Flow、Graphviz 布局和这些原版组件共同控制。

## 打包部署

构建：

```bash
pnpm build
```

部署 `dist/` 到内网静态资源服务器即可。真实 API 可以使用同源 `/api`，也可以通过 URL `apiBase` 指到内网 API 服务。
