/** Tab stops in the rendered tree, including open shadow roots and slots. */
export function shadowTabStops(root: Element | ShadowRoot): HTMLElement[] {
  const items: HTMLElement[] = []
  const visit = (element: Element) => {
    if (element instanceof HTMLElement) {
      if (element.inert || element.hidden) return
      if (element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length &&
          getComputedStyle(element).visibility !== 'hidden') items.push(element)
    }
    if (element.shadowRoot) {
      if (element.hasAttribute('tabindex') && (element as HTMLElement).tabIndex < 0) return
      walk(element.shadowRoot.children)
    } else if (element instanceof HTMLSlotElement) {
      const assigned = element.assignedElements({ flatten: true })
      walk(assigned.length ? assigned : element.children)
    } else walk(element.children)
  }
  const walk = (elements: HTMLCollection | Element[]) => { for (const element of elements) visit(element) }
  walk(root.children)
  return items
}
