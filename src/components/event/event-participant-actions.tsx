import { CheckCircle2, Save } from 'lucide-react';

interface EventParticipantActionsProps {
    hasSaved: boolean;
    isDirty: boolean;
    isEditing: boolean;
    isSaving: boolean;
    onCancel: () => void;
    onClear: () => void;
    onEdit: () => void;
    onSave: () => void;
    onSelectAll: () => void;
    participantCount: number;
}

/**
 * @description 이벤트 참여 명단의 편집 제어와 저장 전·후 상태를 명확히 구분해 표시한다.
 */
export function EventParticipantActions({
    hasSaved,
    isDirty,
    isEditing,
    isSaving,
    onCancel,
    onClear,
    onEdit,
    onSave,
    onSelectAll,
    participantCount,
}: EventParticipantActionsProps) {
    if (!isEditing) {
        return (
            <section className="card sticky top-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 border-slate-700/70 shadow-2xl shadow-black/30" aria-label="이벤트 참여 명단 제어">
                <div
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100"
                    role="status"
                >
                    <CheckCircle2 size={17} className="text-emerald-300" aria-hidden="true" />
                    <span><strong className="font-semibold">저장 완료</strong> · 참여 {participantCount}명</span>
                </div>
                <button type="button" className="btn-ghost" onClick={onEdit}>
                    명단 수정
                </button>
            </section>
        );
    }

    return (
        <section className="card sticky top-3 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 border-slate-700/70 shadow-2xl shadow-black/30" aria-label="이벤트 참여 명단 제어">
            <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost" disabled={isSaving} onClick={onSelectAll}>
                    전원 선택
                </button>
                <button type="button" className="btn-ghost" disabled={isSaving} onClick={onClear}>
                    선택 해제
                </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {hasSaved ? (
                    <button type="button" className="btn-ghost" disabled={isSaving} onClick={onCancel}>
                        수정 취소
                    </button>
                ) : null}
                {isDirty || isSaving ? (
                    <button
                        type="button"
                        className="btn-primary min-w-36"
                        disabled={isSaving}
                        onClick={onSave}
                    >
                        <Save size={15} className="mr-1 inline" aria-hidden="true" />
                        {isSaving ? '저장 중' : '변경사항 저장'}
                    </button>
                ) : (
                    <p className="text-sm text-slate-500" role="status">
                        {hasSaved ? '변경사항이 없습니다.' : '참여자를 선택하면 저장할 수 있습니다.'}
                    </p>
                )}
            </div>
        </section>
    );
}
