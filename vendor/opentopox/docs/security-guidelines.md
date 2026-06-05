# 安全接入约束

本文档用于产品化接入前确认安全边界。框架运行在宿主页面内，默认信任调用方传入的 shape、数据和 transport 配置；因此安全责任需要在应用接入层和框架扩展层之间明确拆分。

## 责任边界

| 范围 | 框架责任 | 应用责任 |
| --- | --- | --- |
| 协议消息 | 校验 `topology.realtime.v1` envelope、版本、序号和基础结构 | 鉴权、租户隔离、服务端签名或会话校验 |
| 实时连接 | 提供 WebSocket/SSE/polling 重连、stale、offline 状态 | 使用 HTTPS/WSS，控制 token、cookie、CORS 和重放窗口 |
| 节点/边数据 | 过滤重复 ID、孤儿边等破坏性数据 | 清洗业务字段，避免把未可信文本作为 HTML |
| 自定义 shape | 提供 registry 扩展点 | 只注册可信代码，不加载用户可编辑脚本 |
| DOM 渲染 | 内置节点和 tooltip 示例会转义文本 | 自定义 `render` 返回 HTML 时自行转义和审查 |

## 自定义 shape

推荐优先返回安全文本或由可信代码拼装的 HTML：

```js
registerNodeShape("serviceNode", {
  render(node, { safe }) {
    return `
      <div class="service-node">
        <strong>${safe(node.data.title)}</strong>
        <span>${safe(node.data.metric?.value || "-")}</span>
      </div>
    `;
  },
});
```

不要把后端或用户输入直接拼到 HTML：

```js
registerNodeShape("unsafeNode", {
  render(node) {
    return `<div>${node.data.description}</div>`;
  },
});
```

如果业务必须展示富文本，建议在进入框架前做白名单清洗，例如只允许有限标签、有限属性和无事件处理器属性。

## Tooltip 和详情面板

`Tooltip`、`TopologyDetailDrawer` 和示例页面中的内容会对普通文本做转义。应用自定义 `renderContent()` 时仍需遵守同样规则：

- 用户名、实例名、标签、错误消息等按文本转义。
- URL 仅允许 `https:`、`http:` 或应用明确支持的内部协议。
- 禁止透传 `on*` 事件属性、`javascript:` URL、内联脚本。

## 实时 transport

生产环境建议：

- WebSocket 使用 `wss://`。
- SSE/polling 使用 HTTPS 且带同源或严格 CORS。
- 服务端按用户、租户、资源范围过滤拓扑数据。
- `version` 和 `seq` 单调递增，避免旧消息覆盖新状态。
- 服务端按连接或 topic 限流，客户端保留 `maxQueueSize` 背压。
- 避免在拓扑数据中下发密钥、token、完整连接串和敏感日志。

## 数据大小和拒绝服务防护

建议应用层限制：

- 单次 `snapshot` 节点数和边数上限。
- 单条 `nodePatch`/`edgePatch` patch 数量上限。
- 单个文本字段长度。
- 单个节点 `data.descriptions`、`tags` 数量。
- 自定义 shape 的图片和远程资源来源。

框架侧已有的产品化保护：

- `TopologyGraphStore` 会丢弃重复节点、孤儿边等破坏性数据。
- `TopologyUpdateScheduler` 有 `maxQueueSize` 和轻量 patch 合并。
- `NewTopoGraph` 有自动性能模式、边标签降级和轻量结构 patch。

## 发布前检查

合并到 `main` 前至少执行：

```sh
npm run check
npm run benchmark:topology
npm_config_cache=.cache/npm npm pack --dry-run
```

若项目后续补充浏览器或视觉回归脚本，应在发布前一并运行并记录结果。
