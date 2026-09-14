import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getErrorMessage } from '../utils/api';
import {
    fetchUserSheet,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../utils/user-sheet';

const USER_SHEET_SELECTION_KEY = 'owkr_user_sheet_selection';
const LEGACY_USER_SHEET_MODAL_KEY = 'owkr_user_sheet_modal';
const USER_SHEET_REFRESH_INTERVAL_MS = 60_000;

interface StoredUserSheetSelection {
    battleTag?: string;
    entryId?: string;
}

const readStoredSelection = (): StoredUserSheetSelection => {
    try {
        const value = sessionStorage.getItem(USER_SHEET_SELECTION_KEY)
            ?? sessionStorage.getItem(LEGACY_USER_SHEET_MODAL_KEY);
        if (!value) return {};
        const parsed = JSON.parse(value) as Partial<StoredUserSheetSelection>;
        return {
            battleTag: typeof parsed.battleTag === 'string' ? parsed.battleTag : undefined,
            entryId: typeof parsed.entryId === 'string' ? parsed.entryId : undefined,
        };
    } catch {
        return {};
    }
};

/**
 * @description 공유 유저 시트의 로딩·재검증과 페이지에서 이어 볼 선택 항목을 관리한다.
 */
export const useUserSheet = (isActive = false) => {
    const [storedSelection] = useState(readStoredSelection);
    const [entries, setEntries] = useState<UserSheetEntry[]>([]);
    const [sheetVersion, setSheetVersion] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedBattleTag, setSelectedBattleTag] = useState<string | undefined>(
        storedSelection.battleTag,
    );
    const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(
        storedSelection.entryId,
    );
    const requestIdRef = useRef(0);

    const load = useCallback(async (showLoading: boolean) => {
        const requestId = ++requestIdRef.current;
        if (showLoading) setIsLoading(true);
        try {
            const snapshot = await fetchUserSheet();
            if (requestId !== requestIdRef.current) return;
            setEntries(snapshot.entries);
            setSheetVersion(snapshot.sheetVersion);
            setError(null);
        } catch (loadError) {
            if (requestId !== requestIdRef.current) return;
            setError(getErrorMessage(loadError, '유저 시트를 불러오지 못했습니다.'));
            if (loadError instanceof ApiError && loadError.status === 401) {
                window.location.reload();
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    const retry = useCallback(async () => load(true), [load]);
    const revalidate = useCallback(async () => load(false), [load]);

    useEffect(() => {
        void retry();
        return () => {
            requestIdRef.current += 1;
        };
    }, [retry]);

    useEffect(() => {
        if (!isActive) return;

        const refreshVisibleSheet = () => {
            if (document.visibilityState === 'visible') void revalidate();
        };
        void revalidate();
        const intervalId = window.setInterval(
            refreshVisibleSheet,
            USER_SHEET_REFRESH_INTERVAL_MS,
        );
        window.addEventListener('focus', refreshVisibleSheet);
        document.addEventListener('visibilitychange', refreshVisibleSheet);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', refreshVisibleSheet);
            document.removeEventListener('visibilitychange', refreshVisibleSheet);
        };
    }, [isActive, revalidate]);

    const select = useCallback((battleTag?: string, entryId?: string) => {
        const selection = { battleTag, entryId } satisfies StoredUserSheetSelection;
        try {
            sessionStorage.setItem(USER_SHEET_SELECTION_KEY, JSON.stringify(selection));
            sessionStorage.removeItem(LEGACY_USER_SHEET_MODAL_KEY);
        } catch {
            // 저장소가 차단돼도 현재 화면의 선택 상태는 유지한다.
        }
        setSelectedBattleTag(battleTag);
        setSelectedEntryId(entryId);
    }, []);

    const updateSnapshot = useCallback((snapshot: UserSheetSnapshot) => {
        setEntries(snapshot.entries);
        setSheetVersion(snapshot.sheetVersion);
        setError(null);
    }, []);

    return {
        entries,
        error,
        isLoading,
        revalidate,
        retry,
        select,
        selectedBattleTag,
        selectedEntryId,
        sheetVersion,
        updateSnapshot,
    };
};
