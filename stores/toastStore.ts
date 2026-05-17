import { create } from 'zustand';

export type ToastType = 'error' | 'info' | 'success';

export interface ToastAction {
  labelKey?: string;
  label?: string;
  href?: string;
  onClick?: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  titleKey?: string;
  title?: string;
  messageKey?: string;
  message?: string;
  action?: ToastAction;
  durationMs: number;
}

export interface ShowToastInput {
  type?: ToastType;
  titleKey?: string;
  title?: string;
  messageKey?: string;
  message?: string;
  action?: ToastAction;
  durationMs?: number;
  dedupeKey?: string;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (input: ShowToastInput) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

const DEFAULT_DURATION = 5000;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (input) => {
    const id = input.dedupeKey ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = get().toasts.find((t) => t.id === id);
    if (existing) return id;
    const item: ToastItem = {
      id,
      type: input.type ?? 'info',
      titleKey: input.titleKey,
      title: input.title,
      messageKey: input.messageKey,
      message: input.message,
      action: input.action,
      durationMs: input.durationMs ?? DEFAULT_DURATION,
    };
    set((s) => ({ toasts: [...s.toasts, item] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearAllToasts: () => set({ toasts: [] }),
}));
