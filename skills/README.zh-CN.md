# UModel Java Agent 技能

可加载的技能（Skill），让 AI Agent 使用 UModel Java Backend：读取模型、实体、
关系、拓扑、Runbook 和遥测查询计划，并在对象图上做模型引导的故障排查。

这里的技能是自包含的 `SKILL.md` 目录，带 YAML frontmatter `name` 与
`description`，后面是 Agent 可执行的工作指令。目录布局保持和上游
`skills/` 包一致，便于 Claude Code、Qoder、Codex、Cursor 等支持技能的客户端加载。

> 第一次用？从[快速上手](QUICKSTART.zh-CN.md)开始：启动 Java 后端、导入 demo
> workspace、安装技能，然后让 Agent 通过 HTTP/MCP 查询对象图。

## 可用技能

| 技能 | 路径 | 用途 |
|---|---|---|
| `umodel-query` | [`umodel-query/SKILL.md`](umodel-query/SKILL.md) | 读取 UModel 模型、实体、EntitySet 方法、拓扑、Runbook、指标/日志查询计划。Java 版优先使用 REST/MCP，也保留和上游一致的 SPL。 |
| `umodel-rca` | [`umodel-rca/SKILL.md`](umodel-rca/SKILL.md) | 在对象图上做模型引导的根因分析：定位症状实体、读取遥测计划、遍历跨域关系、汇总证据链和建议动作。 |

## 前置要求

一个可访问的 UModel Java Backend。最快路径是本地启动 Spring Boot 服务，并导入
`multi-domain-quickstart`：

```bash
mvn spring-boot:run -pl apps/umodel-server -am
curl -X POST http://localhost:8080/api/v1/samples/demo/multi-domain-quickstart:import
```

Agent 可以通过任一传输读取：

- **HTTP REST**：`POST /api/v1/query/{workspace}/execute`
- **MCP HTTP**：`POST /mcp` 调用 `query_spl_execute`
- **MCP stdio**：运行 `apps/umodel-mcp-stdio`

demo 数据本地运行，不需要外部密钥。

## 使用技能

### 方式 A：拷贝到 Agent 的技能目录

多数支持技能的 Agent 会从固定目录发现 `SKILL.md`：

| Agent | 技能目录 |
|---|---|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/skills/` |
| Qoder | `.qoder/skills/` |
| Codex | `.agents/skills/` 或 `~/.agents/skills/` |

```bash
mkdir -p .agents/skills
cp -R skills/umodel-query skills/umodel-rca .agents/skills/
```

然后正常提问，例如“查一下 demo workspace 里的服务依赖”会触发
`umodel-query`，“checkout 延迟升高，帮我排查根因”会触发 `umodel-rca`。
Codex 可用 `$umodel-query` 手动提及，Claude Code / Qoder 可用 `/umodel-query`
手动触发。

### 方式 B：通过 MCP 直接接入 Java 后端

HTTP MCP：

```bash
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"workspace":"demo"}}'
```

MCP stdio：

```bash
mvn spring-boot:run -pl apps/umodel-mcp-stdio -am \
  -Dspring-boot.run.arguments="--workspace demo --graphstore memory --quickstart"
```

## 两个技能的关系

- `umodel-query` 覆盖读取。它负责 `.umodel`、`.entity`、`.entity_set`、
  `.topo`、`.runbook_set`，以及 `get_metrics` / `get_logs` 查询计划。
- `umodel-rca` 覆盖故障排查方法。它复用 `umodel-query` 的读取能力，把模型、
  拓扑、Runbook 和遥测计划串成证据链。
- Java 版的 Skill 文档保持中文，但 SPL、工具名、资源 URI、API 路径和上游公共
  契约对齐。

## 和上游 Skill 的对应关系

Java 子项目保留上游的 agent-facing 布局：

```text
skills/
  README.md
  README.zh-CN.md
  QUICKSTART.md
  QUICKSTART.zh-CN.md
  umodel-query/
    SKILL.md
    references/
  umodel-rca/
    SKILL.md
```

区别在于 Java 后端没有 Go CLI `umctl` 入口，技能中的命令优先使用 HTTP/MCP。
SPL 仍然保持同一套公共读模型，便于后续做 Go/Java parity fixture 对比。

## 编写新技能

新增目录 `skills/<name>/`，放一个 `SKILL.md`：

```markdown
---
name: <name>
description: >-
  一两句话说明技能做什么、Agent 何时该用它。包含触发短语。
---

# <标题>

说明连接方式、工具面、查询流程、worked example 和注意事项。
```

技能应优先复用 Query Service，而不是绕过 `.umodel`、`.entity`、`.entity_set`、
`.topo`、`.runbook_set` 这些公共读入口。

## 相关文档

- [快速上手](QUICKSTART.zh-CN.md)
- [`umodel-query`](umodel-query/SKILL.md)
- [`umodel-rca`](umodel-rca/SKILL.md)
- [兼容矩阵](../docs/compatibility-matrix.md)
- [兼容计划](../docs/compatibility-plan.md)
