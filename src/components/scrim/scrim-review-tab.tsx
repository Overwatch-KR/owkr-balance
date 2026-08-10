import { useEffect, useState } from 'react';
import { NotebookPen, Save } from 'lucide-react';
import type { ScrimRecord } from '../../types/scrim';

interface ScrimReviewTabProps {
    onSave: (adminReview: string) => Promise<void>;
    scrim: ScrimRecord;
}

/**
 * @description 관리자가 내전의 운영 특이점과 후기를 작성하고 수정 이력을 확인하게 한다.
 */
export function ScrimReviewTab({ onSave, scrim }: ScrimReviewTabProps) {
    const [draft, setDraft] = useState(scrim.adminReview ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const savedReview = scrim.adminReview ?? '';
    const isDirty = draft.trim() !== savedReview;

    useEffect(() => {
        setDraft(scrim.adminReview ?? '');
    }, [scrim.adminReview, scrim.id]);

    const save = async () => {
        setIsSaving(true);
        try {
            await onSave(draft);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="card" role="tabpanel" id="scrim-panel-review" aria-labelledby="scrim-tab-review">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                    <NotebookPen size={19} aria-hidden="true" />
                </span>
                <div>
                    <h2 className="text-lg font-semibold text-white">내전 후기 및 운영 기록</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        팀 구성, 진행 중 특이점, 다음 내전에서 참고할 내용을 관리자끼리 기록합니다.
                    </p>
                </div>
            </div>
            <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium text-slate-200">관리자 기록</span>
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-1.5 transition focus-within:border-violet-400/70 focus-within:ring-2 focus-within:ring-violet-400/15">
                    <textarea
                        className="min-h-64 w-full resize-y rounded-lg bg-transparent px-3 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-slate-600"
                        name="admin-review"
                        autoComplete="off"
                        value={draft}
                        onChange={event => setDraft(event.target.value)}
                        maxLength={4_000}
                        placeholder="예: 2세트 이후 역할 변경, 진행 지연 원인, 다음 내전에서 유지하거나 바꿀 점…"
                    />
                    <div className="flex items-center justify-between px-2 pb-1 text-xs text-slate-600">
                        <span>
                            {scrim.adminReviewUpdatedAt && scrim.adminReviewUpdatedBy
                                ? `마지막 수정 · ${scrim.adminReviewUpdatedBy} · ${new Date(scrim.adminReviewUpdatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
                                : '아직 작성된 기록이 없습니다.'}
                        </span>
                        <span>{draft.length}/4000</span>
                    </div>
                </div>
            </label>
            <div className="mt-4 flex justify-end">
                <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
                    disabled={!isDirty || isSaving}
                    onClick={() => void save()}
                >
                    <Save size={15} aria-hidden="true" />
                    {isSaving ? '저장 중…' : '후기 저장'}
                </button>
            </div>
        </section>
    );
}
