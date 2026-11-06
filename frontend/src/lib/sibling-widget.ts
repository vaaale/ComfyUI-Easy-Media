export interface SiblingWidget {
  name?: string
  value?: unknown
  callback?: (value: unknown) => void
}

export interface SiblingWidgetNode {
  widgets?: SiblingWidget[]
  setDirtyCanvas?: (fg: boolean, bg?: boolean) => void
}

export function findSiblingWidget(node: SiblingWidgetNode, name: string): SiblingWidget | undefined {
  return node.widgets?.find((candidate) => candidate.name === name)
}

export function getSiblingWidgetValue<T>(node: SiblingWidgetNode, name: string, fallback: T): T {
  const widget = findSiblingWidget(node, name)
  return (widget?.value as T | undefined) ?? fallback
}

/** Write a value into a sibling native widget and fire its callback, mirroring
 * how ComfyUI itself updates a widget when the user edits it directly. */
export function setSiblingWidgetValue(node: SiblingWidgetNode, name: string, value: unknown): boolean {
  const widget = findSiblingWidget(node, name)
  if (!widget) return false
  widget.value = value
  widget.callback?.(value)
  return true
}
