import { useEffect, useState } from 'react';
import { watchAppVersion } from '../utils/watch-app-version';

/**
 * @description 현재 화면을 사용하는 동안에만 새 배포를 확인하고 작업을 유지한 채 업데이트를 안내한다.
 */
export function useAppUpdateAvailable(): boolean {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;
        return watchAppVersion(__APP_VERSION__, () => setIsUpdateAvailable(true));
    }, []);

    return isUpdateAvailable;
}
