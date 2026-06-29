import type { CreateWorkspaceRequest, UpdateWorkspaceRequest, WorkspaceMetadata } from '../../api/types'

export type WorkspaceStatus = 'running' | 'maintenance' | 'disabled' | 'archived'

export interface LocalWorkspace {
  id: string
  name: string
  description: string
  tenantId: string
  projectId: string
  scopes: string[]
  status: WorkspaceStatus
  owner: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceDraft {
  id?: string
  name: string
  description: string
  tenantId: string
  projectId: string
  scopes: string[]
}

export const workspaceStatusLabels: Record<WorkspaceStatus, string> = {
  running: '运行中',
  maintenance: '维护中',
  disabled: '已停用',
  archived: '已归档',
}

export const workspaceStatusDescriptions: Record<WorkspaceStatus, string> = {
  running: '可进入探索和写入模型数据',
  maintenance: '保留数据，建议暂停结构调整',
  disabled: '暂不可进入，适合临时冻结',
  archived: '从常用列表收起，保留历史记录',
}

export const defaultWorkspaceScopes = [
  { id: 'PRJ-CORE', name: '核心生产集群', detail: '业务核心链路、数据库与服务依赖' },
  { id: 'PRJ-EDGE', name: '边缘网络', detail: 'CDN、网关、负载均衡与跨区流量' },
  { id: 'PRJ-SEC', name: '安全与合规', detail: '审计、身份、策略和风险资产' },
  { id: 'PRJ-DATA', name: '数据平台', detail: '数据管道、离线任务和存储节点' },
  { id: 'PRJ-AIOPS', name: 'AIOps 平台', detail: '告警聚合、根因分析和智能巡检' },
  { id: 'PRJ-CMDB', name: '资产配置中心', detail: '配置项、实例、服务和归属关系' },
  { id: 'PRJ-OBS', name: '可观测平台', detail: '指标、日志、链路和事件采集' },
  { id: 'PRJ-APP', name: '应用服务域', detail: '微服务、API 网关和业务调用关系' },
  { id: 'PRJ-MIDDLEWARE', name: '中间件集群', detail: '消息、缓存、注册中心和任务调度' },
  { id: 'PRJ-STAGING', name: '预发验证环境', detail: '发布验证、灰度演练和回归测试' },
  { id: 'PRJ-DR', name: '灾备恢复中心', detail: '跨区容灾、备份链路和恢复演练' },
  { id: 'PRJ-LEGACY', name: '遗留系统治理', detail: '旧系统依赖、迁移路径和风险资产' },
]

export function createWorkspaceId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `ws-${slug || 'omodel'}-${suffix}`
}

export function workspaceFromMetadata(metadata: WorkspaceMetadata): LocalWorkspace {
  const ui = workspaceUiConfig(metadata)
  return {
    id: metadata.id,
    name: metadata.name || metadata.id,
    description: metadata.description || '',
    tenantId: stringValue(ui.tenantId) || stringValue(metadata.labels?.tenantId),
    projectId: stringValue(ui.projectId) || stringValue(metadata.labels?.projectId),
    scopes: stringArray(ui.scopes),
    status: normalizeWorkspaceStatus(stringValue(ui.status), metadata.status),
    owner: stringValue(ui.owner) || 'Alex Chen',
    createdAt: metadata.created_at || '',
    updatedAt: metadata.updated_at || '',
  }
}

export function createWorkspacePayload(draft: WorkspaceDraft): CreateWorkspaceRequest {
  const id = draft.id?.trim() || createWorkspaceId(draft.name)
  return {
    id,
    name: draft.name.trim() || id,
    description: draft.description.trim(),
    labels: {
      tenantId: draft.tenantId.trim(),
      projectId: draft.projectId.trim(),
    },
    config: {
      workspace_ui: workspaceUiPayload(draft, 'running'),
    },
  }
}

export function updateWorkspacePayload(draft: WorkspaceDraft, status: WorkspaceStatus): UpdateWorkspaceRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    labels: {
      tenantId: draft.tenantId.trim(),
      projectId: draft.projectId.trim(),
    },
    config: {
      workspace_ui: workspaceUiPayload(draft, status),
    },
    replace_labels: true,
    replace_config: true,
  }
}

export function statusUpdatePayload(workspace: LocalWorkspace, status: WorkspaceStatus): UpdateWorkspaceRequest {
  return updateWorkspacePayload({
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    tenantId: workspace.tenantId,
    projectId: workspace.projectId,
    scopes: workspace.scopes,
  }, status)
}

function workspaceUiPayload(draft: WorkspaceDraft, status: WorkspaceStatus) {
  return {
    tenantId: draft.tenantId.trim(),
    projectId: draft.projectId.trim(),
    scopes: draft.scopes,
    status,
    owner: 'Alex Chen',
  }
}

function workspaceUiConfig(metadata: WorkspaceMetadata): Record<string, unknown> {
  const config = metadata.config || {}
  const ui = config.workspace_ui
  return ui && typeof ui === 'object' && !Array.isArray(ui) ? ui as Record<string, unknown> : {}
}

function normalizeWorkspaceStatus(status: string, backendStatus: string): WorkspaceStatus {
  if (status === 'running' || status === 'maintenance' || status === 'disabled' || status === 'archived') return status
  return backendStatus === 'deleted' ? 'archived' : 'running'
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function workspaceMatches(workspace: LocalWorkspace, term: string) {
  const normalized = term.trim().toLowerCase()
  if (!normalized) return true
  return [
    workspace.id,
    workspace.name,
    workspace.description,
    workspace.tenantId,
    workspace.projectId,
    workspace.status,
    workspaceStatusLabels[workspace.status],
    ...workspace.scopes,
  ].some((value) => value.toLowerCase().includes(normalized))
}
