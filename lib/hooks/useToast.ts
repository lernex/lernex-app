import { create } from 'zustand'
import type { Toast, ToastType } from '@/components/ui/Toast'

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  dismissToast: (id: string) => void
  clearAllToasts: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = { ...toast, id }

    set((state) => ({
      toasts: [...state.toasts, newToast]
    }))

    // Auto-dismiss after duration (default 5 seconds)
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id)
        }))
      }, duration)
    }

    return id
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    })),
  clearAllToasts: () => set({ toasts: [] })
}))

export function useToast() {
  const { addToast, dismissToast, clearAllToasts } = useToastStore()

  const toast = {
    success: (message: string, description?: string, action?: Toast['action']) =>
      addToast({ type: 'success', message, description, action }),
    error: (message: string, description?: string, action?: Toast['action']) =>
      addToast({ type: 'error', message, description, action }),
    info: (message: string, description?: string, action?: Toast['action']) =>
      addToast({ type: 'info', message, description, action }),
    warning: (message: string, description?: string, action?: Toast['action']) =>
      addToast({ type: 'warning', message, description, action }),
    custom: (toast: Omit<Toast, 'id'>) => addToast(toast),
    dismiss: dismissToast,
    clear: clearAllToasts
  }

  return toast
}
