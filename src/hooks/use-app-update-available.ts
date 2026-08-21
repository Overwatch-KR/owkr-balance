import { useEffect, useState } from 'react';

const UPDATE_CHECK_INTERVAL_MS = 60_000;

interface VersionResponse {
    version?: unknown;
}

/**
 * @description 배포 버전 파일을 주기적으로 확인해 현재 실행 중인 앱보다 새로운 빌드를 감지한다.
 */
export function useAppUpdateAvailable(): boolean {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;

        let hasDetectedUpdate = false;
        let isChecking = false;

        const checkForUpdate = async () => {
            if (hasDetectedUpdate || isChecking) return;
            isChecking = true;
            try {
                const versionUrl = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
                const response = await fetch(versionUrl, { cache: 'no-store' });
                if (!response.ok) return;
                const result = await response.json() as VersionResponse;
                if (typeof result.version === 'string' && result.version !== __APP_VERSION__) {
                    hasDetectedUpdate = true;
                    setIsUpdateAvailable(true);
                }
            } catch {
                // 다음 확인 주기에 다시 시도한다.
            } finally {
                isChecking = false;
            }
        };

        const checkWhenVisible = () => {
            if (document.visibilityState === 'visible') void checkForUpdate();
        };

        void checkForUpdate();
        const intervalId = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', checkWhenVisible);
        window.addEventListener('focus', checkForUpdate);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', checkWhenVisible);
            window.removeEventListener('focus', checkForUpdate);
        };
    }, []);

    return isUpdateAvailable;
}
