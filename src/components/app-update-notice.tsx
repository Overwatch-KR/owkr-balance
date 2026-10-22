import { useEffect, useState } from 'react';
import { useAppUpdateAvailable } from '../hooks/use-app-update-available';
import { UpdateAvailableNotice } from './update-available-notice';

export const APP_UPDATE_AVAILABLE_EVENT = 'owkr:app-update-available';

interface AppUpdateNoticeProps {
    forceVisible?: boolean;
}

/**
 * @description 업데이트 안내는 초기 번들에 포함해 이전 배포의 청크가 사라져도 복구 조작을 표시한다.
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
        <UpdateAvailableNotice
            onDismiss={() => setIsDismissed(true)}
            onReload={() => window.location.reload()}
        />
    );
}
