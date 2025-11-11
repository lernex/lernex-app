import { useToast } from './useToast'
import { useRef } from 'react'

interface UndoableActionOptions<T> {
  action: () => Promise<void> | void
  undo: (data: T) => Promise<void> | void
  message: string
  undoLabel?: string
  duration?: number
}

export function useUndoableAction<T = unknown>() {
  const toast = useToast()
  const undoTimeoutRef = useRef<NodeJS.Timeout>()
  const dataRef = useRef<T>()

  const executeWithUndo = async (
    data: T,
    options: UndoableActionOptions<T>
  ) => {
    const {
      action,
      undo,
      message,
      undoLabel = 'Undo',
      duration = 5000
    } = options

    // Store data for potential undo
    dataRef.current = data

    // Execute the action
    await action()

    // Show toast with undo button
    const toastId = toast.success(message, undefined, {
      label: undoLabel,
      onClick: async () => {
        // Clear the auto-commit timeout
        if (undoTimeoutRef.current) {
          clearTimeout(undoTimeoutRef.current)
        }

        // Execute undo
        if (dataRef.current !== undefined) {
          await undo(dataRef.current)
          toast.info('Action undone')
        }

        // Dismiss the original toast
        toast.dismiss(toastId)
      }
    })

    // Auto-commit after duration (clear undo option)
    undoTimeoutRef.current = setTimeout(() => {
      dataRef.current = undefined
    }, duration)
  }

  return { executeWithUndo }
}
