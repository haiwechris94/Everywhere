import { useEffect, useRef } from 'react'

/**
 * Accessible modal behaviour for any panel element.
 *
 * Attach the returned ref to the dialog panel (the box holding the content,
 * not the backdrop). While `open` is true the hook:
 *  - marks the panel as role="dialog" + aria-modal="true" (unless already set)
 *  - names it from its first heading via aria-labelledby (unless labelled)
 *  - moves focus into the panel, keeps Tab / Shift+Tab inside it
 *  - closes on Escape (only the top-most open dialog reacts)
 *  - returns focus to the element that opened it when it closes
 *
 * @param {boolean} open - whether the dialog is currently rendered/open
 * @param {() => void} [onClose] - called on Escape
 * @returns {import('react').MutableRefObject<HTMLElement|null>}
 */
const stack = []
let idCounter = 0

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

const focusables = (root) =>
  Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )

export function useDialog(open, onClose) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Remember the opener while rendering the opening frame: an autoFocus field
  // inside the dialog steals focus during commit, before effects run.
  const openerRef = useRef(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement
  }
  wasOpenRef.current = open

  useEffect(() => {
    if (!open) return undefined
    const panel = ref.current
    if (!panel) return undefined

    const opener = openerRef.current
    const token = {}
    stack.push(token)

    if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    if (!panel.hasAttribute('aria-labelledby') && !panel.hasAttribute('aria-label')) {
      const heading = panel.querySelector('h1, h2, h3, h4')
      if (heading) {
        if (!heading.id) heading.id = `dialog-title-${++idCounter}`
        panel.setAttribute('aria-labelledby', heading.id)
      }
    }
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')

    // Respect an autoFocus field inside the dialog; otherwise focus the panel
    // so screen readers announce the title without popping a mobile keyboard.
    if (!panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true })
    }

    const onKeyDown = (e) => {
      if (stack[stack.length - 1] !== token) return
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.stopPropagation()
          onCloseRef.current()
        }
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(panel)
      if (items.length === 0) {
        e.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      const i = stack.indexOf(token)
      if (i !== -1) stack.splice(i, 1)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [open])

  return ref
}

export default useDialog
