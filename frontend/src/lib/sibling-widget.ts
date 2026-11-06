export interface SiblingWidget {
  name?: string
  value?: unknown
  callback?: (value: unknown) => void
  hidden?: boolean
  options?: Record<string, unknown>
}

export interface SiblingWidgetNode {
  widgets?: SiblingWidget[]
  setDirtyCanvas?: (fg: boolean, bg?: boolean) => void
  onWidgetChanged?: (name: string, value: unknown, oldValue: unknown, widget: unknown) => void
  graph?: { incrementVersion?: () => void }
}

export function findSiblingWidget(node: SiblingWidgetNode, name: string): SiblingWidget | undefined {
  return node.widgets?.find((candidate) => candidate.name === name)
}

export function getSiblingWidgetValue<T>(node: SiblingWidgetNode, name: string, fallback: T): T {
  const widget = findSiblingWidget(node, name)
  return (widget?.value as T | undefined) ?? fallback
}

/** Write a value into a sibling native widget, mirroring the full sequence
 * ComfyUI itself runs when the user edits a widget directly (value, widget
 * callback, node.onWidgetChanged, graph version bump) rather than just the
 * value+callback — the graph version is what ComfyUI's workflow change
 * tracking watches to know a tab's state needs persisting, so skipping it
 * means the edit silently reverts on tab switch / reload. */
export function setSiblingWidgetValue(node: SiblingWidgetNode, name: string, value: unknown): boolean {
  const widget = findSiblingWidget(node, name)
  if (!widget) return false
  const oldValue = widget.value
  widget.value = value
  widget.callback?.(value)
  node.onWidgetChanged?.(name, value, oldValue, widget)
  node.graph?.incrementVersion?.()
  return true
}

/** Permanently hide a sibling native widget whose value is instead driven by
 * a React panel elsewhere on the node (e.g. project_name/project_save are
 * driven by ProjectBar). Does not toggle back on; call only for widgets that
 * should never show their own native row. */
export function hideSiblingWidget(node: SiblingWidgetNode, name: string): boolean {
  const widget = findSiblingWidget(node, name)
  if (!widget) return false
  widget.hidden = true
  widget.options = { ...widget.options, hidden: true }
  return true
}
