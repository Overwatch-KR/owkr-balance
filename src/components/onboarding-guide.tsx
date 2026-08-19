import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeftRight,
    BarChart3,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Copy,
    Layers3,
    ListChecks,
    MessageSquareText,
    Shuffle,
    User,
    Users,
    X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { calculateGuideLayout } from '../utils/guide-layout';
import type { GuideLayout } from '../utils/guide-layout';
import { GUIDE_STEP_IDS } from '../utils/guide-progress';
import type { GuideStepId, GuideVariant } from '../utils/guide-progress';

interface OnboardingGuideProps {
    initialStep?: GuideStepId;
    isWorking?: boolean;
    onComplete?: () => void;
    onDismiss: () => void;
    onInterrupt?: () => void;
    onStepChange?: (step: GuideStepId) => void;
    variant: GuideVariant;
}

interface GuideStep {
    description: string;
    fallback?: string;
    icon: LucideIcon;
    id: GuideStepId;
    target: string;
    title: string;
}

interface MeasuredGuideLayout {
    layout: GuideLayout;
    stepId: GuideStepId;
}

const START_GUIDE_STEPS: readonly GuideStep[] = [
    {
        id: 'start-workspace',
        icon: CheckCircle2,
        target: '#participant-workspace-header',
        title: '참가자 입력은 작업실에서 시작해요',
        description: '명단을 추가하거나 수정하면 이 브라우저에 30분 동안 바로 저장됩니다. 10명을 채운 뒤 팀 편성 화면으로 이동하면 팀 배정을 시작할 수 있어요.',
    },
    {
        id: 'start-discord',
        icon: MessageSquareText,
        target: '#discord-input-tab',
        title: '채팅 명단을 한 번에 가져오세요',
        description: '디스코드에서 배틀태그와 역할별 티어가 적힌 채팅을 복사해 여러 참가자를 한 번에 추가할 수 있습니다.',
    },
    {
        id: 'start-manual',
        icon: User,
        target: '#manual-input-tab',
        title: '한 명씩 직접 입력할 수도 있어요',
        description: '배틀태그와 탱커·딜러·힐러 티어를 입력하고 선호·비선호 역할을 선택할 수 있습니다.',
    },
    {
        id: 'start-mentions',
        icon: ListChecks,
        target: '#participant-check-tab',
        title: '참여 대조로 명단 오류를 찾으세요',
        description: '공지의 디스코드 멘션을 붙여넣으면 미입력자와 공지에 없는 명단 참가자를 함께 찾아 바로 정리할 수 있습니다.',
    },
    {
        id: 'start-roster',
        icon: Users,
        target: '#player-management',
        title: '참가자 10명과 대기열을 관리하세요',
        description: '명단이 비어 있으면 가이드용 참가자 10명을 자동으로 구성합니다. 11번째부터는 대기열에 들어가며, 참가자를 삭제하면 대기열의 첫 사람이 자동으로 올라옵니다.',
    },
    {
        id: 'start-continue',
        icon: ChevronRight,
        target: '#participant-next-step',
        title: '준비가 끝나면 팀 편성으로 이어가세요',
        description: '참가자 10명이 준비되면 이 영역의 팀 편성 화면으로 이동 버튼을 누르세요. 저장 버튼을 따로 누를 필요는 없습니다.',
    },
    {
        id: 'start-matching',
        icon: Shuffle,
        target: '#matching-action',
        title: '팀 자동 배정을 실행하세요',
        description: '팀 편성 화면에서 강조된 팀 자동 배정 버튼을 눌러주세요. 역할 선호와 티어 차이를 고려해 여러 팀 조합을 계산합니다.',
    },
] as const;

const RESULT_GUIDE_STEPS: readonly GuideStep[] = [
    {
        id: 'result-summary',
        icon: BarChart3,
        target: '#balance-summary',
        title: '전체 밸런스를 먼저 확인하세요',
        description: '총점 차이와 탱커·딜러·힐러의 맞대결 차이를 보고 어느 팀이 얼마나 앞서는지 확인합니다.',
    },
    {
        id: 'result-preferences',
        icon: Shuffle,
        target: '#matching-preference-option',
        title: '선호 무시 옵션은 필요할 때만 사용하세요',
        description: '선호 역할 이탈을 후보 평가에서 제외해 다른 조합을 찾습니다. 비선호 역할은 계속 피하므로, 기본 결과가 마음에 들지 않을 때만 켜 보세요.',
    },
    {
        id: 'result-exceptions',
        icon: ListChecks,
        target: '#balance-exceptions',
        title: '배정 예외를 확인하세요',
        description: '선호 역할 이탈, 비선호 배정, 미배치 역할 인원이 있다면 실제 플레이가 가능한 구성인지 확인합니다.',
    },
    {
        id: 'result-alternatives',
        icon: Layers3,
        target: '#alternative-results',
        fallback: '#match-result',
        title: '다른 팀 조합을 바로 비교하세요',
        description: '가이드가 첫 번째 대안 조합을 자동으로 적용합니다. 참가자 구성과 총점 차이가 즉시 갱신되는 것을 확인할 수 있습니다.',
    },
    {
        id: 'result-swap',
        icon: ArrowLeftRight,
        target: '#matchup-tank-row',
        fallback: '#matchup-table',
        title: '필요한 자리만 바로 바꾸세요',
        description: '강조된 탱커 행에서 양 팀 선수가 실제로 자리를 바꾸는 모습을 확인하세요. 팀 총점과 역할별 밸런스도 함께 다시 계산됩니다.',
    },
    {
        id: 'result-share',
        icon: Copy,
        target: '#result-share-controls',
        fallback: '#match-result',
        title: '완성된 결과를 공유하세요',
        description: '필요하면 전체 티어 표시를 직접 켜 세부 정보를 확인하고, 이미지 복사 버튼으로 완성된 결과를 디스코드에 공유할 수 있습니다.',
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

const getVisibleTarget = (step: GuideStep): HTMLElement | null => {
    const preferredTarget = document.querySelector<HTMLElement>(step.target);
    const fallbackTarget = step.fallback
        ? document.querySelector<HTMLElement>(step.fallback)
        : null;
    return preferredTarget && preferredTarget.offsetHeight > 0
        ? preferredTarget
        : fallbackTarget ?? preferredTarget;
};

const measureGuideLayout = (
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
 * @description 현재 작업 단계의 실제 화면 영역을 강조하며 입력 또는 결과 활용법을 한 단계씩 안내한다.
 */
export const OnboardingGuide = ({
    initialStep,
    isWorking = false,
    onComplete,
    onDismiss,
    onInterrupt,
    onStepChange,
    variant,
}: OnboardingGuideProps) => {
    const steps = variant === 'result' ? RESULT_GUIDE_STEPS : START_GUIDE_STEPS;
    const initialStepIndex = initialStep
        ? GUIDE_STEP_IDS[variant].indexOf(initialStep)
        : 0;
    const panelRef = useRef<HTMLElement>(null);
    const lastNotifiedStepRef = useRef<GuideStepId | null>(null);
    const [stepIndex, setStepIndex] = useState(Math.max(initialStepIndex, 0));
    const [measuredLayout, setMeasuredLayout] = useState<MeasuredGuideLayout | null>(null);
    const step = steps[stepIndex];
    const layout = measuredLayout?.stepId === step.id ? measuredLayout.layout : null;
    const isFirstStep = stepIndex === 0;
    const isLastStep = stepIndex === steps.length - 1;
    const isExternalActionStep = step.id === 'start-matching';

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
        if (!onInterrupt) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const eventTarget = event.target;
            if (!(eventTarget instanceof Node)) return;
            if (panelRef.current?.contains(eventTarget)) return;

            const targetElement = eventTarget instanceof Element
                ? eventTarget
                : eventTarget.parentElement;
            if (targetElement?.closest('[data-guide-control="true"]')) return;
            if (
                step.id === 'start-matching'
                && getVisibleTarget(step)?.contains(eventTarget)
            ) return;

            onInterrupt();
        };

        document.addEventListener('pointerdown', handleOutsidePointerDown, true);
        return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    }, [onInterrupt, step]);

    useEffect(() => {
        if (lastNotifiedStepRef.current === step.id) return;
        lastNotifiedStepRef.current = step.id;
        onStepChange?.(step.id);
    }, [onStepChange, step.id]);

    useEffect(() => {
        const isMatchingAction = step.id === 'start-matching' && !isWorking;
        const isSwapExample = step.id === 'result-swap';
        if (!isMatchingAction && !isSwapExample) return;

        const actionTarget = getVisibleTarget(step);
        if (!actionTarget) return;

        const attribute = isMatchingAction
            ? 'data-guide-action-pulse'
            : 'data-guide-swap-active';
        actionTarget.setAttribute(attribute, 'true');
        return () => actionTarget.removeAttribute(attribute);
    }, [isWorking, step]);

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

                const nextLayout = measureGuideLayout(target, panel);
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
        const nextStep = steps[nextStepIndex];
        const nextTarget = nextStep ? getVisibleTarget(nextStep) : null;
        const panel = panelRef.current;

        if (nextStep && nextTarget && panel) {
            nextTarget.scrollIntoView({
                behavior: 'auto',
                block: 'center',
                inline: 'nearest',
            });
            setMeasuredLayout({
                layout: measureGuideLayout(nextTarget, panel),
                stepId: nextStep.id,
            });
        }

        setStepIndex(nextStepIndex);
    };

    return (
        <>
            {layout && (
                <>
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed inset-x-0 top-0 z-[70]"
                        style={{ height: layout.spotlight.top }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed left-0 z-[70]"
                        style={{
                            top: layout.spotlight.top,
                            width: layout.spotlight.left,
                            height: layout.spotlight.height,
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed right-0 z-[70]"
                        style={{
                            top: layout.spotlight.top,
                            left: layout.spotlight.right,
                            height: layout.spotlight.height,
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-scrim fixed inset-x-0 bottom-0 z-[70]"
                        style={{ top: layout.spotlight.bottom }}
                    />
                    <div
                        aria-hidden="true"
                        className="guide-spotlight fixed z-[80]"
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
                className="fixed left-0 top-0 z-[90] will-change-transform transition-transform duration-300 ease-out"
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
                    id="onboarding-guide"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby="onboarding-guide-title"
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
                                {variant === 'result' ? '결과 활용 가이드' : '참가자·팀 편성 가이드'} · {stepIndex + 1}/{steps.length}
                            </p>
                            <h2 id="onboarding-guide-title" className="mt-1 text-pretty text-base font-bold text-white sm:text-lg">
                                {step.title}
                            </h2>
                            <p className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-400">
                                {step.description}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onDismiss}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                            aria-label="매칭 가이드 닫기"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="mt-4 flex gap-1.5" aria-hidden="true">
                        {steps.map(({ title }, index) => (
                            <span
                                key={title}
                                className={`h-1 flex-1 rounded-full transition-colors ${
                                    index <= stepIndex ? 'bg-cyan-400' : 'bg-slate-700'
                                }`}
                            />
                        ))}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => handleStepIndexChange(stepIndex - 1)}
                            disabled={isFirstStep}
                            className="btn-ghost inline-flex min-h-9 items-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronLeft size={14} aria-hidden="true" />
                            이전
                        </button>
                        {isExternalActionStep ? (
                            <span
                                role="status"
                                className="inline-flex min-h-9 items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200"
                            >
                                {isWorking ? '팀 조합 계산 중…' : '강조된 버튼을 눌러주세요'}
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={isLastStep
                                    ? onComplete ?? onDismiss
                                    : () => handleStepIndexChange(stepIndex + 1)}
                                disabled={isLastStep && isWorking}
                                className="btn-primary inline-flex min-h-9 items-center gap-1 px-3 py-2 text-xs disabled:cursor-wait disabled:opacity-50"
                            >
                                {isLastStep && isWorking ? '계산 중…' : isLastStep ? '완료' : '다음'}
                                {!isLastStep && <ChevronRight size={14} aria-hidden="true" />}
                            </button>
                        )}
                    </div>
                </motion.aside>
            </div>
        </>
    );
};
