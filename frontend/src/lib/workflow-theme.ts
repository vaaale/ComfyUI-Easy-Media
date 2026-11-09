import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import { CUSTOM_NODE_CLASS } from '@/lib/constants'

export const THEME_NODE_TYPE = 'easy workflowTheme'
const STYLE_ID = 'easy-media-workflow-theme'
const THEME_ATTRIBUTE = 'data-easy-media-workflow-theme'
const DEFAULT_THEME = 'ComfyUI default'
const THEMED_MARKER = '__easyMediaThemed'
const STRIPE_MARKER = '__easyMediaStripeInstalled'

interface Palette {
  background: string
  foreground: string
  card: string
  primary: string
  secondary: string
  muted: string
  mutedForeground: string
  accent: string
  border: string
  canvasBackground: string
  nodeTitleBar: string
  nodeBody: string
  /** Accent stripe colors, indexed by Stage. */
  stages: [string, string, string, string]
}

export const THEMES: Record<string, Palette> = {
  Slate: {
    background: '#1c1d21', foreground: '#e7e8eb', card: '#202127', primary: '#e7e8eb',
    secondary: '#2b2d33', muted: '#232429', mutedForeground: '#8b909c', accent: '#2dd4bf',
    border: '#34363e', canvasBackground: '#16171b', nodeTitleBar: '#2b2d33', nodeBody: '#232429',
    stages: ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24'],
  },
  Midnight: {
    background: '#0c1524', foreground: '#dbe7ff', card: '#101d31', primary: '#dbe7ff',
    secondary: '#15263f', muted: '#101d31', mutedForeground: '#7f93b5', accent: '#4f9dff',
    border: '#233857', canvasBackground: '#0a1220', nodeTitleBar: '#15263f', nodeBody: '#101d31',
    stages: ['#4f9dff', '#58e1ff', '#8ef0b6', '#ffc86b'],
  },
  Paper: {
    background: '#e7e6e1', foreground: '#26262a', card: '#f8f7f3', primary: '#26262a',
    secondary: '#eeede7', muted: '#f8f7f3', mutedForeground: '#6f6d68', accent: '#2f6fdd',
    border: '#d6d4cc', canvasBackground: '#e7e6e1', nodeTitleBar: '#eeede7', nodeBody: '#f8f7f3',
    stages: ['#2f6fdd', '#7a4fd6', '#0f8a6e', '#c27a12'],
  },
}

type Stage = 0 | 1 | 2 | 3

/**
 * Classify a node into an accent-stripe stage. Only "easy "-prefixed nodes are
 * themed at all -- the Bernini/LTXV/MiniMax-fallback compatibility nodes are
 * deliberately left untouched since they're designed to blend with native
 * ComfyUI node categories, not stand out as EasyMedia nodes.
 */
function stageOf(node: { comfyClass?: string; type?: string }): Stage | null {
  const type = node.comfyClass ?? node.type ?? ''
  if (!type.toLowerCase().startsWith('easy ')) return null
  const key = type.toLowerCase()
  if (key.includes('multitrack') || key.includes('scenestudio') || key.includes('timeline')) return 0
  if (key.includes('minimax') || key.includes('h3')) return 1
  if (key.includes('image') || key.includes('audio') || key.includes('video') || key.includes('subtitle')) return 2
  return 3
}

interface ThemeableWidget {
  name?: string
  value?: unknown
}

interface ThemeableNode {
  id?: string | number
  type?: string
  comfyClass?: string
  color?: string
  bgcolor?: string
  widgets?: ThemeableWidget[]
  onDrawForeground?: (ctx: CanvasRenderingContext2D, ...rest: unknown[]) => void
  [key: string]: unknown
}

interface ThemeableGraph {
  _nodes?: ThemeableNode[]
  _groups?: { title?: string; color?: string }[]
}

interface ThemeableCanvas {
  clear_background_color?: string
  setDirty?: (fg: boolean, bg?: boolean) => void
}

let savedCanvasBackground: string | undefined
let activeTheme: string | null = null

function graphOf(app: ComfyApp): ThemeableGraph {
  return app.graph as unknown as ThemeableGraph
}

function canvasOf(app: ComfyApp): ThemeableCanvas {
  return app.canvas as unknown as ThemeableCanvas
}

function css(name: string, p: Palette): string {
  return `
[${THEME_ATTRIBUTE}="${name}"] .${CUSTOM_NODE_CLASS} {
  --background: ${p.background} !important;
  --foreground: ${p.foreground} !important;
  --card: ${p.card} !important;
  --card-foreground: ${p.foreground} !important;
  --primary: ${p.primary} !important;
  --secondary: ${p.secondary} !important;
  --secondary-foreground: ${p.foreground} !important;
  --muted: ${p.muted} !important;
  --muted-foreground: ${p.mutedForeground} !important;
  --accent: ${p.accent} !important;
  --accent-foreground: ${p.background} !important;
  --border: ${p.border} !important;
}
`
}

function installStripe(node: ThemeableNode) {
  if (node[STRIPE_MARKER]) return
  node[STRIPE_MARKER] = true
  const original = node.onDrawForeground
  node.onDrawForeground = function (this: ThemeableNode, ctx: CanvasRenderingContext2D, ...rest: unknown[]) {
    const result = original?.call(this, ctx, ...rest)
    const stageColor = this[THEMED_MARKER]
    if (typeof stageColor === 'string') {
      ctx.save()
      ctx.fillStyle = stageColor
      ctx.fillRect(0, -30, 4, 30)
      ctx.restore()
    }
    return result
  }
}

function clearNodeTheming(node: ThemeableNode) {
  if (!node[THEMED_MARKER]) return
  delete node.color
  delete node.bgcolor
  node[THEMED_MARKER] = null
}

/** Re-apply (or clear) the active theme across the current graph. */
export function applyTheme(app: ComfyApp) {
  const graph = graphOf(app)
  const canvas = canvasOf(app)
  const themeNode = (graph._nodes ?? []).find((n) => (n.comfyClass ?? n.type) === THEME_NODE_TYPE)
  const name = themeNode?.widgets?.find((w) => w.name === 'theme')?.value as string | undefined
  const palette = name && name !== DEFAULT_THEME ? THEMES[name] : null

  if (savedCanvasBackground === undefined && canvas.clear_background_color !== undefined) {
    savedCanvasBackground = canvas.clear_background_color
  }

  activeTheme = palette ? name! : null
  let style = document.getElementById(STYLE_ID)

  if (!palette) {
    style?.remove()
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
    if (canvas && savedCanvasBackground !== undefined) canvas.clear_background_color = savedCanvasBackground
    for (const node of graph._nodes ?? []) clearNodeTheming(node)
    canvas.setDirty?.(true, true)
    return
  }

  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = Object.entries(THEMES).map(([key, p]) => css(key, p)).join('\n')
  document.documentElement.setAttribute(THEME_ATTRIBUTE, name!)
  if (canvas) canvas.clear_background_color = palette.canvasBackground

  for (const node of graph._nodes ?? []) {
    const stage = stageOf(node)
    if (stage === null) continue
    node.color = palette.nodeTitleBar
    node.bgcolor = palette.nodeBody
    node[THEMED_MARKER] = palette.stages[stage]
    installStripe(node)
  }
  for (const group of graph._groups ?? []) {
    group.color = palette.accent
  }
  canvas.setDirty?.(true, true)
}

/** Call once from the extension's `setup()`. */
export function installWorkflowTheme(app: ComfyApp) {
  applyTheme(app)
}

interface ThemeNodeType {
  prototype: {
    onNodeCreated?: (...args: unknown[]) => unknown
    onRemoved?: (...args: unknown[]) => unknown
  }
}

/** Call from `beforeRegisterNodeDef` for every node type. */
export function wireWorkflowThemeNode(nodeType: ThemeNodeType, nodeData: { name?: string }, app: ComfyApp) {
  if (nodeData.name !== THEME_NODE_TYPE) return
  const prototype = nodeType.prototype
  const originalCreated = prototype.onNodeCreated
  const originalRemoved = prototype.onRemoved

  prototype.onNodeCreated = function (this: ThemeableNode, ...args: unknown[]) {
    const result = originalCreated?.apply(this, args)
    const widget = this.widgets?.find((w) => w.name === 'theme')
    if (widget) {
      const widgetWithCallback = widget as ThemeableWidget & { callback?: (value: unknown) => unknown }
      const originalCallback = widgetWithCallback.callback
      widgetWithCallback.callback = (value: unknown) => {
        const callbackResult = originalCallback?.(value)
        applyTheme(app)
        return callbackResult
      }
    }
    applyTheme(app)
    return result
  }

  prototype.onRemoved = function (this: ThemeableNode, ...args: unknown[]) {
    const result = originalRemoved?.apply(this, args)
    applyTheme(app)
    return result
  }
}

/** Call from the extension's `nodeCreated(node)` hook. */
export function themeNodeOnCreate(app: ComfyApp) {
  if (activeTheme) applyTheme(app)
}

/** Call from the extension's `afterConfigureGraph()` hook. */
export function themeAfterConfigureGraph(app: ComfyApp) {
  applyTheme(app)
}
