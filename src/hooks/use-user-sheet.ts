import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
export const useUserSheet = (cacheScope: string, isActive = false) => {
    const [storedSelection] = useState(readStoredSelection);
    const [selectedBattleTag, setSelectedBattleTag] = useState<string | undefined>(
        storedSelection.battleTag,
    );
    const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>(
        storedSelection.entryId,
    );
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['user-sheet', cacheScope] as const, [cacheScope]);
    const query = useQuery({
        queryKey,
        queryFn: fetchUserSheet,
        refetchInterval: isActive ? USER_SHEET_REFRESH_INTERVAL_MS : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: isActive,
    });

    useEffect(() => {
        if (query.error instanceof ApiError && query.error.status === 401) {
            window.location.reload();
        }
    }, [query.error]);

    const retry = query.refetch;

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
        queryClient.setQueryData(queryKey, snapshot);
    }, [queryClient, queryKey]);

    const snapshot = query.data;

    return {
        entries: snapshot?.entries ?? [] satisfies UserSheetEntry[],
        error: query.error
            ? getErrorMessage(query.error, '유저 시트를 불러오지 못했습니다.')
            : null,
        isLoading: query.isPending,
        isRefreshing: query.isFetching && !query.isPending,
        retry,
        select,
        selectedBattleTag,
        selectedEntryId,
        sheetVersion: snapshot?.sheetVersion ?? 0,
        updateSnapshot,
    };
};
