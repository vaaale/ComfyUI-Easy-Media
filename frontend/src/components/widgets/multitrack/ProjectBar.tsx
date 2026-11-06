import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getSiblingWidgetValue, hideSiblingWidget, setSiblingWidgetValue, type SiblingWidgetNode } from '@/lib/sibling-widget'
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

const AUTO_SAVE_DEBOUNCE_MS = 1500

interface ProjectBarProps {
  app: ComfyApp
  node: SiblingWidgetNode
  value: TrackData
  onChange: (data: TrackData) => void
}

/**
 * Projects, scenes, LoRAs... too many names for the same thing: this bar
 * treats "project" as the single user-facing concept. Picking or naming a
 * project drives the render-output folder (project_name/replace_existing_output
 * native widgets, via the sibling bridge) *and* loads/saves that project's
 * timeline snapshot (reusing the scene JSON storage under the hood).
 */
export function ProjectBar({ app, node, value, onChange }: Readonly<ProjectBarProps>) {
  const t = useT()
  const [projects, setProjects] = useState<string[]>(['default'])
  const [nameInput, setNameInput] = useState<string>(() => String(getSiblingWidgetValue(node, 'project_name', '') || 'default'))
  const [isBusy, setIsBusy] = useState(false)
  const replaceExisting = getSiblingWidgetValue<boolean>(node, 'replace_existing_output', false)

  // project_name/replace_existing_output are real node inputs (used at render
  // time) but this bar is their only intended UI; hide their native rows so
  // they don't show twice. Runs once on mount, not reactively, since nothing
  // else should be toggling their visibility.
  useEffect(() => {
    const hiddenName = hideSiblingWidget(node, 'project_name')
    const hiddenReplace = hideSiblingWidget(node, 'replace_existing_output')
    if (hiddenName || hiddenReplace) node.setDirtyCanvas?.(true, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  function applyProjectRef(name: string, replace: boolean) {
    setSiblingWidgetValue(node, 'project_name', name)
    setSiblingWidgetValue(node, 'replace_existing_output', replace)
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
      applyProjectRef(name, false)
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

  const persistProject = useCallback(async (name: string, trackData: TrackData): Promise<boolean> => {
    try {
      const response = await app.api.fetchApi('/easy-media/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_name: name, track_data: trackData }),
      })
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        throw new Error(errorMessage(payload, t('sceneStudio.projectSaveFailed')))
      }
      return true
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.projectSaveFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
      return false
    }
  }, [app, t])

  const saveProject = useCallback(async () => {
    const name = nameInput.trim()
    if (!name) return
    setIsBusy(true)
    try {
      if (await persistProject(name, value)) {
        // Only the name, never project_save: saving the timeline and the
        // replace-existing-output render setting are unrelated, and this
        // used to silently discard the user's checkbox choice on every save.
        setSiblingWidgetValue(node, 'project_name', name)
        node.setDirtyCanvas?.(true, true)
        await loadProjects()
      }
    } finally {
      setIsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProjects, nameInput, node, persistProject, value])

  // Auto-save edits to the active project after they settle, so adding or
  // changing segments doesn't require remembering to click Save. Skips the
  // very first render (nothing has actually changed yet) and any render
  // where no project name is set.
  const hasMountedRef = useRef(false)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    const name = nameInput.trim()
    if (!name) return
    const timer = globalThis.setTimeout(() => {
      void persistProject(name, value).then((success) => {
        if (success) void loadProjects()
      })
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => globalThis.clearTimeout(timer)
    // Intentionally keyed on `value` alone: auto-save should fire whenever
    // the timeline changes, targeting whatever project is currently active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

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
                onCheckedChange={(checked) => applyProjectRef(nameInput.trim() || 'default', checked === true)}
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
