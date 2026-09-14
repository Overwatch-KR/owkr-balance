import { useEffect } from 'react';
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
    liveSessionCode,
    liveSyncError,
    onOpenGuide,
    userSheetHasError,
}: AppHeaderProps) {
    useEffect(() => {
        const openGuide = () => {
            if (!isGuideOpen) onOpenGuide();
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
    }, [isGuideOpen, onOpenGuide]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent<AppNavigationStateDetail>(NAVIGATION_STATE_EVENT, {
            detail: {
                isGuideOpen,
                isLiveConnected,
                isLivePublishing,
                liveSessionCode,
                liveSyncError,
                userSheetHasError,
            },
        }));
    }, [
        isGuideOpen,
        isLiveConnected,
        isLivePublishing,
        liveSessionCode,
        liveSyncError,
        userSheetHasError,
    ]);

    return null;
}
