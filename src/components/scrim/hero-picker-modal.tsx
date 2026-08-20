import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { HEROES } from '../../../domains/scrim/shared/rules';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import { HeroGrid } from './hero-grid';

interface HeroPickerModalProps {
    disabledHeroIds?: string[];
    initialHeroIds: string[];
    mode: 'final' | 'used';
    onClose: () => void;
    onConfirm: (heroIds: string[]) => void;
}

/**
 * @description 최종 밴 또는 사용된 밴을 편집할 때만 전체 영웅 목록을 모달로 제공한다.
 */
export function HeroPickerModal({
    disabledHeroIds = [],
    initialHeroIds,
    mode,
    onClose,
    onConfirm,
}: HeroPickerModalProps) {
    const dialogRef = useDialogFocus({ onClose });
    const [selectedHeroIds, setSelectedHeroIds] = useState(initialHeroIds);
    const isFinalMode = mode === 'final';
    const canConfirm = isFinalMode ? selectedHeroIds.length === 2 : selectedHeroIds.length > 0;
    const selectedRole = isFinalMode && selectedHeroIds.length === 1
        ? HEROES.find(hero => hero.id === selectedHeroIds[0])?.role
        : undefined;
    const roleDisabledHeroIds = selectedRole
        ? HEROES
            .filter(hero => hero.role === selectedRole && !selectedHeroIds.includes(hero.id))
            .map(hero => hero.id)
        : [];
    const effectiveDisabledHeroIds = [...new Set([
        ...disabledHeroIds,
        ...roleDisabledHeroIds,
    ])];

    return (
        <motion.div
            className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/90 p-3 backdrop-blur-sm md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.section
                ref={dialogRef}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="hero-picker-title"
                tabIndex={-1}
                className="mx-auto max-w-5xl overscroll-contain rounded-2xl border border-slate-800 bg-surface-elevated p-4 shadow-2xl shadow-black/40 focus:outline-none md:p-6"
            >
                <header className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <h2 id="hero-picker-title" className="text-pretty text-xl font-bold text-white">
                            {isFinalMode ? '최종 밴 영웅 선택' : '사용된 밴 영웅 기록'}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            {isFinalMode
                                ? '서로 다른 역할군에서 영웅 2명을 선택해 주세요.'
                                : '이번 내전에서 실제로 사용한 밴 영웅을 선택해 주세요.'}
                        </p>
                    </div>
                    <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="닫기">
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>
                <HeroGrid
                    disabledHeroIds={effectiveDisabledHeroIds}
                    maxSelections={isFinalMode ? 2 : HEROES.length}
                    selectedHeroIds={selectedHeroIds}
                    onChange={setSelectedHeroIds}
                />
                <footer className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-slate-800 bg-surface-elevated/95 pt-4 backdrop-blur">
                    <span className="text-sm text-slate-400">
                        선택 {selectedHeroIds.length}{isFinalMode ? '/2' : '명'}
                    </span>
                    <div className="flex gap-2">
                        <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
                        <button
                            type="button"
                            className="btn-primary disabled:opacity-40"
                            disabled={!canConfirm}
                            onClick={() => onConfirm(selectedHeroIds)}
                        >
                            {isFinalMode ? '최종 밴 확정' : '사용 밴 저장'}
                        </button>
                    </div>
                </footer>
            </motion.section>
        </motion.div>
    );
}
