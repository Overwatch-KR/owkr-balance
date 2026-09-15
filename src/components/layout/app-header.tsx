import { useEffect, useRef } from 'react';
import type { MatchLiveCollaborator, MatchLiveRecentChange } from '#domain/balance';
import {
    NAVIGATION_STATE_EVENT,
    OPEN_GUIDE_EVENT,
    PENDING_NAVIGATION_ACTION_KEY,
    type AppNavigationStateDetail,
} from './app-navigation-shell';

interface AppHeaderProps {
    isGuideOpen: boolean;
    isLiveConnected: boolean;
    isLivePublishing: boolean;
    liveCollaborators: MatchLiveCollaborator[];
    liveRecentChange: MatchLiveRecentChange | null;
    liveSessionCode?: string;
    liveSyncError: string;
    onOpenGuide: () => void;
    userSheetHasError: boolean;
}

/**
 * @description 전역 내비게이션과 대진표 사용법 상태를 연결하고 공동 작업 상태를 전달한다.
 */
export function AppHeader({
    isGuideOpen,
    isLiveConnected,
    isLivePublishing,
    liveCollaborators,
    liveRecentChange,
    liveSessionCode,
    liveSyncError,
    onOpenGuide,
    userSheetHasError,
}: AppHeaderProps) {
    const isGuideOpenRef = useRef(isGuideOpen);
    const onOpenGuideRef = useRef(onOpenGuide);

    useEffect(() => {
        isGuideOpenRef.current = isGuideOpen;
        onOpenGuideRef.current = onOpenGuide;
    }, [isGuideOpen, onOpenGuide]);

    useEffect(() => {
        const openGuide = () => {
            try {
                if (sessionStorage.getItem(PENDING_NAVIGATION_ACTION_KEY) === 'guide') {
                    sessionStorage.removeItem(PENDING_NAVIGATION_ACTION_KEY);
                }
            } catch {
                // 저장소를 사용할 수 없는 환경에서도 직접 호출 이벤트는 처리한다.
            }
            if (!isGuideOpenRef.current) onOpenGuideRef.current();
        };
        window.addEventListener(OPEN_GUIDE_EVENT, openGuide);

        try {
            const pendingAction = sessionStorage.getItem(PENDING_NAVIGATION_ACTION_KEY);
            if (pendingAction === 'guide') {
                sessionStorage.removeItem(PENDING_NAVIGATION_ACTION_KEY);
                window.queueMicrotask(openGuide);
            }
        } catch {
            // 세션 저장소를 사용할 수 없는 환경에서는 직접 호출 이벤트만 사용한다.
        }

        return () => {
            window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
        };
    }, []);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent<AppNavigationStateDetail>(NAVIGATION_STATE_EVENT, {
            detail: {
                isGuideOpen,
                isLiveConnected,
                isLivePublishing,
                liveCollaborators,
                liveRecentChange,
                liveSessionCode,
                liveSyncError,
                userSheetHasError,
            },
        }));
    }, [
        isGuideOpen,
        isLiveConnected,
        isLivePublishing,
        liveCollaborators,
        liveRecentChange,
        liveSessionCode,
        liveSyncError,
        userSheetHasError,
    ]);

    return null;
}
