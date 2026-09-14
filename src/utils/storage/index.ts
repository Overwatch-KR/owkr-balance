/**
 * @description 만료 시간을 포함해 localStorage를 읽고 쓰는 유틸리티.
 */

interface StorageItem<T> {
    data: T;
    expiry: number;
    storedAt?: number;
    version?: 2;
}

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const LEGACY_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * @description 데이터와 만료 시점을 함께 저장한다.
 * @param key - 저장 키
 * @param data - 저장할 데이터
 * @param expiryMs - 만료 시간 (밀리초, 기본값: 24시간)
 */
export const setWithExpiry = <T>(key: string, data: T, expiryMs: number = DEFAULT_EXPIRY_MS): void => {
    const storedAt = Date.now();
    const item: StorageItem<T> = {
        data,
        expiry: storedAt + expiryMs,
        storedAt,
        version: 2,
    };
    localStorage.setItem(key, JSON.stringify(item));
};

/**
 * @description 만료 여부를 확인하면서 저장된 데이터를 읽는다.
 * @param key - 저장 키
 * @param maxAgeMs - 기존 저장값에도 적용할 최대 보관 시간
 * @returns 데이터 또는 만료/없음 시 null
 */
export const getWithExpiry = <T>(key: string, maxAgeMs?: number): T | null => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;

    try {
        const item = JSON.parse(itemStr) as StorageItem<T>;
        const now = Date.now();
        const legacyStoredAt = Number.isFinite(item.expiry)
            ? item.expiry - LEGACY_DEFAULT_EXPIRY_MS
            : null;
        const storedAt = typeof item.storedAt === 'number'
            ? item.storedAt
            : legacyStoredAt;
        const isPastMaximumAge = typeof maxAgeMs === 'number'
            && storedAt !== null
            && now > storedAt + maxAgeMs;
        if (!Number.isFinite(item.expiry) || now > item.expiry || isPastMaximumAge) {
            localStorage.removeItem(key);
            return null;
        }

        return item.data;
    } catch {
        localStorage.removeItem(key);
        return null;
    }
};

/**
 * @description 지정 키의 항목을 삭제한다.
 * @param key - 삭제할 키
 */
export const removeItem = (key: string): void => {
    localStorage.removeItem(key);
};

/**
 * @description 알려진 키들을 순회하며 만료된 항목을 제거한다.
 */
export const cleanupExpired = (): void => {
    const knownPrefixes = [
        'owkr_players',
        'owkr_result',
        'owkr_participant_mentions',
        'owkr_guide_progress',
        'owkr_match_live_session',
        'owkr_match_share_created',
        'owkr_match_share_import',
    ] as const;
    const keysToCheck = Array.from(
        { length: localStorage.length },
        (_, index) => localStorage.key(index),
    ).filter((key): key is string => (
        key !== null && knownPrefixes.some(prefix => key.startsWith(prefix))
    ));

    keysToCheck.forEach(key => {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return;

        try {
            const item = JSON.parse(itemStr) as Partial<StorageItem<unknown>>;
            if (item.expiry && Date.now() > item.expiry) {
                localStorage.removeItem(key);
            }
        } catch {
            localStorage.removeItem(key);
        }
    });
};
