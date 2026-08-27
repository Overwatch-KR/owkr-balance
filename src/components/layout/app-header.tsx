import { useEffect } from 'react';
import type { AuthMode, DataMode } from '../../hooks/use-auth';
import {
    NAVIGATION_STATE_EVENT,
    OPEN_GUIDE_EVENT,
    OPEN_USER_SHEET_EVENT,
    PENDING_NAVIGATION_ACTION_KEY,
    type AppNavigationStateDetail,
} from './app-navigation-shell';

interface AppHeaderProps {
    authMode: AuthMode;
    dataMode: DataMode;
    isGuideOpen: boolean;
    isLoggingOut: boolean;
    isUserSheetOpen: boolean;
    onLogout: () => void;
    onOpenEventParticipants: () => void;
    onOpenScrims: () => void;
    onOpenGuide: () => void;
    onOpenUserSheet: () => void;
    userName: string;
    userSheetHasError: boolean;
}

/**
 * @description 전역 Navigation Shell과 매칭 화면의 모달·가이드 동작을 연결한다.
 */
export function AppHeader({
    isGuideOpen,
    isUserSheetOpen,
    onOpenGuide,
    onOpenUserSheet,
    userSheetHasError,
}: AppHeaderProps) {
    useEffect(() => {
        const openGuide = () => {
            if (!isGuideOpen) onOpenGuide();
        };
        const openUserSheet = () => {
            if (!isUserSheetOpen) onOpenUserSheet();
        };

        window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
        window.addEventListener(OPEN_USER_SHEET_EVENT, openUserSheet);

        try {
            const pendingAction = sessionStorage.getItem(PENDING_NAVIGATION_ACTION_KEY);
            if (pendingAction === 'guide' || pendingAction === 'user-sheet') {
                sessionStorage.removeItem(PENDING_NAVIGATION_ACTION_KEY);
                window.queueMicrotask(pendingAction === 'guide' ? openGuide : openUserSheet);
            }
        } catch {
            // 세션 저장소를 사용할 수 없는 환경에서는 직접 호출 이벤트만 사용한다.
        }

        return () => {
            window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
            window.removeEventListener(OPEN_USER_SHEET_EVENT, openUserSheet);
        };
    }, [isGuideOpen, isUserSheetOpen, onOpenGuide, onOpenUserSheet]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent<AppNavigationStateDetail>(NAVIGATION_STATE_EVENT, {
            detail: {
                isGuideOpen,
                isUserSheetOpen,
                userSheetHasError,
            },
        }));
    }, [isGuideOpen, isUserSheetOpen, userSheetHasError]);

    return null;
}
