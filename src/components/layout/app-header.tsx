import { useEffect } from 'react';
import {
    NAVIGATION_STATE_EVENT,
    OPEN_GUIDE_EVENT,
    PENDING_NAVIGATION_ACTION_KEY,
    type AppNavigationStateDetail,
} from './app-navigation-shell';

interface AppHeaderProps {
    isGuideOpen: boolean;
    onOpenGuide: () => void;
    userSheetHasError: boolean;
}

/**
 * @description 전역 Navigation Shell과 매칭 가이드 상태를 연결하고 유저 시트 오류 상태를 전달한다.
 */
export function AppHeader({
    isGuideOpen,
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
                userSheetHasError,
            },
        }));
    }, [isGuideOpen, userSheetHasError]);

    return null;
}
