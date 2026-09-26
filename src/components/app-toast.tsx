import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ToastState } from '../hooks/use-toast';

interface AppToastProps {
    onDismiss: () => void;
    toast: ToastState;
}

/**
 * @description 성공·오류·안내 메시지와 선택적 후속 동작을 화면 우측 상단에 표시한다.
 */
export const AppToast = ({ onDismiss, toast }: AppToastProps) => (
    <motion.div
        initial={{ opacity: 0, x: 16, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 12, scale: 0.97 }}
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[105] flex w-[min(440px,calc(100vw-2rem))] items-center gap-2 rounded-lg border py-3 pl-4 pr-2 text-sm font-medium shadow-xl shadow-black/30 ${
            toast.type === 'error'
                ? 'border-rose-500/30 bg-rose-950/90 text-rose-100'
                : toast.type === 'info'
                    ? 'border-sky-500/30 bg-sky-950/90 text-sky-100'
                    : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100'
        }`}
        role={toast.type === 'error' ? 'alert' : 'status'}
        aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
        {toast.type === 'error'
            ? <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
            : toast.type === 'info'
                ? <Info size={16} className="shrink-0" aria-hidden="true" />
                : <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
        <span className="min-w-0 flex-1 break-words">{toast.message}</span>
        {toast.action && (
            <button
                type="button"
                onClick={() => {
                    const action = toast.action;
                    if (!action) return;
                    onDismiss();
                    action.onClick();
                }}
                className="min-h-8 shrink-0 whitespace-nowrap rounded-md border border-current/30 px-2.5 text-xs font-semibold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
                {toast.action.label}
            </button>
        )}
        <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-current/60 transition-colors hover:bg-white/10 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="알림 닫기"
        >
            <X size={15} aria-hidden="true" />
        </button>
    </motion.div>
);
