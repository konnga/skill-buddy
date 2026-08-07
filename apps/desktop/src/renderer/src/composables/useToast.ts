import { shallowRef } from 'vue'

export interface ToastState {
  message: string
  actionLabel?: string
  onAction?: () => void | Promise<void>
}

const toast = shallowRef<ToastState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(state: ToastState, duration = 5000): void {
  toast.value = state
  clearTimeout(timer)
  timer = setTimeout(() => (toast.value = null), duration)
}

export function dismissToast(): void {
  clearTimeout(timer)
  toast.value = null
}

export function useToast() {
  return { toast }
}
