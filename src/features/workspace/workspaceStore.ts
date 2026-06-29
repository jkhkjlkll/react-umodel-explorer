import { useCallback, useEffect, useState } from 'react'
import { UModelApi } from '../../api/client'
import { formatError } from '../../lib/json'
import {
  createWorkspacePayload,
  statusUpdatePayload,
  updateWorkspacePayload,
  workspaceFromMetadata,
  type LocalWorkspace,
  type WorkspaceDraft,
  type WorkspaceStatus,
} from './workspaceModel'

export function useWorkspaceStore(apiBase: string) {
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const api = new UModelApi(apiBase)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const page = await api.listWorkspaces()
      setWorkspaces(page.items.map(workspaceFromMetadata))
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createWorkspace(draft: WorkspaceDraft) {
    const metadata = await api.createWorkspace(createWorkspacePayload(draft))
    const workspace = workspaceFromMetadata(metadata)
    setWorkspaces((items) => [workspace, ...items.filter((item) => item.id !== workspace.id)])
    return workspace
  }

  async function updateWorkspace(id: string, draft: WorkspaceDraft) {
    const current = workspaces.find((workspace) => workspace.id === id)
    const metadata = await api.updateWorkspace(id, updateWorkspacePayload(draft, current?.status || 'running'))
    const workspace = workspaceFromMetadata(metadata)
    setWorkspaces((items) => items.map((item) => (item.id === id ? workspace : item)))
    return workspace
  }

  async function setWorkspaceStatus(id: string, status: WorkspaceStatus) {
    const current = workspaces.find((workspace) => workspace.id === id)
    if (!current) return
    const metadata = await api.updateWorkspace(id, statusUpdatePayload(current, status))
    const workspace = workspaceFromMetadata(metadata)
    setWorkspaces((items) => items.map((item) => (item.id === id ? workspace : item)))
  }

  async function deleteWorkspace(id: string) {
    await api.deleteWorkspace(id)
    setWorkspaces((items) => items.filter((workspace) => workspace.id !== id))
  }

  return {
    workspaces,
    loading,
    error,
    refresh,
    createWorkspace,
    updateWorkspace,
    setWorkspaceStatus,
    deleteWorkspace,
  }
}
