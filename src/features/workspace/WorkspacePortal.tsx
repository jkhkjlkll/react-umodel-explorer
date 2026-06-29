import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import {
  Archive,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Database,
  Edit3,
  FolderKanban,
  GitBranch,
  Home,
  LayoutGrid,
  LifeBuoy,
  LogIn,
  MoreVertical,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { Button, IconButton, Modal } from '../../design/components'
import {
  defaultWorkspaceScopes,
  workspaceMatches,
  workspaceStatusDescriptions,
  workspaceStatusLabels,
  type LocalWorkspace,
  type WorkspaceDraft,
  type WorkspaceStatus,
} from './workspaceModel'

type WorkspaceFilter = 'all' | WorkspaceStatus

const emptyDraft: WorkspaceDraft = {
  name: '',
  description: '',
  tenantId: '',
  projectId: '',
  scopes: ['PRJ-CORE'],
}

export function WorkspacePortal({
  workspaces,
  loading,
  error,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onStatusChange,
  onEnter,
}: {
  workspaces: LocalWorkspace[]
  loading?: boolean
  error?: string
  onRefresh?: () => void
  onCreate: (draft: WorkspaceDraft) => Promise<LocalWorkspace>
  onUpdate: (id: string, draft: WorkspaceDraft) => Promise<LocalWorkspace | null>
  onDelete: (id: string) => Promise<void>
  onStatusChange: (id: string, status: WorkspaceStatus) => Promise<void>
  onEnter: (workspace: LocalWorkspace) => void
}) {
  const [mode, setMode] = useState<'guide' | 'manager'>(() => (workspaces.length === 0 ? 'guide' : 'manager'))
  const [editingWorkspace, setEditingWorkspace] = useState<LocalWorkspace | null>(null)

  const openCreate = () => setEditingWorkspace(createBlankWorkspaceMarker())

  return (
    <div className="workspace-portal app-shell">
      <WorkspacePortalSidebar mode={mode} onShowGuide={() => setMode('guide')} />
      <section className="workspace-portal-main">
        <WorkspacePortalTopbar onShowGuide={() => setMode('guide')} />
        {mode === 'guide' ? (
          <WorkspaceGuidePage onCreate={openCreate} onShowManager={() => setMode('manager')} />
        ) : (
          <WorkspaceManagerPage
            workspaces={workspaces}
            loading={loading}
            error={error}
            onRefresh={onRefresh}
            onCreate={openCreate}
            onDelete={onDelete}
            onEdit={setEditingWorkspace}
            onEnter={onEnter}
            onShowGuide={() => setMode('guide')}
            onStatusChange={onStatusChange}
          />
        )}
      </section>
      {editingWorkspace && (
        <WorkspaceFormModal
          existingWorkspaces={workspaces}
          workspace={editingWorkspace.id ? editingWorkspace : null}
          onClose={() => setEditingWorkspace(null)}
          onSubmit={async (draft) => {
            const result = editingWorkspace.id ? await onUpdate(editingWorkspace.id, draft) : await onCreate(draft)
            setEditingWorkspace(null)
            if (!editingWorkspace.id && result) {
              setMode('manager')
            }
          }}
        />
      )}
    </div>
  )
}

function WorkspacePortalSidebar({
  mode,
  onShowGuide,
}: {
  mode: 'guide' | 'manager'
  onShowGuide: () => void
}) {
  return (
    <aside className="workspace-portal-sidebar">
      <div className="workspace-portal-brand">
        <div className="workspace-portal-brand-mark">
          <GitBranch size={20} />
        </div>
        <div>
          <strong>OModel Explorer</strong>
          <span>模型探索工作台</span>
        </div>
      </div>
      <nav className="workspace-portal-nav">
        <button className={mode === 'guide' || mode === 'manager' ? 'active' : ''} type="button" onClick={onShowGuide}>
          <Home size={18} />
          <span>OModel</span>
        </button>
        <button type="button">
          <LifeBuoy size={18} />
          <span>帮助文档</span>
        </button>
      </nav>
      <div className="workspace-portal-user">
        <div className="workspace-portal-avatar">AC</div>
        <div>
          <strong>Alex Chen</strong>
          <span>模型管理员</span>
        </div>
      </div>
    </aside>
  )
}

function WorkspacePortalTopbar({ onShowGuide }: { onShowGuide: () => void }) {
  return (
    <header className="workspace-portal-topbar">
      <div className="workspace-topbar-search">
        <Search size={16} />
        <span>搜索工作空间、租户、项目或数据范围</span>
      </div>
      <div className="workspace-topbar-actions">
        <Button variant="ghost" size="sm" onClick={onShowGuide}>
          <Home size={15} />
          <span>引导页</span>
        </Button>
        <div className="workspace-topbar-product">OModel Explorer</div>
      </div>
    </header>
  )
}

function WorkspaceGuidePage({ onCreate, onShowManager }: { onCreate: () => void; onShowManager: () => void }) {
  return (
    <main className="workspace-guide">
      <section className="workspace-guide-hero">
        <div className="workspace-guide-visual" aria-hidden="true">
          <div className="workspace-guide-plane">
            <div className="workspace-guide-core">
              <GitBranch size={30} />
              <strong>OModel</strong>
            </div>
            <span className="workspace-guide-node node-a">Entity</span>
            <span className="workspace-guide-node node-b">Topology</span>
            <span className="workspace-guide-node node-c">Query</span>
          </div>
        </div>
        <div className="workspace-guide-copy">
          <h1>欢迎使用运维底图 OModel</h1>
          <p>OModel（可观测模型）是统一可观测性建模框架，通过知识图谱将对象、指标、日志、链路、变更、运维手册等数据关联融合，为AIOps提供可理解、可推理的世界模型。</p>
          <div className="workspace-guide-actions">
            <Button variant="primary" onClick={onCreate}>
              <Plus size={16} />
              <span>创建第一个工作空间</span>
            </Button>
            <Button variant="secondary" onClick={onShowManager}>
              <LayoutGrid size={16} />
              <span>进入工作空间列表</span>
            </Button>
          </div>
        </div>
      </section>
      <section className="workspace-guide-steps">
        <GuideStep icon={<FolderKanban size={20} />} title="定义范围" detail="设定您的IT环境边界。" />
        <GuideStep icon={<Boxes size={20} />} title="映射拓扑" detail="自动实现依赖关系和OModel的可视化。" />
        <GuideStep icon={<Database size={20} />} title="优化" detail="分析图谱数据缩短故障定界时间。" />
      </section>
    </main>
  )
}

function GuideStep({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="workspace-guide-step">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function WorkspaceManagerPage({
  workspaces,
  loading,
  error,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  onStatusChange,
  onEnter,
  onShowGuide,
}: {
  workspaces: LocalWorkspace[]
  loading?: boolean
  error?: string
  onRefresh?: () => void
  onCreate: () => void
  onEdit: (workspace: LocalWorkspace) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: WorkspaceStatus) => void
  onEnter: (workspace: LocalWorkspace) => void
  onShowGuide: () => void
}) {
  const [filter, setFilter] = useState<WorkspaceFilter>('all')
  const [query, setQuery] = useState('')
  const visibleWorkspaces = useMemo(() => workspaces.filter((workspace) => (
    (filter === 'all' || workspace.status === filter) && workspaceMatches(workspace, query)
  )), [filter, query, workspaces])

  return (
    <main className="workspace-manager">
      <div className="workspace-manager-header">
        <div>
          <div className="workspace-breadcrumb">
            <button type="button" onClick={onShowGuide}>OModel</button>
            <ChevronRight size={16} />
            <strong>工作空间管理</strong>
          </div>
        </div>
        <div className="workspace-manager-actions">
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} />
            <span>创建工作空间</span>
          </Button>
        </div>
      </div>

      <div className="workspace-manager-toolbar">
        <label className="workspace-filter-input">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称、ID、状态或项目筛选" />
        </label>
        <WorkspaceStatusFilters
          value={filter}
          onChange={setFilter}
          counts={{
            all: workspaces.length,
            running: countByStatus(workspaces, 'running'),
            maintenance: countByStatus(workspaces, 'maintenance'),
            disabled: countByStatus(workspaces, 'disabled'),
            archived: countByStatus(workspaces, 'archived'),
          }}
        />
      </div>
      {error && (
        <div className="workspace-manager-error">
          <span>{error}</span>
          {onRefresh && <button type="button" onClick={onRefresh}>重试</button>}
        </div>
      )}
      {loading && <div className="workspace-manager-loading">正在从后端加载工作空间...</div>}

      <div className="workspace-card-grid">
        {visibleWorkspaces.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            onDelete={onDelete}
            onEdit={onEdit}
            onEnter={onEnter}
            onStatusChange={onStatusChange}
          />
        ))}
        <button className="workspace-create-card" type="button" onClick={onCreate}>
          <div><Plus size={24} /></div>
          <strong>新建工作空间</strong>
          <span>创建新的模型探索范围，开始维护 OModel 和拓扑关系。</span>
        </button>
      </div>
    </main>
  )
}

function WorkspaceStatusFilters({
  value,
  counts,
  onChange,
}: {
  value: WorkspaceFilter
  counts: Record<WorkspaceFilter, number>
  onChange: (value: WorkspaceFilter) => void
}) {
  const items: Array<{ value: WorkspaceFilter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'running', label: workspaceStatusLabels.running },
    { value: 'maintenance', label: workspaceStatusLabels.maintenance },
    { value: 'disabled', label: workspaceStatusLabels.disabled },
    { value: 'archived', label: workspaceStatusLabels.archived },
  ]

  return (
    <div className="workspace-status-filters" aria-label="工作空间状态筛选">
      {items.map((item) => (
        <button
          key={item.value}
          className={`${item.value} ${value === item.value ? 'active' : ''}`}
          type="button"
          onClick={() => onChange(item.value)}
        >
          <span className="workspace-filter-dot" />
          <span>{item.label}</span>
          <strong>{counts[item.value]}</strong>
        </button>
      ))}
    </div>
  )
}

function WorkspaceCard({
  workspace,
  onEdit,
  onDelete,
  onStatusChange,
  onEnter,
}: {
  workspace: LocalWorkspace
  onEdit: (workspace: LocalWorkspace) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: WorkspaceStatus) => void
  onEnter: (workspace: LocalWorkspace) => void
}) {
  const canEnter = workspace.status === 'running' || workspace.status === 'maintenance'
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <article className="workspace-card">
      <div className="workspace-card-top">
        <div className="workspace-card-icon">
          <Database size={18} />
        </div>
        <div className="workspace-card-menu-wrap">
          <StatusBadge status={workspace.status} />
          <IconButton label="更多操作" onClick={() => setMenuOpen((open) => !open)}>
            <MoreVertical size={16} />
          </IconButton>
          {menuOpen && (
            <div className="workspace-card-menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onEdit(workspace)
                }}
              >
                <Edit3 size={15} />
                <span>编辑</span>
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm(`确定删除工作空间“${workspace.name}”？此操作不可恢复。`)) {
                    void onDelete(workspace.id)
                  }
                }}
              >
                <Trash2 size={15} />
                <span>删除</span>
              </button>
              <div className="workspace-card-menu-divider" />
              {workspace.status !== 'running' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void onStatusChange(workspace.id, 'running')
                  }}
                >
                  <RotateCcw size={15} />
                  <span>恢复运行</span>
                </button>
              )}
              {workspace.status !== 'maintenance' && workspace.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void onStatusChange(workspace.id, 'maintenance')
                  }}
                >
                  <PauseCircle size={15} />
                  <span>维护</span>
                </button>
              )}
              {workspace.status !== 'disabled' && workspace.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void onStatusChange(workspace.id, 'disabled')
                  }}
                >
                  <CircleAlert size={15} />
                  <span>停用</span>
                </button>
              )}
              {workspace.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void onStatusChange(workspace.id, 'archived')
                  }}
                >
                  <Archive size={15} />
                  <span>归档</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <h2>{workspace.name}</h2>
      <span className="workspace-card-id">{workspace.id}</span>
      <p>{workspace.description || '暂无描述'}</p>
      <div className="workspace-card-meta">
        <span>租户：{workspace.tenantId}</span>
        <span>项目：{workspace.projectId}</span>
      </div>
      <div className="workspace-scope-list">
        {workspace.scopes.length === 0 ? <span>未选择数据范围</span> : workspace.scopes.map((scope) => <span key={scope}>{scope}</span>)}
      </div>
      <div className="workspace-card-actions">
        <Button variant="primary" disabled={!canEnter} onClick={() => onEnter(workspace)}>
          <LogIn size={16} />
          <span>进入工作空间</span>
        </Button>
      </div>
    </article>
  )
}

function StatusBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <span className={`workspace-status ${status}`} title={workspaceStatusDescriptions[status]}>
      <span />
      {workspaceStatusLabels[status]}
    </span>
  )
}

function WorkspaceFormModal({
  workspace,
  existingWorkspaces,
  onSubmit,
  onClose,
}: {
  workspace: LocalWorkspace | null
  existingWorkspaces: LocalWorkspace[]
  onSubmit: (draft: WorkspaceDraft) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<WorkspaceDraft>(() => workspace ? {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    tenantId: workspace.tenantId,
    projectId: workspace.projectId,
    scopes: workspace.scopes,
  } : emptyDraft)
  const [error, setError] = useState('')

  function saveDraft() {
    const nextId = draft.id?.trim()
    if (!draft.name.trim()) {
      setError('请输入工作空间名称。')
      return
    }
    if (!draft.tenantId.trim() || !draft.projectId.trim()) {
      setError('请输入租户 ID 和项目 ID。')
      return
    }
    if (nextId && existingWorkspaces.some((item) => item.id === nextId && item.id !== workspace?.id)) {
      setError('工作空间 ID 已存在，请换一个 ID。')
      return
    }
    void onSubmit(draft)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    saveDraft()
  }

  return (
    <Modal
      title={workspace ? '编辑工作空间' : '创建工作空间'}
      onClose={onClose}
      footer={(
        <div className="workspace-form-footer">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={saveDraft}>
            <Check size={16} />
            <span>{workspace ? '保存修改' : '创建工作空间'}</span>
          </Button>
        </div>
      )}
    >
      <form className="workspace-form" onSubmit={submit}>
        <section>
          <div>
            <h3>基础信息</h3>
            <p>为工作空间提供易于识别的名称、租户和项目上下文。</p>
          </div>
          <div className="workspace-form-fields">
            <label>
              <span>工作空间名称</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：生产模型空间 Alpha" />
            </label>
            <label>
              <span>工作空间 ID</span>
              <input value={draft.id || ''} onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="留空自动生成" />
            </label>
            <label>
              <span>租户 ID</span>
              <input value={draft.tenantId} onChange={(event) => setDraft({ ...draft, tenantId: event.target.value })} placeholder="tenant-prod" />
            </label>
            <label>
              <span>项目 ID</span>
              <input value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} placeholder="project-core" />
            </label>
            <label className="workspace-form-wide">
              <span>描述</span>
              <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="定义模型范围、团队归属或使用场景" rows={3} />
            </label>
          </div>
        </section>
        <section>
          <div>
            <h3>数据范围</h3>
            <p>选择要纳入当前 OModel Explorer 工作空间的项目范围。</p>
          </div>
          <ProjectMultiSelect
            value={draft.scopes}
            onChange={(scopes) => setDraft({ ...draft, scopes })}
          />
        </section>
        {error && <div className="workspace-form-error">{error}</div>}
      </form>
    </Modal>
  )
}

function ProjectMultiSelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (nextValue: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedProjects = defaultWorkspaceScopes.filter((scope) => value.includes(scope.id))
  const visibleProjects = defaultWorkspaceScopes.filter((scope) => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return true
    return [scope.id, scope.name, scope.detail].some((item) => item.toLowerCase().includes(normalized))
  })

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
  }

  return (
    <div className="workspace-project-select">
      <button
        className={`workspace-project-trigger ${open ? 'open' : ''}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((nextOpen) => !nextOpen)}
      >
        <span>{value.length > 0 ? `已选择 ${value.length} 个项目` : '请选择项目范围'}</span>
        <ChevronDown size={16} />
      </button>

      {selectedProjects.length > 0 && (
        <div className="workspace-project-tags">
          {selectedProjects.map((project) => (
            <span key={project.id}>
              {project.id}
              <button type="button" aria-label={`移除 ${project.id}`} onClick={() => toggle(project.id)}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="workspace-project-menu">
          <div className="workspace-project-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目 ID、名称或说明" />
          </div>
          <div className="workspace-project-actions">
            <button type="button" onClick={() => onChange(defaultWorkspaceScopes.map((scope) => scope.id))}>全选</button>
            <button type="button" onClick={() => onChange([])}>清空</button>
          </div>
          <div className="workspace-project-list">
            {visibleProjects.map((scope) => {
              const checked = value.includes(scope.id)
              return (
                <button key={scope.id} className={checked ? 'selected' : ''} type="button" onClick={() => toggle(scope.id)}>
                  <span className="workspace-project-check">{checked && <Check size={13} />}</span>
                  <Shield size={16} />
                  <span>
                    <strong>{scope.id}</strong>
                    <small>{scope.name} · {scope.detail}</small>
                  </span>
                </button>
              )
            })}
            {visibleProjects.length === 0 && <div className="workspace-project-empty">没有匹配的项目</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function countByStatus(workspaces: LocalWorkspace[], status: WorkspaceStatus) {
  return workspaces.filter((workspace) => workspace.status === status).length
}

function createBlankWorkspaceMarker(): LocalWorkspace {
  return {
    id: '',
    name: '',
    description: '',
    tenantId: '',
    projectId: '',
    scopes: [],
    status: 'running',
    owner: '',
    createdAt: '',
    updatedAt: '',
  }
}
