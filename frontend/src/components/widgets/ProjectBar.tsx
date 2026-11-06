import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ReactWidgetProps } from '@/lib/create-react-widget'
import { useT } from '@/lib/i18n'

export interface ProjectRef {
  project_name: string
  project_save: 'new' | 'override'
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error?: unknown }
    if (typeof error === 'string' && error) return error
  }
  return fallback
}

export function ProjectBar({ app, value, onChange }: Readonly<ReactWidgetProps<ProjectRef>>) {
  const t = useT()
  const [projects, setProjects] = useState<string[]>(['default'])
  const [newName, setNewName] = useState('')

  const loadProjects = useCallback(async () => {
    try {
      const response = await app.api.fetchApi('/easy-media/projects')
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.projectListFailed')))
      const rawProjects = payload && typeof payload === 'object' && 'projects' in payload
        ? (payload as { projects?: unknown }).projects
        : undefined
      const names = Array.isArray(rawProjects)
        ? rawProjects.filter((name): name is string => typeof name === 'string' && name.length > 0)
        : []
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

  const projectName = value.project_name || 'default'
  const replaceExisting = value.project_save === 'override'

  function selectProject(name: string) {
    onChange({ project_name: name, project_save: 'new' })
  }

  function createProject() {
    const name = newName.trim()
    if (!name) return
    onChange({ project_name: name, project_save: 'new' })
    setNewName('')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-8 min-h-8 w-full shrink-0 items-center gap-1.5 overflow-hidden px-1.5 text-[10px]">
        <Select onOpenChange={(open) => { if (open) void loadProjects() }} onValueChange={selectProject} value={projectName}>
          <SelectTrigger className="h-6 w-28 text-xs" aria-label={t('sceneStudio.selectProject')}>
            <SelectValue placeholder={t('sceneStudio.selectProject')} />
          </SelectTrigger>
          <SelectContent>{projects.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
        </Select>
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={t('sceneStudio.newProjectPlaceholder')}
          className="h-6 w-28 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={!newName.trim()}
          onClick={createProject}
        >
          {t('sceneStudio.createProject')}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-muted-foreground">
              <Checkbox
                checked={replaceExisting}
                onCheckedChange={(checked) => onChange({ project_name: projectName, project_save: checked ? 'override' : 'new' })}
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
