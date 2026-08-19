import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    ClipboardPaste,
    KeyRound,
    MessageSquareText,
    Pencil,
    RefreshCcw,
    Search,
    UserPlus,
    X,
    type LucideIcon,
} from 'lucide-react';
import { calculateGuideLayout, type GuideLayout } from '../../utils/guide-layout';

export type UserSheetTourStepId =
    | 'overview'
    | 'search'
    | 'quick-edit'
    | 'entry-actions'
    | 'bulk-edit'
    | 'notes'
    | 'sync';

interface UserSheetTourProps {
    hasEntries: boolean;
    onComplete: () => void;
    onDismiss: () => void;
    onOpenRules: () => void;
    onStepChange: (stepId: UserSheetTourStepId) => void;
}

interface UserSheetTourStep {
    description: string;
    emptyDescription?: string;
    fallback?: string;
    icon: LucideIcon;
    id: UserSheetTourStepId;
    target: string;
    title: string;
}

interface MeasuredTourLayout {
    layout: GuideLayout;
    stepId: UserSheetTourStepId;
}

const USER_SHEET_TOUR_STEPS: readonly UserSheetTourStep[] = [
    {
        id: 'overview',
        icon: KeyRound,
        target: '#user-sheet-overview',
        title: '시트와 현재 매칭 명단을 구분해요',
        description: '유저 시트는 운영진이 함께 관리하는 공유 목록입니다. 현재 내전의 참가자와 티어는 참가자 작업실에서 관리하고, 여기서는 Discord ID를 기준으로 유저 정보를 유지합니다.',
    },
    {
        id: 'search',
        icon: Search,
        target: '#user-sheet-search',
        fallback: '#user-sheet-browse-tools',
        title: '필요한 유저를 빠르게 찾아요',
        description: '이름, BattleTag, 역할 티어, 특이사항으로 검색한 뒤 목록에서 유저를 선택하면 오른쪽에 상세 정보가 열립니다.',
        emptyDescription: '아직 등록된 유저가 없어요. 먼저 유저를 추가하면 이름, BattleTag, 역할 티어, 특이사항으로 검색할 수 있습니다.',
    },
    {
        id: 'quick-edit',
        icon: Pencil,
        target: '#user-sheet-quick-edit',
        fallback: '#user-sheet-actions',
        title: '한 명은 상세 화면에서 수정해요',
        description: '선택한 유저의 공용 정보 수정을 누르면 이름, BattleTag, 역할 티어와 공용 특이사항을 수정합니다. 개인 운영 메모는 별도 저장 버튼으로 관리하며, 이 화면의 티어 수정은 현재 매칭 명단을 바꾸지 않습니다.',
        emptyDescription: '유저를 등록한 뒤 목록에서 선택하면 공용 정보 수정과 개인 운영 메모 저장을 서로 분리해 관리할 수 있습니다.',
    },
    {
        id: 'entry-actions',
        icon: UserPlus,
        target: '#user-sheet-actions',
        title: '추가와 전체 편집을 구분해요',
        description: '한 명을 새로 등록할 때는 유저 추가, 여러 명을 한꺼번에 정리할 때는 전체 편집을 사용하세요. 시트에 등록해도 이번 내전에 자동으로 참가시키지는 않습니다.',
    },
    {
        id: 'bulk-edit',
        icon: ClipboardPaste,
        target: '#user-sheet-import',
        fallback: '#user-sheet-editor',
        title: '명단과 표를 한 번에 반영해요',
        description: 'Discord 명단 가져오기로 신규 유저를 추가하거나, Discord ID를 포함한 Google Sheets의 7개 열을 편집 표 첫 셀에 붙여넣을 수 있습니다. ID가 없는 행은 저장할 수 없으며, 가이드는 저장을 실행하지 않습니다.',
    },
    {
        id: 'notes',
        icon: MessageSquareText,
        target: '#user-sheet-notes',
        fallback: '#user-sheet-browse-tools',
        title: '공용 정보와 개인 메모를 나눠요',
        description: '특이사항은 공용 정보 저장으로, 개인 운영 메모는 메모 전용 저장으로 반영됩니다. 개인 메모를 저장해도 공용 티어와 특이사항은 변경되지 않습니다.',
        emptyDescription: '유저 상세 화면에서는 모든 관리자에게 보이는 특이사항과 작성자 본인만 보는 개인 운영 메모를 서로 다른 저장 버튼으로 관리합니다.',
    },
    {
        id: 'sync',
        icon: RefreshCcw,
        target: '#user-sheet-refresh',
        fallback: '#user-sheet-header-actions',
        title: '최신 데이터를 확인하고 마쳐요',
        description: '시트가 열려 있으면 1분마다 자동으로 확인하고, 창으로 돌아오거나 새로고침을 누르면 즉시 갱신합니다. 여러 운영자가 함께 작업했다면 전체 편집 전에 새로고침해 충돌을 줄여 주세요.',
    },
] as const;

const PANEL_MAX_WIDTH = 400;

const areLayoutsEqual = (first: GuideLayout | null, second: GuideLayout): boolean => (
    first?.placement === second.placement
    && Math.abs(first.arrowOffset - second.arrowOffset) < 1
    && Math.abs(first.panel.left - second.panel.left) < 1
    && Math.abs(first.panel.top - second.panel.top) < 1
    && Math.abs(first.panel.width - second.panel.width) < 1
    && Math.abs(first.spotlight.left - second.spotlight.left) < 1
    && Math.abs(first.spotlight.top - second.spotlight.top) < 1
    && Math.abs(first.spotlight.width - second.spotlight.width) < 1
    && Math.abs(first.spotlight.height - second.spotlight.height) < 1
);

const getVisibleTarget = (step: UserSheetTourStep): HTMLElement | null => {
    const preferredTarget = document.querySelector<HTMLElement>(step.target);
    if (preferredTarget && preferredTarget.offsetHeight > 0) return preferredTarget;
    if (!step.fallback) return null;
    const fallbackTarget = document.querySelector<HTMLElement>(step.fallback);
    return fallbackTarget && fallbackTarget.offsetHeight > 0 ? fallbackTarget : null;
};

const measureTourLayout = (
    target: HTMLElement,
    panel: HTMLElement,
): GuideLayout => calculateGuideLayout(
    target.getBoundingClientRect(),
    {
        width: Math.min(PANEL_MAX_WIDTH, window.innerWidth - 32),
        height: panel.offsetHeight,
    },
    {
        width: window.innerWidth,
        height: window.innerHeight,
    },
);

/**
 * @description 유저 시트의 실제 화면과 편집 흐름을 7단계로 강조해 안내한다.
 */
export function UserSheetTour({
    hasEntries,
    onComplete,
    onDismiss,
    onOpenRules,
    onStepChange,
}: UserSheetTourProps) {
    const panelRef = useRef<HTMLElement>(null);
    const lastNotifiedStepRef = useRef<UserSheetTourStepId | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [measuredLayout, setMeasuredLayout] = useState<MeasuredTourLayout | null>(null);
    const step = USER_SHEET_TOUR_STEPS[stepIndex];
    const layout = measuredLayout?.stepId === step.id ? measuredLayout.layout : null;
    const isFirstStep = stepIndex === 0;
    const isLastStep = stepIndex === USER_SHEET_TOUR_STEPS.length - 1;
    const description = !hasEntries && step.emptyDescription
        ? step.emptyDescription
        : step.description;

    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onDismiss();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onDismiss]);

    useEffect(() => {
        if (lastNotifiedStepRef.current === step.id) return;
        lastNotifiedStepRef.current = step.id;
        onStepChange(step.id);
    }, [onStepChange, step.id]);

    useEffect(() => {
        let target: HTMLElement | null = null;
        let frameId = 0;
        let mutationObserver: MutationObserver | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let isTracking = false;

        const updateLayout = () => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                const panel = panelRef.current;
                if (!target || !panel) return;
                const nextLayout = measureTourLayout(target, panel);
                setMeasuredLayout(current => (
                    current?.stepId === step.id && areLayoutsEqual(current.layout, nextLayout)
                        ? current
                        : { layout: nextLayout, stepId: step.id }
                ));
            });
        };

        const startTracking = () => {
            if (isTracking) return true;
            const nextTarget = getVisibleTarget(step);
            if (!nextTarget) return false;

            target = nextTarget;
            isTracking = true;
            nextTarget.scrollIntoView({
                behavior: 'auto',
                block: 'center',
                inline: 'nearest',
            });
            updateLayout();

            window.addEventListener('scroll', updateLayout, { capture: true, passive: true });
            window.addEventListener('resize', updateLayout, { passive: true });
            resizeObserver = new ResizeObserver(updateLayout);
            resizeObserver.observe(nextTarget);
            if (panelRef.current) resizeObserver.observe(panelRef.current);
            mutationObserver?.disconnect();
            return true;
        };

        frameId = window.requestAnimationFrame(() => {
            if (startTracking()) return;
            mutationObserver = new MutationObserver(startTracking);
            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
            startTracking();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('scroll', updateLayout, true);
            window.removeEventListener('resize', updateLayout);
            mutationObserver?.disconnect();
            resizeObserver?.disconnect();
        };
    }, [step]);

    const Icon = step.icon;
    const panelStyle: CSSProperties = {
        transform: `translate3d(${layout?.panel.left ?? 16}px, ${layout?.panel.top ?? 16}px, 0)`,
        visibility: layout ? 'visible' : 'hidden',
        width: layout?.panel.width ?? `min(${PANEL_MAX_WIDTH}px, calc(100vw - 2rem))`,
    };
    const arrowStyle = layout
        ? { '--guide-arrow-offset': `${layout.arrowOffset}px` } as CSSProperties
        : undefined;
    const handleStepIndexChange = (nextStepIndex: number) => {
        setMeasuredLayout(null);
        setStepIndex(nextStepIndex);
    };

    return (
        <>
            {layout && (
                <>
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed inset-x-0 top-0 z-[100]"
                        style={{ height: layout.spotlight.top, pointerEvents: 'auto' }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed left-0 z-[100]"
                        style={{
                            top: layout.spotlight.top,
                            width: layout.spotlight.left,
                            height: layout.spotlight.height,
                            pointerEvents: 'auto',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed right-0 z-[100]"
                        style={{
                            top: layout.spotlight.top,
                            left: layout.spotlight.right,
                            height: layout.spotlight.height,
                            pointerEvents: 'auto',
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed inset-x-0 bottom-0 z-[100]"
                        style={{ top: layout.spotlight.bottom, pointerEvents: 'auto' }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-spotlight fixed z-[110]"
                        style={{
                            top: layout.spotlight.top,
                            left: layout.spotlight.left,
                            width: layout.spotlight.width,
                            height: layout.spotlight.height,
                        }}
                    />
                </>
            )}

            <div
                className="fixed left-0 top-0 z-[120] will-change-transform transition-transform duration-300 ease-out"
                style={panelStyle}
            >
                {layout && (
                    <span
                        aria-hidden="true"
                        className="guide-arrow"
                        data-placement={layout.placement}
                        style={arrowStyle}
                    />
                )}
                <motion.aside
                    ref={panelRef}
                    id="user-sheet-tour"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="user-sheet-tour-title"
                    tabIndex={-1}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="relative max-h-[min(70dvh,32rem)] w-full overscroll-contain overflow-y-auto rounded-2xl border border-cyan-400/35 bg-slate-950/95 p-4 shadow-2xl shadow-black/70 backdrop-blur-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:p-5"
                >
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                            <Icon size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1" aria-live="polite">
                            <p className="text-xs font-semibold text-cyan-300">
                                시트 가이드 · {stepIndex + 1}/{USER_SHEET_TOUR_STEPS.length}
                            </p>
                            <h2 id="user-sheet-tour-title" className="mt-1 text-pretty text-base font-bold text-white sm:text-lg">
                                {step.title}
                            </h2>
                            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-400">
                                {description}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                            aria-label="시트 가이드 닫기"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="mt-4 flex gap-1.5" aria-hidden="true">
                        {USER_SHEET_TOUR_STEPS.map(({ id }, index) => (
                            <span
                                key={id}
                                className={`h-1 flex-1 rounded-full transition-colors ${
                                    index <= stepIndex ? 'bg-cyan-400' : 'bg-slate-700'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => handleStepIndexChange(stepIndex - 1)}
                            disabled={isFirstStep}
                            className="btn-ghost inline-flex min-h-9 items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronLeft size={14} aria-hidden="true" />
                            이전
                        </button>
                        {isLastStep && (
                            <button
                                type="button"
                                onClick={onOpenRules}
                                className="btn-ghost inline-flex min-h-9 items-center gap-1 px-3 py-2 text-xs"
                            >
                                <BookOpen size={14} aria-hidden="true" />
                                전체 규칙 보기
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={isLastStep
                                ? onComplete
                                : () => handleStepIndexChange(stepIndex + 1)}
                            className="btn-primary inline-flex min-h-9 items-center gap-1 px-3 py-2 text-xs"
                        >
                            {isLastStep ? '완료' : '다음'}
                            {!isLastStep && <ChevronRight size={14} aria-hidden="true" />}
                        </button>
                    </div>
                </motion.aside>
            </div>
        </>
    );
}
