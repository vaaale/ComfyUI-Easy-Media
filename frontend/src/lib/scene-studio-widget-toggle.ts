const NODE_NAME = 'easy sceneStudio'
const ANCHOR_WIDGET_NAME = 'enhancer_enabled'

interface ToggleableWidget {
  name?: string
  value?: unknown
  hidden?: boolean
  options?: Record<string, unknown>
  callback?: (value: unknown, ...rest: unknown[]) => void
}

interface ToggleableNode {
  widgets?: ToggleableWidget[]
  size?: [number, number]
  onNodeCreated?: (...args: unknown[]) => void
  onConfigure?: (...args: unknown[]) => void
  computeSize?: () => [number, number]
  setSize?: (size: [number, number]) => void
  setDirtyCanvas?: (fg: boolean, bg?: boolean) => void
  graph?: { setDirtyCanvas?: (fg: boolean, bg?: boolean) => void }
}

interface ToggleableNodeType {
  prototype: object
}

function setWidgetVisible(widget: ToggleableWidget, visible: boolean) {
  widget.hidden = !visible
  widget.options = { ...widget.options, hidden: !visible }
}

function applyEnhancerVisibility(node: ToggleableNode) {
  const widgets = node.widgets
  if (!widgets) return
  const anchorIndex = widgets.findIndex((widget) => widget.name === ANCHOR_WIDGET_NAME)
  if (anchorIndex < 0) return
  const enabled = widgets[anchorIndex].value === true
  for (let index = anchorIndex + 1; index < widgets.length; index += 1) {
    setWidgetVisible(widgets[index], enabled)
  }
  // Only ever adjust height: computeSize() recalculates width from the
  // widget label set alone, ignoring the DOM-rendered editor's actual
  // content width, and would otherwise collapse the node horizontally.
  const currentWidth = node.size?.[0]
  const computed = node.computeSize?.()
  if (computed && currentWidth !== undefined) {
    node.setSize?.([currentWidth, computed[1]])
  }
  node.setDirtyCanvas?.(true, true)
  node.graph?.setDirtyCanvas?.(true, true)
}

/**
 * Collapse Scene Studio's prompt-enhancer fields (model/seed/api account) into
 * a single row until enhancer_enabled is turned on, since they are otherwise
 * always-visible rows that are irrelevant when the enhancer is off.
 */
export function installSceneStudioWidgetToggle(
  nodeType: ToggleableNodeType,
  nodeData: { name?: string },
) {
  if (nodeData.name !== NODE_NAME) return
  const prototype = nodeType.prototype as ToggleableNode
  const originalCreated = prototype.onNodeCreated
  const originalConfigure = prototype.onConfigure

  prototype.onNodeCreated = function onSceneStudioNodeCreated(this: ToggleableNode, ...args: unknown[]) {
    originalCreated?.apply(this, args)
    const anchor = this.widgets?.find((widget) => widget.name === ANCHOR_WIDGET_NAME)
    if (anchor) {
      const originalCallback = anchor.callback
      anchor.callback = (value: unknown, ...rest: unknown[]) => {
        originalCallback?.(value, ...rest)
        applyEnhancerVisibility(this)
      }
    }
    applyEnhancerVisibility(this)
  }

  prototype.onConfigure = function onSceneStudioConfigure(this: ToggleableNode, ...args: unknown[]) {
    originalConfigure?.apply(this, args)
    applyEnhancerVisibility(this)
  }
}
