'use client'

import { ToastContainer } from './Toast'
import { useToastStore } from '@/lib/hooks/useToast'

export function ToastProvider() {
  const { toasts, dismissToast } = useToastStore()

  return <ToastContainer toasts={toasts} onDismiss={dismissToast} />
}
