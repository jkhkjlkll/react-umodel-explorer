import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Box, GitBranch, Network, PanelLeftClose, PanelLeftOpen, RefreshCcw } from 'lucide-react'
import { UModelApi, type UModelApiClient } from './api/client'
import type { WorkspaceMetadata } from './api/types'
import { Button, IconButton } from './design/components'
import { useI18n } from './i18n'
import { formatError } from './lib/json'
import { useLocalStorageState } from './lib/storage'
import { UModelPage } from './features/umodel/UModelPage'
import { TopologyExplorerPage } from './features/topology/TopologyExplorerPage'
import { EntityExplorerPage } from './features/entity/EntityExplorerPage'
import { WorkspacePortal } from './features/workspace/WorkspacePortal'
import { useWorkspaceStore } from './features/workspace/workspaceStore'

const storageKeys = {
  apiBase: 'standalone.umodel.apiBase',
  workspace: 'standalone.umodel.workspace',
  section: 'standalone.umodel.section',
  activeWorkspace: 'standalone.umodel.activeWorkspace',
}

type StandaloneSection = 'umodel' | 'entity' | 'topology'

function getInitialQueryValue(key: string) {
  return new URLSearchParams(window.location.search).get(key)?.trim() ?? undefined
}

export function StandaloneExplorerApp() {
  const { t } = useI18n()
  const initialApiBase = getInitialQueryValue('apiBase')
  const initialWorkspaceId = getInitialQueryValue('workspace')
  const [apiBase, setApiBase] = useLocalStorageState(storageKeys.apiBase, '', initialApiBase)
  const [workspaceId, setWorkspaceId] = useLocalStorageState(storageKeys.workspace, 'demo', initialWorkspaceId || undefined)
  const [activeWorkspaceId, setActiveWorkspaceId] = useLocalStorageState(storageKeys.activeWorkspace, '')
  const [workspace, setWorkspace] = useState<WorkspaceMetadata | null>(null)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [section, setSection] = useLocalStorageState<StandaloneSection>(storageKeys.section, 'topology')
  const workspaceStore = useWorkspaceStore(apiBase)
  const selectedWorkspace = useMemo(() => (
    workspaceStore.workspaces.find((item) => item.id === activeWorkspaceId) || null
  ), [activeWorkspaceId, workspaceStore.workspaces])
  const api = useMemo<UModelApiClient>(() => new UModelApi(apiBase), [apiBase])

  const refresh = useCallback(async () => {
    setError('')
    try {
      const nextWorkspace = await api.getWorkspace(workspaceId)
      setWorkspace(nextWorkspace)
      setRefreshToken((value) => value + 1)
    } catch (nextError) {
      setError(formatError(nextError))
    }
  }, [api, workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nextApiBase = params.get('apiBase')
    const nextWorkspaceId = params.get('workspace')
    if (nextApiBase !== null) setApiBase(nextApiBase.trim())
    if (nextWorkspaceId) setWorkspaceId(nextWorkspaceId.trim())
  }, [setApiBase, setWorkspaceId])

  if (!selectedWorkspace) {
    return (
      <WorkspacePortal
        workspaces={workspaceStore.workspaces}
        loading={workspaceStore.loading}
        error={workspaceStore.error}
        onRefresh={() => void workspaceStore.refresh()}
        onCreate={workspaceStore.createWorkspace}
        onUpdate={workspaceStore.updateWorkspace}
        onDelete={async (id) => {
          await workspaceStore.deleteWorkspace(id)
          if (activeWorkspaceId === id) setActiveWorkspaceId('')
        }}
        onStatusChange={workspaceStore.setWorkspaceStatus}
        onEnter={(nextWorkspace) => {
          setActiveWorkspaceId(nextWorkspace.id)
          setWorkspaceId(nextWorkspace.id)
        }}
      />
    )
  }

  return (
    <div className={`workspace-shell app-shell canvas-host ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <StandaloneBrand />
          <div className="workspace-sidebar-title" style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedWorkspace.name || workspace?.name || workspaceId}
            </strong>
            <span className="workspace-id">{selectedWorkspace.id}</span>
          </div>
          <IconButton
            className="workspace-collapse-button"
            label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            onClick={() => setSidebarCollapsed((value) => !value)}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </IconButton>
        </div>
        <nav className="workspace-nav">
          <button className={section === 'umodel' ? 'active' : ''} type="button" title={t('nav.umodel')} onClick={() => setSection('umodel')}>
            <GitBranch size={16} />
            <span className="workspace-nav-label">{t('nav.umodel')}</span>
          </button>
          <button className={section === 'entity' ? 'active' : ''} type="button" title="实体探索" onClick={() => setSection('entity')}>
            <Box size={16} />
            <span className="workspace-nav-label">实体探索</span>
          </button>
          <button className={section === 'topology' ? 'active' : ''} type="button" title={t('nav.entityTopo')} onClick={() => setSection('topology')}>
            <Network size={16} />
            <span className="workspace-nav-label">{t('nav.entityTopo')}</span>
          </button>
        </nav>
        <div className="workspace-sidebar-footer standalone-sidebar-footer">
          <Button className="workspace-back-button" variant="ghost" onClick={() => setActiveWorkspaceId('')}>
            <ArrowLeft size={16} />
            <span className="workspace-back-label">工作空间</span>
          </Button>
          <Button className="workspace-back-button" variant="ghost" onClick={() => void refresh()}>
            <RefreshCcw size={16} />
            <span className="workspace-back-label">{t('common.refresh')}</span>
          </Button>
          {error && !sidebarCollapsed && <div className="standalone-error-text">{error}</div>}
        </div>
      </aside>

      <section className="workspace-main workspace-main-no-topbar canvas-main-host">
        <main className="workspace-content workspace-content-canvas">
          {section === 'umodel' ? (
            <UModelPage api={api} workspaceId={workspaceId} refreshToken={refreshToken} />
          ) : section === 'entity' ? (
            <EntityExplorerPage api={api} workspaceId={workspaceId} refreshToken={refreshToken} />
          ) : (
            <TopologyExplorerPage api={api} workspaceId={workspaceId} refreshToken={refreshToken} />
          )}
        </main>
      </section>
    </div>
  )
}

function StandaloneBrand() {
  return (
    <div className="brand brand-compact" aria-label="OModel">
      <div className="brand-mark standalone-brand-mark">
        <GitBranch size={18} />
      </div>
    </div>
  )
}
