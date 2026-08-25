import { lazy, Suspense, useEffect, useState } from 'react';
import { useAppUpdateAvailable } from '../hooks/use-app-update-available';

export const APP_UPDATE_AVAILABLE_EVENT = 'owkr:app-update-available';

const UpdateAvailableNotice = lazy(() => import('./update-available-notice').then(module => ({
    default: module.UpdateAvailableNotice,
})));

interface AppUpdateNoticeProps {
    forceVisible?: boolean;
}

/**
 * @description 앱 전역에서 새 배포본 감지 상태를 관리하고 필요할 때만 업데이트 안내 UI를 불러온다.
 */
export function AppUpdateNotice({ forceVisible = false }: AppUpdateNoticeProps) {
    const isUpdateAvailable = useAppUpdateAvailable();
    const [isRecoveryUpdateAvailable, setIsRecoveryUpdateAvailable] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        const showUpdateNotice = () => setIsRecoveryUpdateAvailable(true);
        window.addEventListener(APP_UPDATE_AVAILABLE_EVENT, showUpdateNotice);
        return () => window.removeEventListener(APP_UPDATE_AVAILABLE_EVENT, showUpdateNotice);
    }, []);

    if ((!forceVisible && !isUpdateAvailable && !isRecoveryUpdateAvailable) || isDismissed) return null;

    return (
        <Suspense fallback={null}>
            <UpdateAvailableNotice
                onDismiss={() => setIsDismissed(true)}
                onReload={() => window.location.reload()}
            />
        </Suspense>
    );
}
