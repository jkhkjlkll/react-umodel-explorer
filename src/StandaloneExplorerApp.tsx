import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, GitBranch, Network, PanelLeftClose, PanelLeftOpen, RefreshCcw, SearchCode, ServerCog, Settings2, UploadCloud } from 'lucide-react'
import { UModelApi, type UModelApiClient } from './api/client'
import { MockUModelApi } from './api/mockClient'
import type { WorkspaceMetadata } from './api/types'
import { Button, IconButton } from './design/components'
import { useI18n } from './i18n'
import { formatError } from './lib/json'
import { useLocalStorageState } from './lib/storage'
import { UModelPage } from './features/umodel/UModelPage'
import { TopologyExplorerPage } from './features/topology/TopologyExplorerPage'
import { EntityExplorerPage } from './features/entity/EntityExplorerPage'
import { QueryPage } from './features/query/QueryPage'
import { ImportsPage } from './features/imports/ImportsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ApiMapPage } from './features/settings/ApiMapPage'

const storageKeys = {
  apiBase: 'standalone.umodel.apiBase',
  workspace: 'standalone.umodel.workspace',
  dataSource: 'standalone.umodel.dataSource',
  section: 'standalone.umodel.section',
}

type DataSource = 'mock' | 'api'
type StandaloneSection = 'umodel' | 'entity' | 'topology' | 'query' | 'imports' | 'settings' | 'apiDebug'

export function StandaloneExplorerApp() {
  const { t } = useI18n()
  const [apiBase, setApiBase] = useLocalStorageState(storageKeys.apiBase, '')
  const [workspaceId, setWorkspaceId] = useLocalStorageState(storageKeys.workspace, 'demo')
  const [dataSource, setDataSource] = useLocalStorageState<DataSource>(storageKeys.dataSource, 'mock')
  const [workspace, setWorkspace] = useState<WorkspaceMetadata | null>(null)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [section, setSection] = useLocalStorageState<StandaloneSection>(storageKeys.section, 'topology')
  const api = useMemo<UModelApiClient>(() => (
    dataSource === 'mock' ? new MockUModelApi(360) : new UModelApi(apiBase)
  ), [apiBase, dataSource])

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
    const nextDataSource = params.get('dataSource')
    const nextSection = params.get('section')
    if (nextApiBase !== null) setApiBase(nextApiBase.trim())
    if (nextWorkspaceId) setWorkspaceId(nextWorkspaceId.trim())
    if (nextDataSource === 'api' || nextDataSource === 'mock') setDataSource(nextDataSource)
    if (isStandaloneSection(nextSection)) setSection(nextSection)
  }, [setApiBase, setDataSource, setSection, setWorkspaceId])

  return (
    <div className={`workspace-shell app-shell canvas-host ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <StandaloneBrand />
          <div className="workspace-sidebar-title" style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workspace?.name || workspaceId}
            </strong>
            <span className="workspace-id">{workspaceId}</span>
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
          <button className={section === 'query' ? 'active' : ''} type="button" title={t('nav.query')} onClick={() => setSection('query')}>
            <SearchCode size={16} />
            <span className="workspace-nav-label">{t('nav.query')}</span>
          </button>
          <button className={section === 'imports' ? 'active' : ''} type="button" title={t('nav.imports')} onClick={() => setSection('imports')}>
            <UploadCloud size={16} />
            <span className="workspace-nav-label">{t('nav.imports')}</span>
          </button>
          <button className={section === 'settings' ? 'active' : ''} type="button" title={t('nav.settings')} onClick={() => setSection('settings')}>
            <Settings2 size={16} />
            <span className="workspace-nav-label">{t('nav.settings')}</span>
          </button>
          <button className={section === 'apiDebug' ? 'active' : ''} type="button" title={t('nav.apiMap')} onClick={() => setSection('apiDebug')}>
            <ServerCog size={16} />
            <span className="workspace-nav-label">{t('nav.apiMap')}</span>
          </button>
        </nav>
        <div className="workspace-sidebar-footer standalone-sidebar-footer">
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
            <EntityExplorerPage refreshToken={refreshToken} />
          ) : section === 'topology' ? (
            <TopologyExplorerPage api={api} workspaceId={workspaceId} refreshToken={refreshToken} />
          ) : section === 'query' ? (
            <QueryPage api={api} workspaceId={workspaceId} />
          ) : section === 'imports' ? (
            <ImportsPage api={api} workspaceId={workspaceId} onChanged={() => setRefreshToken((value) => value + 1)} />
          ) : section === 'settings' ? (
            <SettingsPage
              api={api}
              workspaceId={workspaceId}
              workspace={workspace}
              onWorkspaceChange={setWorkspace}
              onBack={() => setSection('umodel')}
            />
          ) : (
            <ApiMapPage api={api} workspaceId={workspaceId} />
          )}
        </main>
      </section>
    </div>
  )
}

function isStandaloneSection(value: string | null): value is StandaloneSection {
  return value === 'umodel'
    || value === 'entity'
    || value === 'topology'
    || value === 'query'
    || value === 'imports'
    || value === 'settings'
    || value === 'apiDebug'
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
