import { useCallback, useState } from 'react'
import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getSiblingWidgetValue, setSiblingWidgetValue, type SiblingWidgetNode } from '@/lib/sibling-widget'
import { useT } from '@/lib/i18n'
import type { TrackData } from '@/types/multitrack'

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error?: unknown }
    if (typeof error === 'string' && error) return error
  }
  return fallback
}

function extractNames(payload: unknown, key: string): string[] {
  const raw = payload && typeof payload === 'object' && key in payload
    ? (payload as Record<string, unknown>)[key]
    : undefined
  return Array.isArray(raw) ? raw.filter((name): name is string => typeof name === 'string' && name.length > 0) : []
}

interface ProjectBarProps {
  app: ComfyApp
  node: SiblingWidgetNode
  value: TrackData
  onChange: (data: TrackData) => void
}

/**
 * Projects, scenes, LoRAs... too many names for the same thing: this bar
 * treats "project" as the single user-facing concept. Picking or naming a
 * project drives the render-output folder (project_name/project_save native
 * widgets, via the sibling bridge) *and* loads/saves that project's timeline
 * snapshot (reusing the scene JSON storage under the hood).
 */
export function ProjectBar({ app, node, value, onChange }: Readonly<ProjectBarProps>) {
  const t = useT()
  const [projects, setProjects] = useState<string[]>(['default'])
  const [nameInput, setNameInput] = useState<string>(() => String(getSiblingWidgetValue(node, 'project_name', '') || 'default'))
  const [isBusy, setIsBusy] = useState(false)
  const replaceExisting = getSiblingWidgetValue<'new' | 'override'>(node, 'project_save', 'new') === 'override'

  function applyProjectRef(name: string, save: 'new' | 'override') {
    setSiblingWidgetValue(node, 'project_name', name)
    setSiblingWidgetValue(node, 'project_save', save)
    node.setDirtyCanvas?.(true, true)
  }

  const loadProjects = useCallback(async () => {
    try {
      const [scenesResponse, projectsResponse] = await Promise.all([
        app.api.fetchApi('/easy-media/scenes'),
        app.api.fetchApi('/easy-media/projects'),
      ])
      const scenesPayload: unknown = await scenesResponse.json()
      const projectsPayload: unknown = await projectsResponse.json()
      if (!scenesResponse.ok) throw new Error(errorMessage(scenesPayload, t('sceneStudio.projectListFailed')))
      if (!projectsResponse.ok) throw new Error(errorMessage(projectsPayload, t('sceneStudio.projectListFailed')))
      const names = Array.from(new Set([
        ...extractNames(scenesPayload, 'scenes'),
        ...extractNames(projectsPayload, 'projects'),
      ]))
      setProjects(names.includes('default') ? names : ['default', ...names])
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.projectListFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    }
  }, [app, t])

  const selectProject = useCallback(async (name: string) => {
    setIsBusy(true)
    try {
      applyProjectRef(name, 'new')
      setNameInput(name)
      const response = await app.api.fetchApi(`/easy-media/scene?scene_name=${encodeURIComponent(name)}`)
      if (response.ok) {
        const payload: unknown = await response.json()
        onChange(payload as TrackData)
      } else if (response.status === 404) {
        app.extensionManager.toast.add({
          severity: 'info',
          summary: t('sceneStudio.noSavedTimelineTitle'),
          detail: t('sceneStudio.noSavedTimelineDetail', { name }),
          life: 4000,
        })
      } else {
        const payload: unknown = await response.json().catch(() => null)
        throw new Error(errorMessage(payload, t('sceneStudio.projectLoadFailed')))
      }
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.projectLoadFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, node, onChange, t])

  const saveProject = useCallback(async () => {
    const name = nameInput.trim()
    if (!name) return
    setIsBusy(true)
    try {
      const response = await app.api.fetchApi('/easy-media/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_name: name, track_data: value }),
      })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.projectSaveFailed')))
      applyProjectRef(name, 'new')
      await loadProjects()
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.projectSaveFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, loadProjects, nameInput, node, t, value])

  const deleteProject = useCallback(async () => {
    const name = nameInput.trim()
    if (!name || name === 'default') return
    const confirmed = await app.extensionManager.dialog.confirm({
      title: t('sceneStudio.deleteProjectTitle'),
      message: t('sceneStudio.deleteProjectConfirm', { name }),
    })
    if (!confirmed) return
    setIsBusy(true)
    try {
      const response = await app.api.fetchApi(`/easy-media/scene?scene_name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.projectDeleteFailed')))
      await loadProjects()
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.projectDeleteFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
  }, [app, loadProjects, nameInput, t])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-1.5 py-1 text-[10px]">
        <Select disabled={isBusy} onOpenChange={(open) => { if (open) void loadProjects() }} onValueChange={(name) => void selectProject(name)}>
          <SelectTrigger className="h-6 w-28 shrink-0 text-xs" aria-label={t('sceneStudio.selectProject')}>
            <SelectValue placeholder={t('sceneStudio.selectProject')} />
          </SelectTrigger>
          <SelectContent>{projects.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
        </Select>
        <Input
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          placeholder={t('sceneStudio.newProjectPlaceholder')}
          className="h-6 w-28 shrink-0 text-xs"
          disabled={isBusy}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 shrink-0 px-2 text-xs"
          disabled={isBusy || !nameInput.trim()}
          onClick={() => void saveProject()}
        >
          {t('sceneStudio.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 px-2 text-xs text-destructive"
          disabled={isBusy || !nameInput.trim() || nameInput.trim() === 'default'}
          onClick={() => void deleteProject()}
        >
          {t('sceneStudio.delete')}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-muted-foreground">
              <Checkbox
                checked={replaceExisting}
                onCheckedChange={(checked) => applyProjectRef(nameInput.trim() || 'default', checked ? 'override' : 'new')}
              />
              {t('sceneStudio.replaceExistingOutput')}
            </label>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            {t('sceneStudio.replaceExistingOutputTooltip')}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
