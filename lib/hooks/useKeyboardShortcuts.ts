import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  description: string
  action: () => void
  category?: string
  disabled?: boolean
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
  preventDefault?: boolean
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  preventDefault = true
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts)

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Don't trigger shortcuts when user is typing in an input
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow certain global shortcuts even in inputs (like Escape)
        if (event.key !== 'Escape') {
          return
        }
      }

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.disabled) continue

        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = !!shortcut.ctrlKey === event.ctrlKey
        const shiftMatch = !!shortcut.shiftKey === event.shiftKey
        const altMatch = !!shortcut.altKey === event.altKey
        const metaMatch = !!shortcut.metaKey === event.metaKey

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          if (preventDefault) {
            event.preventDefault()
          }
          shortcut.action()
          break
        }
      }
    },
    [enabled, preventDefault]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}

export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = []

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform)

  if (shortcut.ctrlKey) parts.push(isMac ? '⌘' : 'Ctrl')
  if (shortcut.altKey) parts.push(isMac ? '⌥' : 'Alt')
  if (shortcut.shiftKey) parts.push(isMac ? '⇧' : 'Shift')
  if (shortcut.metaKey) parts.push('⌘')

  // Format the key nicely
  let key = shortcut.key
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp') key = '↑'
  else if (key === 'ArrowDown') key = '↓'
  else if (key === 'ArrowLeft') key = '←'
  else if (key === 'ArrowRight') key = '→'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)

  return parts.join(isMac ? '' : '+')
}
