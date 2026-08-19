import { useCallback, useEffect, useRef, useState } from 'react';
import {
    canResumeGuide,
    getGuideVariant,
    isValidGuideProgress,
} from '../utils/guide-progress';
import type {
    GuideProgress,
    GuideStepId,
    GuideVariant,
} from '../utils/guide-progress';
import { getWithExpiry, removeItem, setWithExpiry } from '../utils/storage';
import type { PlayerInputMode } from './use-player-input';

const GUIDE_PROGRESS_STORAGE_KEY = 'owkr_guide_progress';
const GUIDE_PROGRESS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const SWAP_GUIDE_DELAY_MS = 650;

type GuideDisplayState = 'closed' | 'resume-prompt' | 'open';

interface UseOnboardingGuideOptions {
    alternativeCount: number;
    hasResult: boolean;
    onApplyAlternative: () => void;
    onPrepareOpen: () => void;
    onSelectInputMode: (mode: PlayerInputMode) => void;
    onSwapExample: () => void;
    onUseExampleRoster: () => void;
    playerCount: number;
}

const loadGuideProgress = (): GuideProgress | null => {
    const savedProgress = getWithExpiry<unknown>(GUIDE_PROGRESS_STORAGE_KEY);
    if (isValidGuideProgress(savedProgress)) return savedProgress;

    if (savedProgress !== null) removeItem(GUIDE_PROGRESS_STORAGE_KEY);
    return null;
};

/**
 * @description 가이드 열림 상태와 단계별 자동 동작을 앱의 도메인 로직에 연결한다.
 */
export const useOnboardingGuide = ({
    alternativeCount,
    hasResult,
    onApplyAlternative,
    onPrepareOpen,
    onSelectInputMode,
    onSwapExample,
    onUseExampleRoster,
    playerCount,
}: UseOnboardingGuideOptions) => {
    const [displayState, setDisplayState] = useState<GuideDisplayState>('closed');
    const [initialGuideStep, setInitialGuideStep] = useState<GuideStepId | null>(null);
    const [savedProgress, setSavedProgress] = useState<GuideProgress | null>(loadGuideProgress);
    const automatedStepsRef = useRef(new Set<GuideStepId>());
    const swapTimerRef = useRef<number | null>(null);
    const currentVariant: GuideVariant = hasResult ? 'result' : 'start';
    const resumableProgress = canResumeGuide(savedProgress, currentVariant)
        ? savedProgress
        : null;
    const isGuideOpen = displayState === 'open';
    const isGuideResumePromptOpen = displayState === 'resume-prompt';
    const activeGuide: GuideVariant | null = isGuideOpen
        ? currentVariant
        : null;

    const clearPendingSwap = useCallback(() => {
        if (swapTimerRef.current === null) return;
        window.clearTimeout(swapTimerRef.current);
        swapTimerRef.current = null;
    }, []);

    useEffect(() => clearPendingSwap, [clearPendingSwap]);

    const dismissGuide = useCallback(() => {
        clearPendingSwap();
        setDisplayState('closed');
    }, [clearPendingSwap]);

    const openGuide = useCallback((stepId: GuideStepId | null) => {
        clearPendingSwap();
        automatedStepsRef.current.clear();
        setInitialGuideStep(stepId);
        onPrepareOpen();
        setDisplayState('open');
    }, [clearPendingSwap, onPrepareOpen]);

    const toggleGuide = useCallback(() => {
        if (displayState !== 'closed') {
            clearPendingSwap();
            setDisplayState('closed');
            return;
        }

        if (resumableProgress) {
            setDisplayState('resume-prompt');
            return;
        }

        openGuide(null);
    }, [clearPendingSwap, displayState, openGuide, resumableProgress]);

    const resumeGuide = useCallback(() => {
        openGuide(resumableProgress?.stepId ?? null);
    }, [openGuide, resumableProgress]);

    const restartGuide = useCallback(() => {
        removeItem(GUIDE_PROGRESS_STORAGE_KEY);
        setSavedProgress(null);
        openGuide(null);
    }, [openGuide]);

    const completeGuide = useCallback(() => {
        clearPendingSwap();
        removeItem(GUIDE_PROGRESS_STORAGE_KEY);
        setSavedProgress(null);
        setDisplayState('closed');
    }, [clearPendingSwap]);

    const handleGuideStepChange = useCallback((step: GuideStepId) => {
        clearPendingSwap();
        const progress: GuideProgress = {
            stepId: step,
            variant: getGuideVariant(step),
            version: 2,
        };
        setWithExpiry(
            GUIDE_PROGRESS_STORAGE_KEY,
            progress,
            GUIDE_PROGRESS_EXPIRY_MS,
        );
        setSavedProgress(progress);

        if (step === 'start-discord') {
            onSelectInputMode('discord');
            return;
        }
        if (step === 'start-manual') {
            onSelectInputMode('manual');
            return;
        }
        if (step === 'start-mentions') {
            onSelectInputMode('mentions');
            return;
        }
        if (automatedStepsRef.current.has(step)) return;

        if (step === 'start-roster' && playerCount === 0) {
            automatedStepsRef.current.add(step);
            onUseExampleRoster();
            return;
        }
        if (step === 'result-alternatives' && alternativeCount > 0) {
            automatedStepsRef.current.add(step);
            onApplyAlternative();
            return;
        }
        if (step === 'result-swap' && hasResult) {
            automatedStepsRef.current.add(step);
            swapTimerRef.current = window.setTimeout(() => {
                swapTimerRef.current = null;
                onSwapExample();
            }, SWAP_GUIDE_DELAY_MS);
        }
    }, [
        alternativeCount,
        clearPendingSwap,
        hasResult,
        onApplyAlternative,
        onSelectInputMode,
        onSwapExample,
        onUseExampleRoster,
        playerCount,
    ]);

    return {
        activeGuide,
        completeGuide,
        dismissGuide,
        handleGuideStepChange,
        initialGuideStep,
        isGuideOpen,
        isGuideResumePromptOpen,
        restartGuide,
        resumableProgress,
        resumeGuide,
        toggleGuide,
    };
};
