import type { Dispatch, SetStateAction } from 'react';
import type { MatchResultData, SwapSource } from '#domain/balance';
import type { Player } from '#domain/player';
import type { RosterImportMode } from '../../utils/player';
import type { UserSheetSnapshot } from '../../utils/user-sheet';

export interface RosterDetailedError {
    title: string;
    description: string;
    hint?: string;
    items?: string[];
}

export interface RosterMatchState {
    alternatives: MatchResultData[];
    players: Player[];
    result: MatchResultData | null;
    setAlternatives: Dispatch<SetStateAction<MatchResultData[]>>;
    setPlayers: Dispatch<SetStateAction<Player[]>>;
    setResult: Dispatch<SetStateAction<MatchResultData | null>>;
}

export interface RosterUserSheetState {
    sheetVersion: number;
    updateSnapshot: (snapshot: UserSheetSnapshot) => void;
}

export interface RosterIdentityResolution {
    mode: RosterImportMode;
    players: Player[];
    syncTierPlayerIds: number[];
}

export interface PendingIdentityImport {
    failedLines: string[];
    incoming: Player[];
}

export interface UseRosterManagementOptions {
    csrfToken: string;
    match: RosterMatchState;
    onPlayerEditCompleted: () => void;
    onRosterCompleted: () => void;
    setSwapSource: Dispatch<SetStateAction<SwapSource | null>>;
    showDetailedError: (message: string, details: RosterDetailedError) => void;
    userSheet: RosterUserSheetState;
}
