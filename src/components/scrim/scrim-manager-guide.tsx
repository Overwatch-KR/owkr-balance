import {
    BookOpen,
    CalendarPlus,
    ClipboardList,
    Link2,
    NotebookPen,
    Trash2,
    X,
} from 'lucide-react';
import { useDialogFocus } from '../../hooks/use-dialog-focus';

interface ScrimManagerGuideProps {
    onClose: () => void;
}

const GUIDE_ITEMS = [
    {
        description: '매칭 화면의 앞 10명을 기준으로 로스터 스냅샷을 만들고, 선택한 한국 시간 일정으로 내전을 등록합니다. 등록 뒤 현재 매칭 명단을 바꿔도 기존 기록의 로스터는 바뀌지 않습니다.',
        icon: CalendarPlus,
        title: '먼저 내전과 로스터를 등록해요',
    },
    {
        description: '왼쪽 내전 기록에서 대상을 선택한 뒤, 운영 및 링크·영웅 밴·만족도 결과·내전 후기 탭을 오가며 해당 내전만 관리합니다.',
        icon: ClipboardList,
        title: '기록을 선택해 세부 내용을 관리해요',
    },
    {
        description: '운영 및 링크 탭에서는 운영자가 참여 링크를 열고, 복사하고, 다시 만들거나 비활성화할 수 있습니다. 공개 참여 화면의 사용 방법은 이 관리자 가이드에 포함하지 않습니다.',
        icon: Link2,
        title: '참여 링크는 운영 화면에서 관리해요',
    },
    {
        description: '내전 후기 탭에는 팀 구성, 진행 중 특이점, 다음 내전에서 참고할 점을 관리자끼리 남깁니다. 저장한 내용은 해당 내전의 운영 기록으로 이어집니다.',
        icon: NotebookPen,
        title: '후기로 다음 운영에 참고할 내용을 남겨요',
    },
    {
        description: '내전 삭제는 기록을 만든 관리자만 할 수 있으며 되돌릴 수 없습니다. 삭제 전에는 날짜와 선택한 내전을 다시 확인하세요.',
        icon: Trash2,
        title: '삭제는 마지막에 신중히 진행해요',
    },
] as const;

/**
 * @description 내전 생성부터 운영 기록까지 관리자가 사용하는 화면의 범위를 요약해 안내한다.
 */
export function ScrimManagerGuide({ onClose }: ScrimManagerGuideProps) {
    const dialogRef = useDialogFocus({ onClose });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="scrim-manager-guide-title"
                tabIndex={-1}
                className="custom-scrollbar max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-400/30 bg-slate-950 p-5 shadow-2xl shadow-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:p-6"
            >
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                        <BookOpen size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-cyan-300">내전 관리 가이드</p>
                        <h2 id="scrim-manager-guide-title" className="mt-1 text-xl font-bold text-white">
                            내전 등록부터 운영 기록까지
                        </h2>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                            이 안내는 관리자 화면의 작업 흐름만 다룹니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label="내전 관리 가이드 닫기"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </div>

                <ol className="mt-6 space-y-3">
                    {GUIDE_ITEMS.map(({ description, icon: Icon, title }, index) => (
                        <li key={title} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-200">
                                <Icon size={16} aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-100">
                                    {index + 1}. {title}
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
                            </div>
                        </li>
                    ))}
                </ol>

                <div className="mt-5 flex justify-end">
                    <button type="button" onClick={onClose} className="btn-primary min-h-10 px-5 py-2 text-sm">
                        확인했어요
                    </button>
                </div>
            </section>
        </div>
    );
}
