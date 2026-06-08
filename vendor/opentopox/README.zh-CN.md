# OpenTopoX 中文接入说明

OpenTopoX 是一个可复用的 DOM/SVG 拓扑图框架，适合在内网项目中替代 React Flow 这类图渲染库，用来展示资源拓扑、链路关系、告警传播、运行状态和大规模节点关系。

它不是 UModel 页面专用代码。UModel 只是当前项目里的一个业务接入示例，其他项目可以直接引入 `opentopox` 包，然后传入自己的 `nodes`、`edges`、节点样式和接口数据。

## 推荐复用方式

### 方式一：内网私有 npm 包

适合多个内网项目长期复用。

```bash
cd vendor/opentopox
npm run build
npm pack
```

生成的 `opentopox-0.1.0.tgz` 可以上传到内网 npm 仓库，业务项目中安装：

```bash
npm install opentopox
```

或直接安装离线包：

```bash
npm install ./opentopox-0.1.0.tgz
```

### 方式二：Git 或 monorepo workspace 引入

适合还在持续改框架源码的阶段。

```json
{
  "dependencies": {
    "opentopox": "git+ssh://git.example.com/platform/opentopox.git"
  }
}
```

如果业务项目和 OpenTopoX 在同一个 monorepo，也可以用 workspace：

```json
{
  "dependencies": {
    "opentopox": "workspace:*"
  }
}
```

### 方式三：源码目录拷贝

适合内网暂时不能搭私有 npm 的场景。把 `vendor/opentopox` 复制到目标项目，例如：

```text
your-project/
  vendor/opentopox/
  package.json
```

然后在业务项目 `package.json` 中配置：

```json
{
  "dependencies": {
    "opentopox": "file:vendor/opentopox"
  }
}
```

安装依赖后，业务代码仍然按包名导入：

```ts
import { NewTopoGraph } from 'opentopox'
import 'opentopox/style.css'
```

## React 项目快速使用

OpenTopoX 提供 React 适配层，但核心渲染框架不依赖 React。React 项目推荐使用 `opentopox/react`：

```tsx
import { useMemo, useRef } from 'react'
import { OpenTopoXGraph, type OpenTopoXGraphHandle } from 'opentopox/react'
import 'opentopox/style.css'

export function TopologyView() {
  const graphRef = useRef<OpenTopoXGraphHandle | null>(null)

  const data = useMemo(() => ({
    nodes: [
      {
        id: 'service-a',
        type: 'cardNode',
        position: { x: 0, y: 0 },
        data: {
          title: 'Service A',
          domain: 'app',
          status: 'ok',
          size: { width: 180, height: 64 },
        },
      },
      {
        id: 'database',
        type: 'cardNode',
        position: { x: 300, y: 0 },
        data: {
          title: 'Database',
          domain: 'storage',
          status: 'warn',
          size: { width: 180, height: 64 },
        },
      },
    ],
    edges: [
      {
        id: 'service-a-database',
        source: 'service-a',
        target: 'database',
        label: 'query',
      },
    ],
  }), [])

  return (
    <div style={{ width: '100%', height: 600 }}>
      <OpenTopoXGraph
        ref={graphRef}
        data={data}
        layout={{ topoType: 'preset' }}
        config={{
          controls: true,
          minimap: true,
          nodeDraggable: true,
          edgeRouting: 'flow',
          zoomSensitivity: 0.0045,
        }}
        onNodeClick={(node) => {
          console.log('node clicked', node)
        }}
        onEdgeClick={(edge) => {
          console.log('edge clicked', edge)
        }}
      />
    </div>
  )
}
```

## 非 React 项目快速使用

Vue、原生 JS 或其他框架可以直接使用核心类：

```ts
import { NewTopoGraph } from 'opentopox'
import 'opentopox/style.css'

const topo = new NewTopoGraph({
  container: document.querySelector('#graph')!,
  config: {
    controls: true,
    minimap: true,
    nodeDraggable: true,
  },
})

const graph = topo.getGraph()

graph.setLayout({ topoType: 'preset' })

await graph.setData({
  nodes: [
    {
      id: 'api',
      position: { x: 0, y: 0 },
      data: { title: 'API', size: { width: 180, height: 64 } },
    },
    {
      id: 'db',
      position: { x: 300, y: 0 },
      data: { title: 'DB', size: { width: 180, height: 64 } },
    },
  ],
  edges: [
    { id: 'api-db', source: 'api', target: 'db' },
  ],
})
```

销毁页面时调用：

```ts
topo.destroy()
```

## 数据结构

最小数据结构只需要 `nodes` 和 `edges`：

```ts
type TopologyData = {
  nodes: Array<{
    id: string
    type?: string
    position?: { x: number; y: number }
    data?: Record<string, unknown>
    draggable?: boolean
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    type?: string
    label?: string
    data?: Record<string, unknown>
  }>
}
```

常用节点字段：

```ts
{
  id: 'node-id',
  type: 'cardNode',
  position: { x: 0, y: 0 },
  data: {
    title: '节点标题',
    domain: '业务域',
    status: 'ok',
    size: { width: 180, height: 64 },
    color: '#8b5cf6'
  }
}
```

常用边字段：

```ts
{
  id: 'edge-id',
  source: 'source-node-id',
  target: 'target-node-id',
  label: '调用',
  data: {
    status: 'ok',
    routing: 'flow',
    sourceColor: '#8b5cf6',
    targetColor: '#22c55e',
    gradient: true
  }
}
```

## 自定义节点

业务项目可以注册自己的节点渲染器：

```ts
import { registerNodeShape } from 'opentopox'

registerNodeShape('resourceCard', (node) => {
  const title = String(node.data?.title || node.id)
  return `
    <div class="resource-card">
      <strong>${title}</strong>
    </div>
  `
})
```

然后节点指定 `type`：

```ts
{
  id: 'ecs-001',
  type: 'resourceCard',
  data: { title: 'ECS 实例' }
}
```

如果自定义节点的真实可见卡片在内部元素上，建议声明锚点选择器，连线会连接到这个元素的边界：

```ts
{
  id: 'ecs-001',
  type: 'resourceCard',
  data: {
    title: 'ECS 实例',
    anchorSelector: '.resource-card-body',
    size: { width: 180, height: 64 }
  }
}
```

## 常用图 API

通过 `topo.getGraph()` 或 React ref 的 `getGraph()` 获取图 API：

```ts
const graph = topo.getGraph()
```

常用方法：

| 方法 | 用途 |
|---|---|
| `setData(data)` | 设置完整节点和边 |
| `patchGraphData(patch)` | 增量更新节点和边 |
| `fitView(options)` | 自动缩放到合适视图 |
| `zoomTo(zoom)` | 缩放到指定比例 |
| `setViewport(viewport)` | 设置画布视口 |
| `selectNode(id)` | 选中节点 |
| `clearSelection()` | 清空选择 |
| `getData()` | 获取当前图数据 |
| `refreshMeasurements()` | 自定义节点尺寸变化后重新测量并刷新连线 |
| `setMinimapVisible(enabled)` | 显示或隐藏小地图 |
| `setFullscreen(enabled)` | 进入或退出全屏 |
| `destroy()` | 销毁图实例 |

## 接口数据怎么接入

OpenTopoX 不绑定后端接口。推荐业务项目在自己的 API 层把接口数据转换成 `nodes` 和 `edges`：

```ts
async function loadTopology() {
  const response = await fetch('/api/topology')
  const rows = await response.json()

  return {
    nodes: rows.nodes.map((item) => ({
      id: item.id,
      type: 'resourceCard',
      position: item.position,
      data: {
        title: item.name,
        status: item.status,
        size: { width: 180, height: 64 },
      },
    })),
    edges: rows.links.map((item) => ({
      id: item.id,
      source: item.sourceId,
      target: item.targetId,
      data: {
        status: item.status,
      },
    })),
  }
}
```

然后：

```ts
graph.setData(await loadTopology())
```

## 内网移植建议

1. 优先把 `vendor/opentopox` 单独放进内网 Git 仓库，作为框架项目维护。
2. 打包后发布到内网 npm 仓库，让业务项目通过 `npm install opentopox` 引入。
3. 业务项目只维护节点/边数据转换、自定义节点样式和接口请求，不要改 OpenTopoX 源码。
4. 如果必须改框架能力，例如缩放、拖拽、小地图、连线算法，先在 OpenTopoX 仓库改并发版本，再升级业务项目依赖。
5. 自定义节点尺寸要保持三处一致：`data.size`、CSS 真实宽高、连线锚点 `anchorSelector`。

## 当前 UModel 项目的接入示例

本项目的 UModel 页面使用方式可以参考：

- `src/features/umodel/UModelOpenTopoXGraphView.tsx`
- `src/features/umodel/graphModel.ts`
- `src/features/umodel/umodel.css`

其中：

- `graphModel.ts` 负责把 UModel 元素转成节点和边。
- `UModelOpenTopoXGraphView.tsx` 负责引入 `OpenTopoXGraph`、注册节点渲染器、传入 data/config。
- `umodel.css` 负责业务卡片样式。

## 发布边界

OpenTopoX 框架只包含 `vendor/opentopox` 目录下的内容。UModel 页面、mock 数据、业务接口、侧边栏和右侧详情面板不属于框架能力，只是业务项目示例。
