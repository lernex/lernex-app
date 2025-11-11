'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useKeyboardShortcuts, type KeyboardShortcut } from '@/lib/hooks/useKeyboardShortcuts'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'

export default function GlobalKeyboardShortcuts() {
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Define global shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      key: '?',
      shiftKey: true,
      description: 'Show keyboard shortcuts',
      category: 'General',
      action: () => setIsHelpOpen(true)
    },
    {
      key: 'Escape',
      description: 'Close modal or dialog',
      category: 'General',
      action: () => {
        // This will be handled by individual modals
        // Just here for documentation
      },
      disabled: true
    },
    {
      key: 'h',
      description: 'Go to home (For You Page)',
      category: 'Navigation',
      action: () => router.push('/fyp')
    },
    {
      key: 'g',
      description: 'Go to generate lesson',
      category: 'Navigation',
      action: () => router.push('/generate')
    },
    {
      key: 'u',
      description: 'Go to upload document',
      category: 'Navigation',
      action: () => router.push('/upload')
    },
    {
      key: 'p',
      description: 'Go to playlists',
      category: 'Navigation',
      action: () => router.push('/playlists')
    },
    {
      key: 'a',
      description: 'Go to analytics',
      category: 'Navigation',
      action: () => router.push('/analytics')
    },
    {
      key: 'l',
      description: 'Go to leaderboard',
      category: 'Navigation',
      action: () => router.push('/leaderboard')
    },
    {
      key: 'f',
      description: 'Go to friends',
      category: 'Navigation',
      action: () => router.push('/friends')
    },
    {
      key: ',',
      description: 'Go to profile settings',
      category: 'Navigation',
      action: () => router.push('/profile')
    }
  ]

  // Add all shortcuts for the help modal (including disabled ones for documentation)
  const allShortcuts: KeyboardShortcut[] = [
    ...shortcuts,
    {
      key: '1',
      description: 'Select first quiz answer',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: '2',
      description: 'Select second quiz answer',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: '3',
      description: 'Select third quiz answer',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: '4',
      description: 'Select fourth quiz answer',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: 'Enter',
      description: 'Submit quiz answer',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: 'n',
      description: 'Next quiz question',
      category: 'Quiz',
      action: () => {},
      disabled: true
    },
    {
      key: 'j',
      description: 'Next lesson (in feed)',
      category: 'Feed',
      action: () => {},
      disabled: true
    },
    {
      key: 'k',
      description: 'Previous lesson (in feed)',
      category: 'Feed',
      action: () => {},
      disabled: true
    },
    {
      key: 'e',
      description: 'Expand lesson',
      category: 'Feed',
      action: () => {},
      disabled: true
    },
    {
      key: 's',
      description: 'Save lesson',
      category: 'Feed',
      action: () => {},
      disabled: true
    }
  ]

  useKeyboardShortcuts({
    shortcuts: shortcuts.filter(s => !s.disabled),
    enabled: true,
    preventDefault: true
  })

  return (
    <KeyboardShortcutsModal
      isOpen={isHelpOpen}
      onClose={() => setIsHelpOpen(false)}
      shortcuts={allShortcuts}
    />
  )
}
