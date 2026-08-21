import { lazy, Suspense, useState } from 'react';
import { useAppUpdateAvailable } from '../hooks/use-app-update-available';

const UpdateAvailableNotice = lazy(() => import('./update-available-notice').then(module => ({
    default: module.UpdateAvailableNotice,
})));

/**
 * @description 앱 전역에서 새 배포본 감지 상태를 관리하고 필요할 때만 업데이트 안내 UI를 불러온다.
 */
export function AppUpdateNotice() {
    const isUpdateAvailable = useAppUpdateAvailable();
    const [isDismissed, setIsDismissed] = useState(false);

    if (!isUpdateAvailable || isDismissed) return null;

    return (
        <Suspense fallback={null}>
            <UpdateAvailableNotice
                onDismiss={() => setIsDismissed(true)}
                onReload={() => window.location.reload()}
            />
        </Suspense>
    );
}
