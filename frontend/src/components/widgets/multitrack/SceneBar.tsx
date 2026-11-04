import { useCallback, useState } from 'react'
import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/lib/i18n'
import type { TrackData } from '@/types/multitrack'

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error?: unknown }
    if (typeof error === 'string' && error) return error
  }
  return fallback
}

interface SceneBarProps {
  app: ComfyApp
  value: TrackData
  onChange: (data: TrackData) => void
}

export function SceneBar({ app, value, onChange }: Readonly<SceneBarProps>) {
  const t = useT()
  const [scenes, setScenes] = useState<string[]>(['default'])
  const [sceneName, setSceneName] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const loadScenes = useCallback(async () => {
    try {
      const response = await app.api.fetchApi('/easy-media/scenes')
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.listFailed')))
      const rawScenes = payload && typeof payload === 'object' && 'scenes' in payload
        ? (payload as { scenes?: unknown }).scenes
        : undefined
      const names = Array.isArray(rawScenes)
        ? rawScenes.filter((name): name is string => typeof name === 'string' && name.length > 0)
        : []
      setScenes(names.includes('default') ? names : ['default', ...names])
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.listFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    }
  }, [app, t])

  const loadScene = useCallback(async (name: string) => {
    setIsBusy(true)
    try {
      const response = await app.api.fetchApi(`/easy-media/scene?scene_name=${encodeURIComponent(name)}`)
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.loadFailed')))
      onChange(payload as TrackData)
      setSceneName(name === 'default' ? '' : name)
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.loadFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
  }, [app, onChange, t])

  const saveScene = useCallback(async () => {
    const name = sceneName.trim()
    if (!name) return
    setIsBusy(true)
    try {
      const response = await app.api.fetchApi('/easy-media/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_name: name, track_data: value }),
      })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.saveFailed')))
      await loadScenes()
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.saveFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
  }, [app, loadScenes, sceneName, t, value])

  const deleteScene = useCallback(async () => {
    const name = sceneName.trim()
    if (!name || name === 'default') return
    const confirmed = await app.extensionManager.dialog.confirm({
      title: t('sceneStudio.deleteTitle'),
      message: t('sceneStudio.deleteConfirm', { name }),
    })
    if (!confirmed) return
    setIsBusy(true)
    try {
      const response = await app.api.fetchApi(`/easy-media/scene?scene_name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      const payload: unknown = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, t('sceneStudio.deleteFailed')))
      await loadScenes()
    } catch (error) {
      app.extensionManager.toast.add({
        severity: 'error',
        summary: t('sceneStudio.deleteFailed'),
        detail: error instanceof Error ? error.message : String(error),
        life: 5000,
      })
    } finally {
      setIsBusy(false)
    }
  }, [app, loadScenes, sceneName, t])

  return (
    <div className="flex h-8 min-h-8 shrink-0 items-center gap-1.5 border-b border-border px-1.5 text-[10px]">
      <Select disabled={isBusy} onOpenChange={(open) => { if (open) void loadScenes() }} onValueChange={(name) => void loadScene(name)}>
        <SelectTrigger className="h-6 w-28 text-xs" aria-label={t('sceneStudio.selectScene')}>
          <SelectValue placeholder={t('sceneStudio.selectScene')} />
        </SelectTrigger>
        <SelectContent>{scenes.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
      </Select>
      <Input
        value={sceneName}
        onChange={(event) => setSceneName(event.target.value)}
        placeholder={t('sceneStudio.scenePlaceholder')}
        className="h-6 w-28 text-xs"
        disabled={isBusy}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={isBusy || !sceneName.trim()}
        onClick={() => void saveScene()}
      >
        {t('sceneStudio.save')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-destructive"
        disabled={isBusy || !sceneName.trim() || sceneName.trim() === 'default'}
        onClick={() => void deleteScene()}
      >
        {t('sceneStudio.delete')}
      </Button>
    </div>
  )
}
