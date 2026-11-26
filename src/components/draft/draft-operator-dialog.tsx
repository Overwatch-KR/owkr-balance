import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/use-dialog-focus';

export function DraftOperatorDialog({ children, onClose, title = '밴픽 운영·참가자 현황', closeLabel = '운영 현황 닫기' }: {
  children: ReactNode; onClose: () => void; title?: string; closeLabel?: string;
}) {
  const ref = useDialogFocus({ onClose });
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm">
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className="draft-operator-dialog max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-700 bg-surface-elevated p-4 focus:outline-none sm:p-5">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2"><h2 className="font-semibold">{title}</h2>
        <button type="button" className="btn-ghost btn-icon-sm" aria-label={closeLabel} onClick={onClose}><X size={17} /></button></div>
      {children}
    </section>
  </div>;
}
