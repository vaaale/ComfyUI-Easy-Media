import { useLayoutEffect, type RefObject } from 'react'

/**
 * Translate vertical wheel/trackpad scroll into horizontal `scrollLeft` on a
 * container, and intercept it with a non-passive native listener so the
 * gesture doesn't fall through to the ComfyUI canvas's own zoom/pan handling
 * (React's synthetic onWheel is passive, so preventDefault() there is a
 * no-op). Ctrl/Meta+wheel (pinch-zoom) and anything inside a
 * `data-capture-wheel="true"` element are left alone.
 */
export function useWheelHorizontalScroll(containerRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel(event: WheelEvent) {
      if (!container || container.scrollWidth <= container.clientWidth || event.ctrlKey || event.metaKey) return
      if (event.target instanceof Element && event.target.closest('[data-capture-wheel="true"]')) return

      event.preventDefault()

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientWidth : 1
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      container.scrollLeft = Math.max(0, Math.min(
        container.scrollWidth - container.clientWidth,
        container.scrollLeft + delta * unit,
      ))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [containerRef])
}
